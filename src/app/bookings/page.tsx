// src/app/bookings/page.tsx
"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import BookingForm from "@/components/bookings/BookingForm";
import BookingList from "@/components/bookings/BookingList";
import Spinner from "@/components/Spinner";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Booking, User } from "@/types";
import { useAuth } from "@/context/AuthContext";

type BookingFormData = {
  id_booking?: number;
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

  // Roles con permiso de ver todo
  const filtros = ["lider", "gerente", "administrativo", "desarrollador"];

  // --- Profile, Users & Teams ---
  const [profile, setProfile] = useState<{
    id_user: number;
    role: string;
  } | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [teamsList, setTeamsList] = useState<any[]>([]);

  // Selecciones de filtros
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number>(0); // 0=Todos, >0=Equipo, -1=Sin equipo

  // --- Search & Date filters ---
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // --- Bookings state ---
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expandedBookingId, setExpandedBookingId] = useState<number | null>(
    null,
  );
  const [loadingBookings, setLoadingBookings] = useState<boolean>(true);

  // --- Form state ---
  const [formData, setFormData] = useState<BookingFormData>({
    id_booking: undefined,
    status: "Pendiente",
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

  // 1) Fetch profile + inicializar users & teams
  useEffect(() => {
    if (!token) return;

    fetch("/api/user/profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((p) => {
        setProfile(p);
        setFormData((prev) => ({ ...prev, id_user: p.id_user }));
        setSelectedUserId(filtros.includes(p.role) ? 0 : p.id_user);
        setSelectedTeamId(0);

        // Traer todos los equipos
        fetch("/api/teams", { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((allTeams: any[]) => {
            const teams =
              p.role === "lider"
                ? allTeams.filter((t) =>
                    t.user_teams.some(
                      (ut: any) =>
                        ut.user.id_user === p.id_user &&
                        ut.user.role === "lider",
                    ),
                  )
                : allTeams;
            setTeamsList(teams);
          })
          .catch((err) => console.error("Error fetching teams list:", err));

        if (filtros.includes(p.role)) {
          fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.json())
            .then((users: User[]) => {
              const filtered = users.filter((u) =>
                ["vendedor", "lider", "gerente"].includes(u.role),
              );
              setAllUsers(filtered);
              setTeamMembers(filtered);
            })
            .catch((err) => console.error("Error fetching users:", err));
        }

        if (p.role === "lider") {
          fetch("/api/teams", { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.json())
            .then((teams: any[]) => {
              const mine = teams.filter((t) =>
                t.user_teams.some(
                  (ut: any) =>
                    ut.user.id_user === p.id_user && ut.user.role === "lider",
                ),
              );
              const members = Array.from(
                new Map(
                  mine
                    .flatMap((t) => t.user_teams.map((ut: any) => ut.user))
                    .map((u: User) => [u.id_user, u]),
                ).values(),
              );
              setTeamMembers(members);
            })
            .catch((err) => console.error("Error fetching my teams:", err));
        }
      })
      .catch((err) => console.error("Error fetching profile:", err));
  }, [token]);

  // 2) Cuando cambie el equipo, actualizo la lista de usuarios del select
  useEffect(() => {
    if (!profile) return;
    if (!filtros.includes(profile.role)) return;

    setSelectedUserId(0);

    if (selectedTeamId > 0) {
      const team = teamsList.find((t) => t.id_team === selectedTeamId);
      const members = team
        ? team.user_teams.map((ut: any) => ut.user as User)
        : [];
      setTeamMembers(members);
    } else if (selectedTeamId === -1) {
      const assignedIds = teamsList.flatMap((t) =>
        t.user_teams.map((ut: any) => ut.user.id_user),
      );
      const unassigned = allUsers.filter(
        (u) => !assignedIds.includes(u.id_user),
      );
      setTeamMembers(unassigned);
    } else {
      setTeamMembers(allUsers);
    }
  }, [selectedTeamId, teamsList, profile, allUsers]);

  // 3) Fetch de bookings según filtros
  useEffect(() => {
    if (selectedUserId === null) return;
    setLoadingBookings(true);

    if (selectedUserId > 0) {
      fetch(`/api/bookings?userId=${selectedUserId}`)
        .then((r) => r.json())
        .then((data) => {
          setBookings(data);
          setLoadingBookings(false);
        })
        .catch(() => setLoadingBookings(false));
    } else if (selectedTeamId > 0) {
      fetch("/api/bookings")
        .then((r) => r.json())
        .then((all: Booking[]) => {
          const ids = teamsList
            .find((t) => t.id_team === selectedTeamId)!
            .user_teams.map((ut: any) => ut.user.id_user);
          setBookings(all.filter((b) => ids.includes(b.user.id_user)));
          setLoadingBookings(false);
        })
        .catch(() => setLoadingBookings(false));
    } else if (selectedTeamId === -1) {
      fetch("/api/bookings")
        .then((r) => r.json())
        .then((data: Booking[]) => {
          const assignedIds = teamsList.flatMap((t) =>
            t.user_teams.map((ut: any) => ut.user.id_user),
          );
          const filtered = data.filter(
            (b) => !assignedIds.includes(b.user.id_user),
          );
          setBookings(filtered);
          setLoadingBookings(false);
        })
        .catch(() => setLoadingBookings(false));
    } else {
      fetch("/api/bookings")
        .then((r) => r.json())
        .then((data) => {
          setBookings(data);
          setLoadingBookings(false);
        })
        .catch(() => setLoadingBookings(false));
    }
  }, [selectedUserId, selectedTeamId, teamsList]);

  // Handlers y demás
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

    // Validación de campos obligatorios para la reserva
    if (
      !formData.details.trim() ||
      !formData.invoice_type.trim() ||
      !formData.invoice_observation.trim() ||
      formData.titular_id === 0 ||
      !formData.departure_date ||
      !formData.return_date ||
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

    // Si se selecciona "Factura A", validar que el titular tenga cargados:
    // Razón Social, Domicilio Comercial, Email y CUIT
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

      // Actualizar listado de reservas
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
      status: "Pendiente",
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
      status: booking.status,
      details: booking.details || "",
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
    } catch (err: any) {
      console.error("Error deleting booking:", err);
      toast.error(err.message || "Error al eliminar la reserva.");
    }
  };

  // Filtrado UI por búsqueda/fechas
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
    });

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

        {/* filtros */}
        <div className="mb-4 space-y-4">
          {(profile?.role === "lider" ||
            profile?.role === "gerente" ||
            profile?.role === "administrativo" ||
            profile?.role === "desarrollador") && (
            <div className="flex justify-end space-x-2">
              <select
                className="w-fit cursor-pointer appearance-none rounded-2xl border bg-transparent p-2 px-3 outline-none dark:border-white/50 dark:text-white"
                value={selectedUserId!}
                onChange={(e) => {
                  setSelectedUserId(Number(e.target.value));
                }}
              >
                <option value={0}>Todo el equipo</option>
                {teamMembers.map((u) => (
                  <option key={u.id_user} value={u.id_user}>
                    {u.first_name} {u.last_name}
                  </option>
                ))}
              </select>

              {profile?.role !== "lider" && (
                <select
                  className="w-fit cursor-pointer appearance-none rounded-2xl border bg-transparent p-2 px-3 outline-none dark:border-white/50 dark:text-white"
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
                      {t.name || t.team_name || `Equipo ${t.id_team}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-x-4 sm:space-y-0">
            <div className="relative flex w-full rounded-2xl border px-4 py-2 dark:border-white/50 dark:text-white">
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

            <div className="flex space-x-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-2xl border p-2 px-3 outline-none dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-2xl border p-2 px-3 outline-none dark:border-white/50 dark:bg-[#252525] dark:text-white"
              />
            </div>
          </div>
        </div>

        {loadingBookings ? (
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
          />
        )}

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
