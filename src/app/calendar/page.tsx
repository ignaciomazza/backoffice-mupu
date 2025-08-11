// src/app/calendar/page.tsx
"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import { EventInput, EventApi } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { DateClickArg } from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Spinner from "@/components/Spinner";
import ProtectedRoute from "@/components/ProtectedRoute";
import { authFetch } from "@/utils/authFetch";

type ClientStatus = "Todas" | "Pendiente" | "Pago" | "Facturado";
type ViewOption = "dayGridMonth" | "dayGridWeek";
type NoteMode = "create" | "view" | "edit";

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
    content: string;
    creator: string;
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

    setLoadingEvents(true);
    authFetch(`/api/calendar?${qs.toString()}`, { cache: "no-store" }, token)
      .then((r) => r.json() as Promise<CalendarEvent[]>)
      .then((data) => {
        const reservas = data
          .filter((ev) => String(ev.id).startsWith("b-"))
          .map((ev) => ({
            ...ev,
            allDay: true,
            color: "#e0f2fe",
            textColor: "#082f49",
          }));
        const notas = data
          .filter((ev) => String(ev.id).startsWith("n-"))
          .map((ev) => ({
            ...ev,
            allDay: true,
            color: "#f97316",
            extendedProps: ev.extendedProps,
          }));
        setEvents([...reservas, ...notas]);
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
  ]);

  const handleViewChange = (view: ViewOption) => {
    calendarRef.current?.getApi().changeView(view);
    setCurrentView(view);
  };

  const handleEventDidMount = ({
    event,
    el,
  }: {
    event: EventApi;
    el: HTMLElement;
  }) => {
    el.setAttribute(
      "title",
      event.id.startsWith("b-") ? event.title : `Nota: ${event.title}`,
    );
    el.style.cursor = "pointer";
  };

  const handleEventClick = ({ event }: { event: EventApi }) => {
    if (event.id.startsWith("b-")) {
      router.push(`/bookings/services/${event.id.slice(2)}`);
    } else {
      const id = Number(event.id.slice(2));
      const { content, creator } = event.extendedProps as {
        content: string;
        creator: string;
      };
      setNoteModal({
        open: true,
        mode: "view",
        id,
        date: event.startStr,
        title: event.title,
        content,
        creator,
      });
    }
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
          color: "#f59e0b",
          extendedProps: {
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

  // --- aquí va el return JSX ---

  return (
    <ProtectedRoute>
      <div className="space-y-6 p-6">
        <div className="flex justify-center">
          <h1 className="text-3xl font-semibold">Calendario</h1>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex gap-2">
              {(["dayGridMonth", "dayGridWeek"] as ViewOption[]).map((v) => (
                <button
                  key={v}
                  onClick={() => handleViewChange(v)}
                  className={`cursor-pointer rounded-full px-4 py-2 ${
                    currentView === v
                      ? "rounded-3xl bg-sky-100 p-6 text-sky-950 shadow-sm shadow-sky-950/10 dark:bg-white/10 dark:text-white dark:backdrop-blur"
                      : "text-sky-950/70 hover:bg-sky-950/5 dark:text-white/70 dark:hover:bg-white/5"
                  }`}
                >
                  {v === "dayGridMonth" ? "Mes" : "Semana"}
                </button>
              ))}
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
                  className="mt-1 w-full appearance-none rounded-2xl border border-sky-950/10 bg-white/10 px-3 py-2 outline-none dark:border-white/10 dark:bg-white/10 dark:text-white"
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
                Estado cliente
              </label>
              <select
                value={selectedClientStatus}
                onChange={(e) =>
                  setSelectedClientStatus(e.target.value as ClientStatus)
                }
                className="mt-1 cursor-pointer appearance-none rounded-2xl border border-sky-950/10 bg-white/10 px-3 py-2 outline-none dark:border-white/10 dark:bg-white/10 dark:text-white"
              >
                <option>Todas</option>
                <option>Pendiente</option>
                <option>Pago</option>
                <option>Facturado</option>
              </select>
            </div>

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
                  className="cursor-text rounded-2xl border border-sky-950/10 bg-white/10 px-3 py-2 outline-none dark:border-white/10 dark:bg-white/10 dark:text-white"
                />
                <span className="text-sky-950 dark:text-white">–</span>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) =>
                    setDateRange((r) => ({ ...r, to: e.target.value }))
                  }
                  className="cursor-text rounded-2xl border border-sky-950/10 bg-white/10 px-3 py-2 outline-none dark:border-white/10 dark:bg-white/10 dark:text-white"
                />
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
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView={currentView}
                  timeZone="UTC"
                  locale={esLocale}
                  headerToolbar={false}
                  dayHeaderFormat={{ weekday: "long" }}
                  dayHeaderClassNames={() => ["capitalize"]}
                  datesSet={(arg) => {
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
                  {new Date(noteModal.date).toLocaleDateString("es-AR")}
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
                {new Date(noteModal.date).toLocaleDateString("es-AR")}
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
