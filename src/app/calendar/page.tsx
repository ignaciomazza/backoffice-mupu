// src/app/calendar/page.tsx
"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import { EventInput, EventApi, EventContentArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { DateClickArg } from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Spinner from "@/components/Spinner";
import ProtectedRoute from "@/components/ProtectedRoute";
import { authFetch } from "@/utils/authFetch";
import { formatDateInBuenosAires } from "@/lib/buenosAiresDate";

type ClientStatus = "Todas" | "Pendiente" | "Pago" | "Facturado";
type ViewOption = "dayGridMonth" | "dayGridWeek" | "dayGridDay";
type NoteMode = "create" | "view" | "edit";
type FilterMode = "bookings" | "services";
type DetailMode = "name" | "detail";

interface User {
  id_user: number;
  first_name: string;
  last_name: string;
  role: string;
  id_agency: number;
}

interface SalesTeam {
  id_team: number;
  name: string;
  user_teams: { user: User }[];
}

interface CalendarEvent extends EventInput {
  extendedProps?: {
    kind?: "booking" | "service" | "note";
    content?: string;
    creator?: string;
    bookingPublicId?: number | string;
    bookingId?: number;
    details?: string;
    paxCount?: number;
    clientStatus?: string;
    status?: string;
    servicesCount?: number;
    returnDate?: string | Date;
    serviceType?: string;
    destination?: string;
    reference?: string;
    description?: string;
    note?: string;
  };
}

interface NoteModalData {
  open: boolean;
  mode: NoteMode;
  id?: number;
  date: string;
  title: string;
  content: string;
  creator: string;
}

