// src/app/bookings/page.tsx
"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import BookingForm from "@/components/bookings/BookingForm";
import BookingList from "@/components/bookings/BookingList";
import FilterPanel from "@/components/bookings/FilterPanel";
import Spinner from "@/components/Spinner";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Booking, User, SalesTeam } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

// === Constantes / Tipos ===
const FILTROS = [
  "lider",
  "gerente",
  "administrativo",
  "desarrollador",
] as const;
type FilterRole = (typeof FILTROS)[number];

type BookingFormData = {
  id_booking?: number;
  clientStatus: string;
  operatorStatus: string;
  status: string;
  details: string;
  invoice_type: string;
  invoice_observation: string;
  observation: string;
  titular_id: number;
  id_user: number;
  id_agency: number; // lo mantengo para no romper BookingForm; el backend lo ignora
  departure_date: string;
  return_date: string;
  pax_count: number;
  clients_ids: number[];
};

// === Hook simple para debouncing ===
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Helper para ignorar aborts de fetch
type AbortErrorLike = { name?: unknown; code?: unknown };

const isAbortError = (e: unknown): e is AbortErrorLike => {
  if (typeof e !== "object" || e === null) return false;
  const { name, code } = e as AbortErrorLike;
  return name === "AbortError" || code === "ABORT_ERR";
};

