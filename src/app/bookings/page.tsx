"use client";
import { useState, useEffect, useMemo } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import BookingForm from "@/components/bookings/BookingForm";
import BookingList from "@/components/bookings/BookingList";
import Spinner from "@/components/Spinner";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Booking, User, SalesTeam, UserTeam } from "@/types";
import { useAuth } from "@/context/AuthContext";

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
  id_agency: number;
  departure_date: string;
  return_date: string;
  pax_count: number;
  clients_ids: number[];
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

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number>(0);

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expandedBookingId, setExpandedBookingId] = useState<number | null>(
    null,
  );

  const ESTADOS = ["Todas", "Pendiente", "Pago", "Facturado"] as const;
  type Estado = (typeof ESTADOS)[number];
  const [selectedClientStatus, setSelectedClientStatus] =
    useState<Estado>("Todas");

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
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState<number | null>(null);

  // carga de perfil + filtros
  useEffect(() => {
    if (!token) return;
    setLoadingFilters(true);

    fetch("/api/user/profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((p) => {
        setProfile(p);
        setFormData((prev) => ({ ...prev, id_user: p.id_user }));
        setSelectedUserId(FILTROS.includes(p.role) ? 0 : p.id_user);
        setSelectedTeamId(0);

        const promises: Promise<unknown>[] = [];

        // lista de equipos
        promises.push(
          fetch("/api/teams", { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.json() as Promise<SalesTeam[]>)
            .then((allTeams) => {
              const teams =
                p.role === "lider"
                  ? allTeams.filter((t) =>
                      t.user_teams.some(
                        (ut: UserTeam) =>
                          ut.user.id_user === p.id_user &&
                          ut.user.role === "lider",
                      ),
                    )
                  : allTeams;
              setTeamsList(teams);
            })
            .catch((err) => console.error("Error fetching teams list:", err)),
        );

        // si puede ver todos los usuarios
        if (FILTROS.includes(p.role)) {
          promises.push(
            fetch("/api/users", {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => r.json() as Promise<User[]>)
              .then((users) => {
                const filtered = users.filter((u) =>
                  ["vendedor", "lider", "gerente"].includes(u.role),
                );
                setTeamMembers(filtered);
              })
              .catch((err) => console.error("Error fetching users:", err)),
          );
        }

        // si es líder, sus miembros
        if (p.role === "lider") {
          promises.push(
            fetch("/api/teams", {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => r.json() as Promise<SalesTeam[]>)
              .then((teams) => {
                const mine = teams.filter((t) =>
                  t.user_teams.some(
                    (ut: UserTeam) =>
                      ut.user.id_user === p.id_user && ut.user.role === "lider",
                  ),
                );
                const members = Array.from(
                  new Map(
                    mine
                      .flatMap((t) =>
                        t.user_teams.map((ut: UserTeam) => ut.user),
                      )
                      .map((u) => [u.id_user, u]),
                  ).values(),
                );
                setTeamMembers(members as User[]);
              })
              .catch((err) => console.error("Error fetching my teams:", err)),
          );
        }

        return Promise.all(promises);
      })
      .catch((err) => console.error("Error fetching profile:", err))
      .finally(() => setLoadingFilters(false));
  }, [token]);

  // carga de reservas
  useEffect(() => {
    if (!profile || loadingFilters) return;
    setLoadingBookings(true);

    const fetchBookings = async () => {
      try {
        let data: Booking[] = [];
        if (selectedUserId && selectedUserId > 0) {
          data = await fetch(`/api/bookings?userId=${selectedUserId}`).then(
            (r) => r.json(),
          );
        } else {
          const all = await fetch("/api/bookings").then(
            (r) => r.json() as Promise<Booking[]>,
          );
          if (profile.role === "lider") {
            const ids = teamMembers.map((u) => u.id_user);
            data = all.filter((b) => ids.includes(b.user.id_user));
          } else if (selectedTeamId > 0) {
            const ids = teamsList
              .find((t) => t.id_team === selectedTeamId)!
              .user_teams.map((ut) => ut.user.id_user);
            data = all.filter((b) => ids.includes(b.user.id_user));
          } else if (selectedTeamId === -1) {
            const assigned = teamsList.flatMap((t) =>
              t.user_teams.map((ut) => ut.user.id_user),
            );
            data = all.filter((b) => !assigned.includes(b.user.id_user));
          } else {
            data = all;
          }
        }
        setBookings(data);
      } catch {
        console.error("Error fetching bookings");
      } finally {
        setLoadingBookings(false);
      }
    };

    fetchBookings();
  }, [
    selectedUserId,
    selectedTeamId,
    teamsList,
    profile,
    teamMembers,
    loadingFilters,
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

    if (formData.invoice_type === "Factura A") {
      try {
        const resClient = await fetch(`/api/clients/${formData.titular_id}`);
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

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorResponse = await response.json();
        throw new Error(errorResponse.error || "Error al guardar la reserva.");
      }

      fetch("/api/bookings")
        .then((res) => res.json())
        .then((data) => setBookings(data));
      toast.success("Reserva guardada con éxito!");
      resetForm();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
        toast.error(error.message || "Error inesperado.");
      }
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
      id_user: prev.id_user!,
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
      const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
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

  const displayedBookings = bookings
    .filter((b) => {
      if (!searchTerm.trim()) return true;
      const s = searchTerm.toLowerCase();
      return (
        b.id_booking.toString().includes(s) ||
        b.titular.id_client.toString().includes(s) ||
        `${b.titular.first_name} ${b.titular.last_name}`
          .toLowerCase()
          .includes(s) ||
        b.clients.some((c) =>
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(s),
        )
      );
    })
    .filter((b) => {
      if (dateFrom && new Date(b.departure_date) < new Date(dateFrom))
        return false;
      if (dateTo && new Date(b.departure_date) > new Date(dateTo)) return false;
      return true;
    })
    .filter((b) => {
      return (
        selectedClientStatus === "Todas" ||
        b.clientStatus === selectedClientStatus
      );
    })
    .sort((a, b) => b.id_booking - a.id_booking);

  const displayedTeamMembers = useMemo(() => {
    // Si elegiste “Sin equipo”
    if (selectedTeamId === -1) {
      // Devuelvo los usuarios que NO están en ningún equipo
      const assignedIds = teamsList.flatMap((t) =>
        t.user_teams.map((ut) => ut.user.id_user),
      );
      return teamMembers.filter((u) => !assignedIds.includes(u.id_user));
    }

    // Si elegiste un equipo específico
    if (selectedTeamId > 0) {
      const team = teamsList.find((t) => t.id_team === selectedTeamId);
      return team ? team.user_teams.map((ut) => ut.user) : [];
    }

    // selectedTeamId === 0  → “Todo el equipo”
    return teamMembers;
  }, [selectedTeamId, teamsList, teamMembers]);

  const isLoading = loadingFilters || loadingBookings;

  return (
    <ProtectedRoute>
      <section className="text-black dark:text-white">
        <motion.div layout>
          <BookingForm
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
          {(profile?.role === "lider" ||
            profile?.role === "gerente" ||
            profile?.role === "administrativo" ||
            profile?.role === "desarrollador") && (
            <div className="flex flex-col space-y-4 md:flex-row md:justify-end md:space-x-4 md:space-y-0">
              <div className="flex w-full items-center rounded-2xl border-black/10 bg-white/10 text-center text-black shadow-md backdrop-blur dark:border dark:border-white/10 dark:text-white">
                {ESTADOS.map((st, i) => (
                  <div
                    key={st}
                    onClick={() => setSelectedClientStatus(st)}
                    className={`basis-1/4 p-2 font-light tracking-wide hover:cursor-pointer ${
                      i === 0 ? "rounded-l-2xl" : ""
                    } ${
                      i === 3
                        ? "rounded-r-2xl"
                        : "border-r border-black/20 dark:border-white/20"
                    } ${
                      selectedClientStatus === st
                        ? "bg-black text-white dark:bg-white dark:text-black"
                        : ""
                    } `}
                  >
                    {st}
                  </div>
                ))}
              </div>

              <select
                className="flex w-fit cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-black shadow-md outline-none backdrop-blur dark:border dark:border-white/10 dark:text-white"
                value={selectedUserId!}
                onChange={(e) => {
                  setSelectedUserId(Number(e.target.value));
                }}
              >
                <option value={0}>Todo el equipo</option>
                {displayedTeamMembers.map((u) => (
                  <option key={u.id_user} value={u.id_user}>
                    {u.first_name} {u.last_name}
                  </option>
                ))}
              </select>

              {profile?.role !== "lider" && (
                <select
                  className="flex w-fit cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-black shadow-md outline-none backdrop-blur dark:border dark:border-white/10 dark:text-white"
                  value={selectedTeamId}
                  onChange={(e) => {
                    setSelectedTeamId(Number(e.target.value));
                    setSelectedUserId(0);
                  }}
                >
                  <option value={0}>Todos los equipos</option>
                  <option value={-1}>Sin equipo</option>
                  {teamsList.map((t) => (
                    <option key={t.id_team} value={t.id_team}>
                      {t.name || `Equipo ${t.id_team}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-x-4 sm:space-y-0">
            <div className="relative flex w-full appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-black shadow-md backdrop-blur dark:border dark:border-white/10 dark:text-white">
              <input
                type="text"
                placeholder="Buscar reservas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent outline-none placeholder:font-light placeholder:tracking-wide"
              />
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
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </div>

            <div className="flex space-x-2 md:space-x-4">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex w-fit cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-black shadow-md outline-none backdrop-blur dark:border dark:border-white/10 dark:text-white"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex w-fit cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-black shadow-md outline-none backdrop-blur dark:border dark:border-white/10 dark:text-white"
              />
            </div>
          </div>
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
          />
        )}

        <ToastContainer />

        {/* Estilos globales para asegurar legibilidad de los <option> */}
        <style jsx global>{`
          select option {
            background-color: white;
            color: black;
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