export default function CalendarPage() {
  const { token, role } = useAuth();
  const router = useRouter();
  const calendarRef = useRef<FullCalendar>(null);
  const [calendarTitle, setCalendarTitle] = useState("");
  const [calendarYear, setCalendarYear] = useState("");

  const [profile, setProfile] = useState<User | null>(null);
  const [vendors, setVendors] = useState<User[]>([]);
  const [salesTeams, setSalesTeams] = useState<SalesTeam[]>([]);
  const [vendorInput, setVendorInput] = useState("");
  const [selectedVendor, setSelectedVendor] = useState(0);
  const [selectedClientStatus, setSelectedClientStatus] =
    useState<ClientStatus>("Todas");
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });
  const [currentView, setCurrentView] = useState<ViewOption>("dayGridMonth");
  const [filterMode, setFilterMode] = useState<FilterMode>("bookings");
  const [detailMode, setDetailMode] = useState<DetailMode>("name");

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingNote, setLoadingNote] = useState(false);

  const [noteModal, setNoteModal] = useState<NoteModalData>({
    open: false,
    mode: "create",
    date: "",
    title: "",
    content: "",
    creator: "",
  });

  const [form, setForm] = useState<{ title: string; content: string }>({
    title: "",
    content: "",
  });

  const clientStatusOptions: ClientStatus[] = [
    "Todas",
    "Pendiente",
    "Pago",
    "Facturado",
  ];

  // Perfil + vendors + teams
  useEffect(() => {
    if (!token) return;
    setLoadingEvents(true);

    (async () => {
      try {
        const rProfile = await authFetch(
          "/api/user/profile",
          { cache: "no-store" },
          token,
        );
        if (!rProfile.ok) throw new Error("Error al obtener perfil");
        const p = (await rProfile.json()) as User;
        setProfile(p);

        const [rUsers, rTeams] = await Promise.all([
          authFetch(
            `/api/users?agencyId=${p.id_agency}`,
            { cache: "no-store" },
            token,
          ),
          authFetch(
            `/api/teams?agencyId=${p.id_agency}`,
            { cache: "no-store" },
            token,
          ),
        ]);
        if (!rUsers.ok) throw new Error("Error al obtener vendedores");
        if (!rTeams.ok) throw new Error("Error al obtener equipos");

        const [users, teams] = (await Promise.all([
          rUsers.json(),
          rTeams.json(),
        ])) as [User[], SalesTeam[]];

        setVendors(users);
        setSalesTeams(teams);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingEvents(false);
      }
    })();
  }, [token]);

  // Vendedores permitidos según rol
  const allowedVendors = useMemo(() => {
    if (!profile) return [];
    if (profile.role === "vendedor") {
      return vendors.filter((u) => u.id_user === profile.id_user);
    }
    if (profile.role === "lider") {
      const mine = salesTeams.filter((t) =>
        t.user_teams.some(
          (ut) =>
            ut.user.id_user === profile.id_user && ut.user.role === "lider",
        ),
      );
      const members = Array.from(
        new Map(
          mine
            .flatMap((t) => t.user_teams.map((ut) => ut.user))
            .map((u) => [u.id_user, u]),
        ).values(),
      );
      const self = vendors.find((u) => u.id_user === profile.id_user);
      return self
        ? [self, ...members.filter((m) => m.id_user !== self.id_user)]
        : members;
    }
    return vendors;
  }, [profile, vendors, salesTeams]);

  // Autocompletar -> id de vendedor
  useEffect(() => {
    const match = allowedVendors.find(
      (u) => `${u.first_name} ${u.last_name}` === vendorInput,
    );
    setSelectedVendor(match ? match.id_user : 0);
  }, [vendorInput, allowedVendors]);

  // Cargar eventos de calendario
  useEffect(() => {
    if (!token || !profile) return;

    const qs = new URLSearchParams();
    if (profile.role === "vendedor") {
      qs.append("userId", String(profile.id_user));
    } else if (profile.role === "lider") {
      const ids = selectedVendor
        ? [selectedVendor]
        : allowedVendors.map((u) => u.id_user);
      qs.append("userIds", ids.join(","));
    } else if (selectedVendor) {
      qs.append("userId", String(selectedVendor));
    }

    if (selectedClientStatus !== "Todas") {
      qs.append("clientStatus", selectedClientStatus);
    }
    if (dateRange.from) qs.append("from", dateRange.from);
    if (dateRange.to) qs.append("to", dateRange.to);
    if (filterMode === "services") qs.append("mode", "services");

    setLoadingEvents(true);
    authFetch(`/api/calendar?${qs.toString()}`, { cache: "no-store" }, token)
      .then((r) => r.json() as Promise<CalendarEvent[]>)
      .then((data) => {
        const normalized = data.map((ev) => ({
          ...ev,
          allDay: true,
          extendedProps: {
            ...ev.extendedProps,
            kind:
              ev.extendedProps?.kind ??
              (String(ev.id).startsWith("n-")
                ? "note"
                : String(ev.id).startsWith("s-")
                  ? "service"
                  : "booking"),
          },
        }));
        setEvents(normalized);
      })
      .catch(console.error)
      .finally(() => setLoadingEvents(false));
  }, [
    token,
    profile,
    selectedVendor,
    selectedClientStatus,
    dateRange,
    allowedVendors,
    filterMode,
  ]);

  const handleViewChange = (view: ViewOption) => {
    calendarRef.current?.getApi().changeView(view);
    setCurrentView(view);
  };

  const getEventKind = (event: EventApi) => {
    const kind = (event.extendedProps as CalendarEvent["extendedProps"])?.kind;
    if (kind) return kind;
    if (event.id.startsWith("n-")) return "note";
    if (event.id.startsWith("s-")) return "service";
    return "booking";
  };

  const getBookingRouteId = (event: EventApi) => {
    const props = event.extendedProps as CalendarEvent["extendedProps"];
    return props?.bookingPublicId ?? props?.bookingId ?? event.id.slice(2);
  };

  const handleEventDidMount = ({
    event,
    el,
  }: {
    event: EventApi;
    el: HTMLElement;
  }) => {
    const kind = getEventKind(event);
    const props = event.extendedProps as CalendarEvent["extendedProps"];
    const tooltip =
      kind === "note"
        ? `Nota: ${event.title}`
        : kind === "service"
          ? [
              event.title,
              props?.serviceType && `Servicio: ${props.serviceType}`,
              props?.destination && `Destino: ${props.destination}`,
              props?.description && `Detalle: ${props.description}`,
              props?.reference && `Ref: ${props.reference}`,
            ]
              .filter(Boolean)
              .join(" · ")
          : [
              event.title,
              props?.details && `Detalle: ${props.details}`,
              props?.paxCount != null && `Pax: ${props.paxCount}`,
              props?.servicesCount != null &&
                `Servicios: ${props.servicesCount}`,
            ]
              .filter(Boolean)
              .join(" · ");
    el.setAttribute("title", tooltip);
    el.style.cursor = "pointer";
  };

  const handleEventClick = ({ event }: { event: EventApi }) => {
    const kind = getEventKind(event);
    if (kind === "note") {
      const id = Number(event.id.slice(2));
      const { content, creator } = event.extendedProps as {
        content?: string;
        creator?: string;
      };
      setNoteModal({
        open: true,
        mode: "view",
        id,
        date: event.startStr,
        title: event.title,
        content: content ?? "",
        creator: creator ?? "",
      });
      return;
    }

    const bookingId = getBookingRouteId(event);
    router.push(`/bookings/services/${bookingId}`);
  };

  const handleDateClick = (arg: DateClickArg) => {
    if (["gerente", "administrativo", "desarrollador"].includes(role!)) {
      setNoteModal({
        open: true,
        mode: "create",
        date: arg.dateStr,
        title: "",
        content: "",
        creator: "",
      });
    }
  };

  // Crear nota
  const submitNote = async () => {
    if (!form.title.trim()) {
      alert("El título es obligatorio");
      return;
    }

    setLoadingNote(true);
    try {
      const res = await authFetch(
        "/api/calendar/notes",
        {
          method: "POST",
          body: JSON.stringify({
            title: form.title.trim(),
            content: form.content.trim(),
            date: noteModal.date,
          }),
        },
        token,
      );

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Error al crear la nota");
        return;
      }

      const newNote = await res.json();
      setEvents((prev) => [
        ...prev,
        {
          id: `n-${newNote.id}`,
          title: `${newNote.title}`,
          start: newNote.date,
          allDay: true,
          extendedProps: {
            kind: "note",
            content: newNote.content,
            creator: `${profile!.first_name} ${profile!.last_name}`,
          },
        },
      ]);
      setNoteModal((m) => ({ ...m, open: false }));
      setForm({ title: "", content: "" });
    } catch {
      alert("Ocurrió un error al crear la nota");
    } finally {
      setLoadingNote(false);
    }
  };

  // Eliminar nota
  const deleteNote = async (id: number) => {
    if (!confirm("¿Seguro que querés eliminar esta nota?")) return;

    setLoadingNote(true);
    try {
      const res = await authFetch(
        `/api/calendar/${id}`,
        { method: "DELETE" },
        token,
      );

      if (res.status === 204) {
        setEvents((e) => e.filter((ev) => ev.id !== `n-${id}`));
        setNoteModal((m) => ({ ...m, open: false }));
      } else {
        alert("Error al eliminar");
      }
    } catch {
      alert("Ocurrió un error al eliminar la nota");
    } finally {
      setLoadingNote(false);
    }
  };

  // Actualizar nota
  const updateNote = async () => {
    if (!noteModal.id) return;

    setLoadingNote(true);
    try {
      const res = await authFetch(
        `/api/calendar/${noteModal.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            title: form.title.trim(),
            content: form.content.trim(),
          }),
        },
        token,
      );

      if (!res.ok) {
        alert("Error al actualizar");
        return;
      }

      if (!res.ok) {
        alert("Error al actualizar");
        return;
      }

      const updated = await res.json();
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === `n-${updated.id}`
            ? {
                ...ev,
                title: `${updated.title}`,
                extendedProps: {
                  ...ev.extendedProps!,
                  content: updated.content,
                },
              }
            : ev,
        ),
      );
      setNoteModal((m) => ({ ...m, open: false }));
    } catch {
      alert("Ocurrió un error al actualizar la nota");
    } finally {
      setLoadingNote(false);
    }
  };

  const onEditClick = () => {
    setForm({
      title: noteModal.title,
      content: noteModal.content,
    });
    setNoteModal((m) => ({ ...m, mode: "edit" }));
  };

  const formatShortDate = (value?: string | Date) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "short",
    }).format(date);
  };

  const getStatusPillClass = (status: ClientStatus, selected: boolean) => {
    if (selected) {
      if (status === "Pendiente") {
        return "bg-amber-100/70 text-amber-950 ring-1 ring-amber-200/80 dark:bg-amber-400/15 dark:text-amber-100 dark:ring-amber-300/30";
      }
      if (status === "Pago") {
        return "bg-emerald-100/70 text-emerald-950 ring-1 ring-emerald-200/80 dark:bg-emerald-400/15 dark:text-emerald-100 dark:ring-emerald-300/30";
      }
      if (status === "Facturado") {
        return "bg-sky-100/70 text-sky-950 ring-1 ring-sky-200/80 dark:bg-sky-400/15 dark:text-sky-100 dark:ring-sky-300/30";
      }
      return "bg-white/80 text-sky-950 ring-1 ring-sky-200/80 dark:bg-white/10 dark:text-white dark:ring-white/10";
    }

    if (status === "Pendiente") {
      return "bg-amber-50/70 text-amber-900/70 ring-1 ring-amber-100/80 hover:bg-amber-100/60 dark:bg-amber-400/5 dark:text-amber-100/70 dark:ring-amber-300/20 dark:hover:bg-amber-400/10";
    }
    if (status === "Pago") {
      return "bg-emerald-50/70 text-emerald-900/70 ring-1 ring-emerald-100/80 hover:bg-emerald-100/60 dark:bg-emerald-400/5 dark:text-emerald-100/70 dark:ring-emerald-300/20 dark:hover:bg-emerald-400/10";
    }
    if (status === "Facturado") {
      return "bg-sky-50/70 text-sky-900/70 ring-1 ring-sky-100/80 hover:bg-sky-100/60 dark:bg-sky-400/5 dark:text-sky-100/70 dark:ring-sky-300/20 dark:hover:bg-sky-400/10";
    }
    return "bg-white/40 text-sky-950/70 ring-1 ring-sky-100/70 hover:bg-white/60 dark:bg-white/5 dark:text-white/60 dark:ring-white/10 dark:hover:bg-white/10";
  };

  const eventClassNames = ({ event }: { event: EventApi }) => {
    const kind = getEventKind(event);
    const base = [
      "rounded-2xl",
      "border",
      "shadow-sm",
      "backdrop-blur",
      "px-2",
      "py-1",
      "whitespace-normal",
      "transition",
      "hover:scale-[1.01]",
    ];

    if (kind === "note") {
      return [
        ...base,
        "!bg-amber-100/70",
        "!text-sky-950",
        "border-amber-200/70",
        "dark:!bg-amber-400/10",
        "dark:!text-amber-100",
        "dark:border-amber-300/20",
      ];
    }

    if (kind === "service") {
      return [
        ...base,
        "!bg-emerald-100/70",
        "!text-sky-950",
        "border-emerald-200/70",
        "dark:!bg-emerald-400/10",
        "dark:!text-emerald-100",
        "dark:border-emerald-300/20",
      ];
    }

    return [
      ...base,
      "!bg-sky-100/70",
      "!text-sky-950",
      "border-sky-200/80",
      "dark:!bg-sky-400/10",
      "dark:!text-sky-100",
      "dark:border-sky-300/20",
    ];
  };

  const renderEventContent = (arg: EventContentArg) => {
    const kind = getEventKind(arg.event);
    const props = arg.event.extendedProps as CalendarEvent["extendedProps"];
    const isDay = arg.view.type === "dayGridDay";
    const showDetails = isDay || detailMode === "detail";
    const noteSnippet =
      props?.content && props.content.length > 80
        ? `${props.content.slice(0, 80)}…`
        : props?.content;

    const secondaryLine =
      kind === "booking"
        ? props?.details
        : kind === "service"
          ? [props?.serviceType, props?.destination, props?.description]
              .filter(Boolean)
              .join(" · ")
          : noteSnippet;

    const badges: { label: string; tone: "sky" | "emerald" | "amber" }[] = [];
    if (kind === "booking") {
      if (props?.paxCount != null) {
        badges.push({ label: `Pax ${props.paxCount}`, tone: "emerald" });
      }
      if (props?.servicesCount != null) {
        badges.push({
          label: `Servicios ${props.servicesCount}`,
          tone: "sky",
        });
      }
      const returnLabel = formatShortDate(props?.returnDate);
      if (returnLabel) {
        badges.push({ label: `Regreso ${returnLabel}`, tone: "sky" });
      }
      if (props?.clientStatus) {
        badges.push({ label: props.clientStatus, tone: "amber" });
      }
    }
    if (kind === "service") {
      if (props?.reference) {
        badges.push({ label: `Ref ${props.reference}`, tone: "sky" });
      }
      const returnLabel = formatShortDate(props?.returnDate);
      if (returnLabel) {
        badges.push({ label: `Regreso ${returnLabel}`, tone: "sky" });
      }
      if (props?.clientStatus) {
        badges.push({ label: props.clientStatus, tone: "amber" });
      }
    }
    if (kind === "note" && props?.creator) {
      badges.push({ label: props.creator, tone: "sky" });
    }

    const icon = isDay ? (
      kind === "note" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          className="size-3"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.862 4.487 19.5 7.125m-2.638-2.638L7.5 13.85l-1 4.15 4.15-1 9.212-9.213a2.121 2.121 0 0 0-3-3Z"
          />
        </svg>
      ) : kind === "service" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          className="size-3"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m14.25 6.087 1.5-1.5a2.121 2.121 0 1 1 3 3l-1.5 1.5m-3-3 3 3m-3-3-6.364 6.364a2.121 2.121 0 0 0-.621 1.5V17.5h3.55a2.12 2.12 0 0 0 1.5-.621L18 10.5m-4.5 9.75H19.5"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          className="size-3"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 6.75h8m-8 3.5h8m-8 3.5h8M6.75 3.75h10.5A1.5 1.5 0 0 1 18.75 5.25v13.5a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V5.25a1.5 1.5 0 0 1 1.5-1.5Z"
          />
        </svg>
      )
    ) : detailMode === "name" ? (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        className="size-3"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 19.5a7.5 7.5 0 0 1 15 0v.75H4.5v-.75Z"
        />
      </svg>
    ) : (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        className="size-3"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 6.75h7.5m-7.5 3.75h7.5m-7.5 3.75h4.5M5.25 3.75h10.5A2.25 2.25 0 0 1 18 6v12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18V6a2.25 2.25 0 0 1 2.25-2.25Z"
        />
      </svg>
    );

    return (
      <div
        className={`flex flex-col ${isDay ? "gap-1" : "gap-0.5"} text-sky-950 dark:text-sky-100`}
      >
        <div className="flex items-center gap-1">
          <span className="flex size-4 items-center justify-center rounded-full bg-white/70 text-sky-950/80 dark:bg-white/10 dark:text-white/80">
            {icon}
          </span>
          <span
            className={`font-semibold ${isDay ? "text-sm" : "text-[11px]"}`}
          >
            {arg.event.title}
          </span>
        </div>
        {showDetails && secondaryLine ? (
          <span className={`${isDay ? "text-xs" : "text-[10px]"} opacity-80`}>
            {secondaryLine}
          </span>
        ) : null}
        {isDay && badges.length ? (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {badges.map((badge) => (
              <span
                key={`${badge.tone}-${badge.label}`}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  badge.tone === "emerald"
                    ? "bg-emerald-200/70 text-emerald-900 ring-1 ring-emerald-300/60 dark:bg-emerald-300/20 dark:text-emerald-100 dark:ring-emerald-300/30"
                    : badge.tone === "amber"
                      ? "bg-amber-200/70 text-amber-900 ring-1 ring-amber-300/60 dark:bg-amber-300/20 dark:text-amber-100 dark:ring-amber-300/30"
                      : "bg-sky-200/70 text-sky-900 ring-1 ring-sky-300/60 dark:bg-sky-300/20 dark:text-sky-100 dark:ring-sky-300/30"
                }`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <ProtectedRoute>
      <div className="space-y-6 p-6">
        <div className="flex justify-center">
          <h1 className="text-3xl font-semibold">Calendario</h1>
        </div>

        <div className="rounded-3xl border border-sky-200/60 bg-white/20 p-4 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white">
          <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-sky-950/60 dark:text-white/60">
                Vista
              </span>
              <div className="flex flex-wrap items-center gap-1 rounded-full border border-sky-200/70 bg-sky-100/20 p-1 shadow-inner shadow-sky-950/5 dark:border-white/10 dark:bg-white/5 dark:shadow-none">
                {(
                  ["dayGridMonth", "dayGridWeek", "dayGridDay"] as ViewOption[]
                ).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleViewChange(v)}
                    className={`flex-1 cursor-pointer justify-center rounded-full px-4 py-2 text-xs transition ${
                      currentView === v
                        ? "bg-white/80 text-sky-950 shadow-sm shadow-sky-950/10 ring-1 ring-sky-200/80 dark:bg-white/10 dark:text-white dark:ring-white/10"
                        : "text-sky-950/60 hover:bg-white/40 dark:text-white/60 dark:hover:bg-white/10"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {v === "dayGridMonth" ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          className="size-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6.75 3v1.5m10.5-1.5V4.5M3.75 8.25h16.5M4.5 6h15a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-12A1.5 1.5 0 0 1 4.5 6Z"
                          />
                        </svg>
                      ) : v === "dayGridWeek" ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          className="size-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 8.25h18M3 12h18M3 15.75h18M6.75 4.5h10.5"
                          />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          className="size-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 4.5h12M6 9h12M6 13.5h12M6 18h12"
                          />
                        </svg>
                      )}
                      {v === "dayGridMonth"
                        ? "Mes"
                        : v === "dayGridWeek"
                          ? "Semana"
                          : "Día"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-sky-950/60 dark:text-white/60">
                Mostrar
              </span>
              <div className="flex flex-wrap items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-100/20 p-1 shadow-inner shadow-emerald-950/5 dark:border-emerald-300/20 dark:bg-emerald-400/5 dark:shadow-none">
                <button
                  onClick={() => setFilterMode("bookings")}
                  type="button"
                  className={`flex-1 cursor-pointer justify-center rounded-full px-4 py-2 text-xs transition ${
                    filterMode === "bookings"
                      ? "bg-emerald-100/5 text-emerald-950 shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-200/80 dark:bg-emerald-400/5 dark:text-emerald-100 dark:ring-emerald-300/30"
                      : "text-sky-950/60 hover:bg-white/40 dark:text-white/60 dark:hover:bg-white/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="size-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.75 3.75h10.5A2.25 2.25 0 0 1 19.5 6v12a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 18V6a2.25 2.25 0 0 1 2.25-2.25ZM9 8.25h6M9 12h6M9 15.75h4.5"
                      />
                    </svg>
                    Reservas
                  </span>
                </button>
                <button
                  onClick={() => setFilterMode("services")}
                  type="button"
                  className={`flex-1 cursor-pointer justify-center rounded-full px-4 py-2 text-xs transition ${
                    filterMode === "services"
                      ? "bg-emerald-100/5 text-emerald-950 shadow-sm shadow-emerald-950/10 ring-1 ring-emerald-200/80 dark:bg-emerald-400/5 dark:text-emerald-100 dark:ring-emerald-300/30"
                      : "text-sky-950/60 hover:bg-white/40 dark:text-white/60 dark:hover:bg-white/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="size-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 7.5 14.25 14.25m0 0-3-3m3 3L7.5 21M14.25 14.25l2.25-2.25M7.5 21H3v-4.5l9.75-9.75a2.121 2.121 0 1 1 3 3L7.5 21Z"
                      />
                    </svg>
                    Servicios
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-sky-950/60 dark:text-white/60">
                Detalle
              </span>
              <div className="flex flex-wrap items-center gap-1 rounded-full border border-amber-200/70 bg-amber-100/20 p-1 shadow-inner shadow-amber-950/5 dark:border-amber-300/20 dark:bg-amber-400/5 dark:shadow-none">
                <button
                  type="button"
                  onClick={() => setDetailMode("name")}
                  className={`flex-1 cursor-pointer justify-center rounded-full px-4 py-2 text-xs transition ${
                    detailMode === "name"
                      ? "bg-amber-100/5 text-amber-950 shadow-sm shadow-amber-950/10 ring-1 ring-amber-200/80 dark:bg-amber-400/15 dark:text-amber-100 dark:ring-amber-300/30"
                      : "text-amber-900/70 hover:bg-amber-100/50 dark:text-amber-100/70 dark:hover:bg-amber-400/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="size-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 19.5a7.5 7.5 0 0 1 15 0v.75H4.5v-.75Z"
                      />
                    </svg>
                    Solo nombre
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailMode("detail")}
                  className={`flex-1 cursor-pointer justify-center rounded-full px-4 py-2 text-xs transition ${
                    detailMode === "detail"
                      ? "bg-amber-100/5 text-amber-950 shadow-sm shadow-amber-950/10 ring-1 ring-amber-200/80 dark:bg-amber-400/15 dark:text-amber-100 dark:ring-amber-300/30"
                      : "text-amber-900/70 hover:bg-amber-100/50 dark:text-amber-100/70 dark:hover:bg-amber-400/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="size-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 6.75h7.5m-7.5 3.75h7.5m-7.5 3.75h4.5M5.25 3.75h10.5A2.25 2.25 0 0 1 18 6v12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18V6a2.25 2.25 0 0 1 2.25-2.25Z"
                      />
                    </svg>
                    Nombre + detalle
                  </span>
                </button>
              </div>
            </div>

            {profile?.role !== "vendedor" && (
              <div className="min-w-[200px] flex-1">
                <label className="block cursor-text text-sm font-medium dark:text-white">
                  Vendedor
                </label>
                <input
                  list="vendors-list"
                  value={vendorInput}
                  onChange={(e) => setVendorInput(e.target.value)}
                  placeholder="Buscar vendedor..."
                  className="mt-1 w-full appearance-none rounded-2xl border border-sky-200/70 bg-white/20 px-3 py-2 text-sm outline-none transition focus:border-sky-300/80 focus:ring-2 focus:ring-sky-200/40 dark:border-white/10 dark:bg-white/10 dark:text-white dark:focus:border-white/30 dark:focus:ring-white/10"
                />
                <datalist id="vendors-list">
                  {allowedVendors.map((v) => (
                    <option
                      key={v.id_user}
                      value={`${v.first_name} ${v.last_name}`}
                    />
                  ))}
                </datalist>
              </div>
            )}

            <div>
              <label className="block cursor-text text-sm font-medium dark:text-white">
                Rango fechas
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) =>
                    setDateRange((r) => ({ ...r, from: e.target.value }))
                  }
                  className="cursor-text rounded-2xl border border-sky-200/70 bg-white/20 px-3 py-2 text-sm outline-none transition focus:border-sky-300/80 focus:ring-2 focus:ring-sky-200/40 dark:border-white/10 dark:bg-white/10 dark:text-white dark:focus:border-white/30 dark:focus:ring-white/10"
                />
                <span className="text-sky-950 dark:text-white">–</span>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) =>
                    setDateRange((r) => ({ ...r, to: e.target.value }))
                  }
                  className="cursor-text rounded-2xl border border-sky-200/70 bg-white/20 px-3 py-2 text-sm outline-none transition focus:border-sky-300/80 focus:ring-2 focus:ring-sky-200/40 dark:border-white/10 dark:bg-white/10 dark:text-white dark:focus:border-white/30 dark:focus:ring-white/10"
                />
              </div>
            </div>

            <div>
              <label className="block cursor-text text-sm font-medium dark:text-white">
                Estado pax
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {clientStatusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setSelectedClientStatus(status)}
                    className={`rounded-full px-3 py-1 text-xs transition ${getStatusPillClass(
                      status,
                      selectedClientStatus === status,
                    )}`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="">
          {loadingEvents ? (
            <div className="flex h-[400px] items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-center py-2">
                <div className="flex gap-4">
                  <button
                    onClick={() => calendarRef.current?.getApi().prev()}
                    className="flex w-full items-center text-sm tracking-wide text-sky-950/60 transition-all hover:text-sky-950 dark:text-white/60 hover:dark:text-white"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="size-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.4}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 19.5 8.25 12l7.5-7.5"
                      />
                    </svg>
                    anterior
                  </button>

                  <p className="flex items-center gap-2 text-2xl font-semibold text-sky-950 dark:text-white">
                    {calendarTitle}
                    <span className="text-sm font-light text-sky-950/80 dark:text-white/80">
                      {calendarYear}
                    </span>
                  </p>

                  <button
                    onClick={() => calendarRef.current?.getApi().next()}
                    className="flex items-center text-sm tracking-wide text-sky-950/60 transition-all hover:text-sky-950 dark:text-white/60 hover:dark:text-white"
                  >
                    siguiente
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="size-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.4}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m8.25 4.5 7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded-3xl border border-sky-200/60 bg-gradient-to-br from-white/60 via-white/10 to-sky-50/30 p-4 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:border-white/10 dark:from-white/10 dark:via-white/5 dark:to-sky-900/10 dark:text-white">
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView={currentView}
                  timeZone="America/Argentina/Buenos_Aires"
                  locale={esLocale}
                  headerToolbar={false}
                  dayHeaderFormat={{ weekday: "long" }}
                  dayHeaderClassNames={() => ["capitalize"]}
                  datesSet={(arg) => {
                    if (arg.view.type !== "dayGridMonth") {
                      const yearTitle = new Intl.DateTimeFormat("es-AR", {
                        year: "numeric",
                      }).format(arg.view.currentStart);
                      if (arg.view.type === "dayGridDay") {
                        const dayTitle = new Intl.DateTimeFormat("es-AR", {
                          day: "numeric",
                          month: "long",
                        }).format(arg.view.currentStart);
                        setCalendarTitle(
                          dayTitle.charAt(0).toUpperCase() + dayTitle.slice(1),
                        );
                        setCalendarYear(yearTitle);
                        return;
                      }

                      const monthTitle = new Intl.DateTimeFormat("es-AR", {
                        month: "long",
                      }).format(arg.view.currentStart);
                      setCalendarTitle(
                        monthTitle.charAt(0).toUpperCase() +
                          monthTitle.slice(1),
                      );
                      setCalendarYear(yearTitle);
                      return;
                    }

                    const fullTitle = arg.view.title;
                    const onlyMonth = fullTitle.split(" ")[0];
                    const parts = fullTitle.split(" ");
                    setCalendarYear(parts[parts.length - 1]);
                    setCalendarTitle(
                      onlyMonth.charAt(0).toUpperCase() + onlyMonth.slice(1),
                    );
                  }}
                  fixedWeekCount={false}
                  showNonCurrentDates={false}
                  buttonText={{ today: "Hoy" }}
                  events={events}
                  eventClassNames={eventClassNames}
                  eventContent={renderEventContent}
                  eventDidMount={handleEventDidMount}
                  eventClick={handleEventClick}
                  dateClick={handleDateClick}
                  height="auto"
                />
              </div>
            </>
          )}
        </div>

        {noteModal.open && noteModal.mode === "create" && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-sky-900/5 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur-2xl dark:bg-white/20 dark:text-white">
              <h2 className="mb-2 flex justify-between text-lg font-semibold dark:text-white">
                Nueva nota
                <span className="text-base font-normal">
                  {formatDateInBuenosAires(noteModal.date)}
                </span>
              </h2>
              <input
                type="text"
                placeholder="Título"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                disabled={loadingNote}
                className={`mb-2 w-full rounded-2xl border border-sky-950/10 bg-white/10 px-3 py-2 outline-none dark:border-white/10 dark:bg-white/10 dark:text-white ${
                  loadingNote ? "cursor-not-allowed opacity-50" : ""
                }`}
              />
              <textarea
                placeholder="Contenido"
                value={form.content}
                onChange={(e) =>
                  setForm((f) => ({ ...f, content: e.target.value }))
                }
                disabled={loadingNote}
                rows={4}
                className={`mb-4 w-full rounded-2xl border border-sky-950/10 bg-white/10 px-3 py-2 outline-none dark:border-white/10 dark:bg-white/10 dark:text-white ${
                  loadingNote ? "cursor-not-allowed opacity-50" : ""
                }`}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setNoteModal((m) => ({ ...m, open: false }))}
                  className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                  disabled={loadingNote}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
                <button
                  onClick={submitNote}
                  disabled={loadingNote}
                  className={`rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur ${
                    loadingNote
                      ? "cursor-not-allowed bg-sky-100/80 text-sky-950/80 dark:text-white/50"
                      : ""
                  }`}
                >
                  {loadingNote ? <Spinner /> : "Crear"}
                </button>
              </div>
            </div>
          </div>
        )}

        {noteModal.open && noteModal.mode === "view" && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-sky-900/5 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur-2xl dark:bg-white/20 dark:text-white">
              <h2 className="mb-2 text-xl font-semibold dark:text-white">
                {noteModal.title}
              </h2>
              <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
                Creada por <strong>{noteModal.creator}</strong> el{" "}
                {formatDateInBuenosAires(noteModal.date)}
              </p>
              <div className="mb-6 whitespace-pre-wrap dark:text-white">
                {noteModal.content || <em>(Sin contenido adicional)</em>}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onEditClick}
                  className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                    />
                  </svg>
                </button>
                <button
                  onClick={() =>
                    noteModal.id !== undefined && deleteNote(noteModal.id)
                  }
                  className={`rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800 ${
                    loadingNote
                      ? "cursor-not-allowed bg-red-600/80 text-red-100/80 dark:bg-red-800/80"
                      : ""
                  }`}
                  disabled={loadingNote}
                >
                  {loadingNote ? (
                    <Spinner />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="size-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                  )}
                </button>

                <div className="flex w-full justify-end">
                  <button
                    onClick={() => setNoteModal((m) => ({ ...m, open: false }))}
                    className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
                    disabled={loadingNote}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="size-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {noteModal.open && noteModal.mode === "edit" && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-sky-900/5 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur-2xl dark:bg-white/20 dark:text-white">
              <h2 className="mb-2 text-xl font-semibold dark:text-white">
                Editar nota: {noteModal.date}
              </h2>
              <input
                type="text"
                placeholder="Título"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                disabled={loadingNote}
                className={`mb-2 w-full rounded-2xl border border-sky-950/10 bg-white/10 px-3 py-2 outline-none dark:border-white/10 dark:bg-white/10 dark:text-white ${
                  loadingNote ? "cursor-not-allowed opacity-50" : ""
                }`}
              />
              <textarea
                placeholder="Contenido"
                value={form.content}
                onChange={(e) =>
                  setForm((f) => ({ ...f, content: e.target.value }))
                }
                disabled={loadingNote}
                rows={4}
                className={`mb-4 w-full rounded-2xl border border-sky-950/10 bg-white/10 px-3 py-2 outline-none dark:border-white/10 dark:bg-white/10 dark:text-white ${
                  loadingNote ? "cursor-not-allowed opacity-50" : ""
                }`}
              />
              <div className="flex justify-between">
                <button
                  onClick={updateNote}
                  disabled={loadingNote}
                  className={`rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur ${
                    loadingNote
                      ? "cursor-not-allowed bg-sky-100/80 text-sky-950/80 dark:text-white/50"
                      : ""
                  }`}
                >
                  {loadingNote ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={() => setNoteModal((m) => ({ ...m, open: false }))}
                  className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                  disabled={loadingNote}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