export default function Page() {
  const { token } = useAuth();

  // estados de carga
  const [loadingFilters, setLoadingFilters] = useState<boolean>(true);
  const [loadingBookings, setLoadingBookings] = useState<boolean>(true);

  const [profile, setProfile] = useState<{
    id_user: number;
    role: FilterRole;
  } | null>(null);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [teamsList, setTeamsList] = useState<SalesTeam[]>([]);

  const [selectedUserId, setSelectedUserId] = useState(0);
  const [selectedTeamId, setSelectedTeamId] = useState(0);

  const [selectedBookingStatus, setSelectedBookingStatus] = useState("Todas");
  const [selectedClientStatus, setSelectedClientStatus] = useState<
    "Todas" | "Pendiente" | "Pago" | "Facturado"
  >("Todas");
  const [selectedOperatorStatus, setSelectedOperatorStatus] = useState("Todas");

  const [creationFrom, setCreationFrom] = useState<string>("");
  const [creationTo, setCreationTo] = useState<string>("");
  const [travelFrom, setTravelFrom] = useState<string>("");
  const [travelTo, setTravelTo] = useState<string>("");

  const [searchTerm, setSearchTerm] = useState<string>("");
  const debouncedSearch = useDebounced(searchTerm, 400);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expandedBookingId, setExpandedBookingId] = useState<number | null>(
    null,
  );

  const TAKE = 24; // tamaño de página sugerido
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Para evitar race conditions y cancelar requests
  const fetchAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const buildBookingsQuery = useCallback(
    (opts?: { cursor?: number | null }) => {
      const qs = new URLSearchParams();
      if (selectedUserId > 0) qs.append("userId", String(selectedUserId));
      if (selectedTeamId !== 0) qs.append("teamId", String(selectedTeamId));
      if (selectedBookingStatus !== "Todas")
        qs.append("status", selectedBookingStatus);
      if (selectedClientStatus !== "Todas")
        qs.append("clientStatus", selectedClientStatus);
      if (selectedOperatorStatus !== "Todas")
        qs.append("operatorStatus", selectedOperatorStatus);
      if (creationFrom) qs.append("creationFrom", creationFrom);
      if (creationTo) qs.append("creationTo", creationTo);
      if (travelFrom) qs.append("from", travelFrom);
      if (travelTo) qs.append("to", travelTo);
      if (debouncedSearch.trim()) qs.append("q", debouncedSearch.trim());
      qs.append("take", String(TAKE));
      if (opts?.cursor) qs.append("cursor", String(opts.cursor));
      return qs.toString();
    },
    [
      selectedUserId,
      selectedTeamId,
      selectedBookingStatus,
      selectedClientStatus,
      selectedOperatorStatus,
      creationFrom,
      creationTo,
      travelFrom,
      travelTo,
      debouncedSearch,
    ],
  );

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<number | null>(null);

  const [formData, setFormData] = useState<BookingFormData>({
    id_booking: undefined,
    clientStatus: "Pendiente",
    operatorStatus: "Pendiente",
    status: "Abierta",
    details: "",
    invoice_type: "",
    invoice_observation: "",
    observation: "",
    titular_id: 0,
    id_user: 0,
    id_agency: 1,
    departure_date: "",
    return_date: "",
    pax_count: 1,
    clients_ids: [],
  });

  // --- Carga de perfil + filtros ---
  useEffect(() => {
    if (!token) return;
    setLoadingFilters(true);

    const abort = new AbortController();

    (async () => {
      try {
        const profileRes = await authFetch(
          "/api/user/profile",
          { signal: abort.signal, cache: "no-store" },
          token || undefined,
        );
        if (!profileRes.ok) throw new Error("No se pudo obtener el perfil");
        const p = (await profileRes.json()) as {
          id_user: number;
          role: FilterRole;
          id_agency: number;
        };

        setProfile(p);
        const roleNorm = p.role.toLowerCase() as FilterRole;
        setFormData((prev) => ({ ...prev, id_user: p.id_user }));
        setSelectedUserId(FILTROS.includes(roleNorm) ? 0 : p.id_user);
        setSelectedTeamId(0);

        // 1) Equipos de la agencia
        const teamsRes = await authFetch(
          `/api/teams?agencyId=${p.id_agency}`,
          { signal: abort.signal, cache: "no-store" },
          token || undefined,
        );
        if (!teamsRes.ok) throw new Error("No se pudieron cargar los equipos");
        const allTeams = (await teamsRes.json()) as SalesTeam[];
        const allowed =
          p.role === "lider"
            ? allTeams.filter((t) =>
                t.user_teams.some(
                  (ut) =>
                    ut.user.id_user === p.id_user && ut.user.role === "lider",
                ),
              )
            : allTeams;
        setTeamsList(allowed);

        // 2) Usuarios visibles (según rol)
        if (FILTROS.includes(p.role)) {
          const usersRes = await authFetch(
            "/api/users",
            { signal: abort.signal, cache: "no-store" },
            token || undefined,
          );
          if (usersRes.ok) {
            const users = (await usersRes.json()) as User[];
            setTeamMembers(
              users.filter((u) =>
                ["vendedor", "lider", "gerente"].includes(u.role),
              ),
            );
          }
        }

        // 3) Si es líder, obtener sólo sus miembros
        if (p.role === "lider") {
          const mine = allTeams.filter((t) =>
            t.user_teams.some(
              (ut) => ut.user.id_user === p.id_user && ut.user.role === "lider",
            ),
          );
          const members = Array.from(
            new Map(
              mine.flatMap((t) =>
                t.user_teams.map((ut) => [ut.user.id_user, ut.user]),
              ),
            ).values(),
          );
          setTeamMembers(members as User[]);
        }
      } catch (error: unknown) {
        if (isAbortError(error)) return;
        const msg =
          error instanceof Error ? error.message : "Error inesperado.";
        console.error(msg);
        toast.error(msg);
      } finally {
        if (!abort.signal.aborted) setLoadingFilters(false);
      }
    })();

    return () => abort.abort();
  }, [token]);

  // --- Carga de reservas (primera página con cursor) ---
  useEffect(() => {
    if (!profile || loadingFilters || !token) return;

    setLoadingBookings(true);

    // cancelar petición anterior si existe
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    const myRequestId = ++requestIdRef.current;

    (async () => {
      try {
        const qs = buildBookingsQuery();
        const resp = await authFetch(
          `/api/bookings?${qs}`,
          { signal: controller.signal, cache: "no-store" },
          token || undefined,
        );
        if (!resp.ok) throw new Error("No se pudieron obtener las reservas");

        const { items, nextCursor } = await resp.json();
        if (myRequestId !== requestIdRef.current) return;

        setBookings(items);
        setNextCursor(nextCursor);
        setExpandedBookingId(null);
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        console.error("Error fetching bookings:", err);
        const msg =
          err instanceof Error ? err.message : "Error al obtener reservas.";
        toast.error(msg);
      } finally {
        if (
          myRequestId === requestIdRef.current &&
          !controller.signal.aborted
        ) {
          setLoadingBookings(false);
        }
      }
    })();

    return () => controller.abort();
  }, [
    profile,
    loadingFilters,
    selectedUserId,
    selectedTeamId,
    selectedBookingStatus,
    selectedClientStatus,
    selectedOperatorStatus,
    creationFrom,
    creationTo,
    travelFrom,
    travelTo,
    token,
    buildBookingsQuery,
    debouncedSearch,
  ]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: ["pax_count", "titular_id"].includes(name)
        ? Number(value)
        : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones front mínimas
    if (
      !formData.details.trim() ||
      !formData.invoice_type.trim() ||
      !formData.invoice_observation.trim() ||
      formData.titular_id === 0 ||
      !formData.departure_date ||
      !formData.return_date ||
      !formData.clientStatus ||
      !formData.operatorStatus ||
      !formData.status ||
      !formData.id_user
    ) {
      toast.error("Completa todos los campos obligatorios de la reserva.");
      return;
    }

    if (formData.clients_ids.includes(formData.titular_id)) {
      toast.error("El titular no puede estar de acompañante.");
      return;
    }

    // Validación extra para Factura A (con auth)
    if (formData.invoice_type === "Factura A") {
      try {
        const resClient = await authFetch(
          `/api/clients/${formData.titular_id}`,
          { cache: "no-store" },
          token || undefined,
        );
        if (!resClient.ok) {
          toast.error("No se pudo obtener la información del titular.");
          return;
        }
        const titular = await resClient.json();
        if (
          !titular.company_name?.trim() ||
          !titular.commercial_address?.trim() ||
          !titular.email?.trim() ||
          !titular.tax_id?.trim()
        ) {
          toast.error(
            "Para Factura A, el titular debe tener cargado Razón Social, Domicilio Comercial, Email y CUIT.",
          );
          return;
        }
      } catch (error) {
        console.error("Error validando titular:", error);
        toast.error("Error al validar la información del titular.");
        return;
      }
    }

    try {
      const url = editingBookingId
        ? `/api/bookings/${editingBookingId}`
        : "/api/bookings";
      const method = editingBookingId ? "PUT" : "POST";

      const response = await authFetch(
        url,
        { method, body: JSON.stringify(formData) },
        token || undefined,
      );

      if (!response.ok) {
        let msg = "Error al guardar la reserva.";
        try {
          const err = await response.json();
          msg = typeof err?.error === "string" ? err.error : msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      // Refrescar primera página con los filtros actuales
      const qs = buildBookingsQuery();
      const listResp = await authFetch(
        `/api/bookings?${qs}`,
        { cache: "no-store" },
        token || undefined,
      );
      if (!listResp.ok) throw new Error("No se pudo refrescar la lista.");
      const { items, nextCursor } = await listResp.json();
      setBookings(items);
      setNextCursor(nextCursor);
      setExpandedBookingId(null);

      toast.success("Reserva guardada con éxito!");
      resetForm();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error inesperado.";
      console.error(msg);
      toast.error(msg);
    }
  };

  // Cargar más (append con cursor)
  const loadMore = async () => {
    if (!nextCursor || !token || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = buildBookingsQuery({ cursor: nextCursor });
      const resp = await authFetch(
        `/api/bookings?${qs}`,
        { cache: "no-store" },
        token || undefined,
      );
      if (!resp.ok) throw new Error("No se pudieron obtener más reservas");

      const { items, nextCursor: newCursor } = await resp.json();
      setBookings((prev) => [...prev, ...items]);
      setNextCursor(newCursor);
    } catch (e) {
      console.error("loadMore:", e);
      toast.error("No se pudieron cargar más reservas.");
    } finally {
      setLoadingMore(false);
    }
  };

  const resetForm = () => {
    setFormData((prev) => ({
      id_booking: undefined,
      clientStatus: "Pendiente",
      operatorStatus: "Pendiente",
      status: "Abierta",
      details: "",
      invoice_type: "",
      invoice_observation: "",
      observation: "",
      titular_id: 0,
      id_user: prev.id_user!, // mantener el usuario actual
      id_agency: 1,
      departure_date: "",
      return_date: "",
      pax_count: 1,
      clients_ids: [],
    }));
    setIsFormVisible(false);
    setEditingBookingId(null);
  };

  const startEditingBooking = (booking: Booking) => {
    setFormData({
      id_booking: booking.id_booking,
      clientStatus: booking.clientStatus,
      operatorStatus: booking.operatorStatus,
      status: booking.status,
      details: booking.details,
      invoice_type: booking.invoice_type || "",
      invoice_observation: booking.invoice_observation || "",
      observation: "",
      titular_id: booking.titular?.id_client || 0,
      id_user: booking.user?.id_user || 0,
      id_agency: booking.agency?.id_agency || 0,
      departure_date: booking.departure_date.split("T")[0],
      return_date: booking.return_date.split("T")[0],
      pax_count: booking.pax_count || 1,
      clients_ids: booking.clients?.map((c) => c.id_client) || [],
    });
    setEditingBookingId(booking.id_booking || null);
    setIsFormVisible(true);
  };

  const deleteBooking = async (id: number) => {
    try {
      const res = await authFetch(
        `/api/bookings/${id}`,
        { method: "DELETE" },
        token || undefined,
      );
      if (res.ok) {
        setBookings((prev) => prev.filter((b) => b.id_booking !== id));
        toast.success("Reserva eliminada con éxito!");
      } else {
        throw new Error("Error al eliminar la reserva.");
      }
    } catch (err: unknown) {
      console.error("Error deleting booking:", err);
      toast.error((err as Error).message || "Error al eliminar la reserva.");
    }
  };

  // Nota: ya filtrás por q en el servidor; este extra es solo “client-side refine”
  const displayedBookings = useMemo(() => {
    if (!debouncedSearch.trim()) return bookings;
    const s = debouncedSearch.toLowerCase();
    return bookings.filter((b) => {
      return (
        b.id_booking.toString().includes(s) ||
        b.details.toLowerCase().includes(s) ||
        b.titular.id_client.toString().includes(s) ||
        `${b.titular.first_name} ${b.titular.last_name}`
          .toLowerCase()
          .includes(s) ||
        b.clients.some((c) =>
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(s),
        )
      );
    });
  }, [bookings, debouncedSearch]);

  const displayedTeamMembers = useMemo(() => {
    // “Sin equipo”
    if (selectedTeamId === -1) {
      const assignedIds = teamsList.flatMap((t) =>
        t.user_teams.map((ut) => ut.user.id_user),
      );
      return teamMembers.filter((u) => !assignedIds.includes(u.id_user));
    }
    // Equipo específico
    if (selectedTeamId > 0) {
      const team = teamsList.find((t) => t.id_team === selectedTeamId);
      return team ? team.user_teams.map((ut) => ut.user) : [];
    }
    // Todo el equipo
    return teamMembers;
  }, [selectedTeamId, teamsList, teamMembers]);

  const isLoading = loadingFilters || loadingBookings;

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        <motion.div layout>
          <BookingForm
            token={token}
            formData={formData}
            handleChange={handleChange}
            handleSubmit={handleSubmit}
            editingBookingId={editingBookingId}
            isFormVisible={isFormVisible}
            setFormData={setFormData}
            setIsFormVisible={setIsFormVisible}
          />
        </motion.div>

        <h2 className="my-4 text-2xl font-semibold dark:font-medium">
          Reservas
        </h2>

        <div className="mb-4 space-y-4 text-sm md:text-base">
          <FilterPanel
            role={profile?.role}
            teams={teamsList}
            displayedTeamMembers={displayedTeamMembers}
            selectedUserId={selectedUserId}
            setSelectedUserId={setSelectedUserId}
            selectedTeamId={selectedTeamId}
            setSelectedTeamId={setSelectedTeamId}
            selectedBookingStatus={selectedBookingStatus}
            setSelectedBookingStatus={setSelectedBookingStatus}
            selectedClientStatus={selectedClientStatus}
            setSelectedClientStatus={setSelectedClientStatus}
            selectedOperatorStatus={selectedOperatorStatus}
            setSelectedOperatorStatus={setSelectedOperatorStatus}
            creationFrom={creationFrom}
            setCreationFrom={setCreationFrom}
            creationTo={creationTo}
            setCreationTo={setCreationTo}
            travelFrom={travelFrom}
            setTravelFrom={setTravelFrom}
            travelTo={travelTo}
            setTravelTo={setTravelTo}
            setSearchTerm={setSearchTerm}
            searchTerm={searchTerm}
          />
        </div>

        {isLoading ? (
          <div className="flex min-h-[50vh] items-center">
            <Spinner />
          </div>
        ) : (
          <BookingList
            bookings={displayedBookings}
            expandedBookingId={expandedBookingId}
            setExpandedBookingId={setExpandedBookingId}
            startEditingBooking={startEditingBooking}
            deleteBooking={deleteBooking}
            role={profile?.role}
            hasMore={Boolean(nextCursor)}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
          />
        )}

        <ToastContainer />

        {/* Estilos globales para asegurar legibilidad de los <option> */}
        <style jsx global>{`
          select option {
            background-color: white;
            color: sky-950;
          }
          .dark select option {
            background-color: black;
            color: white;
          }
        `}</style>
      </section>
    </ProtectedRoute>
  );
}
