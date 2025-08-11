"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Client, User, SalesTeam } from "@/types";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import ClientForm from "@/components/clients/ClientForm";
import ClientList from "@/components/clients/ClientList";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import "react-toastify/dist/ReactToastify.css";
import FilterPanel from "@/components/clients/FilterPanel";

const FILTROS = [
  "lider",
  "gerente",
  "administrativo",
  "desarrollador",
] as const;
type FilterRole = (typeof FILTROS)[number];

// Debounce helper
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Page() {
  const { token } = useAuth();

  // --- Perfil, Users & Teams ---
  const [profile, setProfile] = useState<{
    id_user: number;
    role: FilterRole;
    id_agency: number;
  } | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [teamsList, setTeamsList] = useState<SalesTeam[]>([]);

  // selecciones de filtros
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [selectedTeamId, setSelectedTeamId] = useState<number>(0);

  // buscador
  const [searchTerm, setSearchTerm] = useState<string>("");
  const debouncedSearch = useDebounced(searchTerm, 400);

  // --- Clients state ---
  const [clients, setClients] = useState<Client[]>([]);
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Paginación (API ahora retorna { items, nextCursor })
  const TAKE = 24;
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // --- Form state ---
  const [formData, setFormData] = useState<
    Omit<Client, "id_client" | "registration_date" | "user"> & {
      id_user: number;
      id_agency: number;
    }
  >({
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
    postal_code: "",
    locality: "",
    company_name: "",
    tax_id: "",
    commercial_address: "",
    dni_number: "",
    passport_number: "",
    birth_date: "",
    nationality: "",
    gender: "",
    email: "",
    id_user: 0,
    id_agency: 0,
  });
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);

  // Abort + race conditions control
  const fetchAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // 1) Cargar perfil + equipos + usuarios visibles según rol
  useEffect(() => {
    if (!token) return;

    const abort = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/user/profile", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
          signal: abort.signal,
        });
        if (!res.ok) throw new Error("No se pudo obtener el perfil");
        const p = (await res.json()) as {
          id_user: number;
          id_agency: number;
          role: FilterRole;
        };
        setProfile(p);
        setFormData((f) => ({
          ...f,
          id_user: p.id_user,
          id_agency: p.id_agency,
        }));
        setSelectedUserId(FILTROS.includes(p.role) ? 0 : p.id_user);
        setSelectedTeamId(0);

        // Equipos de la agencia
        const teamsRes = await fetch(`/api/teams?agencyId=${p.id_agency}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
          signal: abort.signal,
        });
        if (!teamsRes.ok) throw new Error("No se pudieron cargar los equipos");
        const allTeams = (await teamsRes.json()) as SalesTeam[];
        const allowedTeams =
          p.role === "lider"
            ? allTeams.filter((t) =>
                t.user_teams.some(
                  (ut) =>
                    ut.user.id_user === p.id_user && ut.user.role === "lider",
                ),
              )
            : allTeams;
        setTeamsList(allowedTeams);

        // Usuarios visibles
        if (FILTROS.includes(p.role)) {
          const usersRes = await fetch("/api/users", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            credentials: "include",
            signal: abort.signal,
          });
          if (!usersRes.ok)
            throw new Error("No se pudieron cargar los usuarios");
          const users = (await usersRes.json()) as User[];
          setAllUsers(users);
          setTeamMembers(users);
        }

        // Si es líder: solo miembros de sus equipos
        if (p.role === "lider") {
          const myTeams = allowedTeams.filter((t) =>
            t.user_teams.some(
              (ut) => ut.user.id_user === p.id_user && ut.user.role === "lider",
            ),
          );
          const members = Array.from(
            new Map(
              myTeams
                .flatMap((t) => t.user_teams.map((ut) => ut.user))
                .map((u) => [u.id_user, u]),
            ).values(),
          );
          setTeamMembers(members as User[]);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("❌ Error inicializando perfil/equipos/usuarios:", err);
        toast.error("No se pudo inicializar la vista de clientes.");
      }
    })();

    return () => abort.abort();
  }, [token]);

  // 2) Al cambiar de equipo (solo roles no-líder), recalcular miembros visibles
  useEffect(() => {
    if (!profile || profile.role === "lider") return;
    setSelectedUserId(0);
    if (selectedTeamId > 0) {
      const team = teamsList.find((t) => t.id_team === selectedTeamId);
      setTeamMembers(team ? team.user_teams.map((ut) => ut.user) : []);
    } else if (selectedTeamId === -1) {
      const assigned = teamsList.flatMap((t) =>
        t.user_teams.map((ut) => ut.user.id_user),
      );
      setTeamMembers(allUsers.filter((u) => !assigned.includes(u.id_user)));
    } else {
      setTeamMembers(allUsers);
    }
  }, [selectedTeamId, teamsList, profile, allUsers]);

  // 3) Fetch de clientes (usa la nueva API: { items, nextCursor } y filtros server-side)
  const buildClientsQuery = useCallback(
    (opts?: { cursor?: number | null }) => {
      const qs = new URLSearchParams();
      if (selectedUserId > 0) qs.append("userId", String(selectedUserId));
      if (selectedTeamId !== 0) qs.append("teamId", String(selectedTeamId));
      if (debouncedSearch.trim()) qs.append("q", debouncedSearch.trim());
      qs.append("take", String(TAKE));
      if (opts?.cursor) qs.append("cursor", String(opts.cursor));
      return qs.toString();
    },
    [selectedUserId, selectedTeamId, debouncedSearch],
  );

  useEffect(() => {
    if (!profile || !token) return;

    setIsLoading(true);

    // cancelar petición anterior si existe
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const myRequestId = ++requestIdRef.current;

    (async () => {
      try {
        const qs = buildClientsQuery();
        const res = await fetch(`/api/clients?${qs}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Error al obtener clientes");
        const { items, nextCursor } = await res.json();
        if (myRequestId !== requestIdRef.current) return; // evita race
        setClients(items as Client[]);
        setNextCursor(nextCursor ?? null);
        setExpandedClientId(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("❌ Error fetching clients:", err);
        toast.error("Error al obtener clientes.");
        setClients([]);
        setNextCursor(null);
      } finally {
        if (
          myRequestId === requestIdRef.current &&
          !controller.signal.aborted
        ) {
          setIsLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [
    profile,
    selectedUserId,
    selectedTeamId,
    debouncedSearch,
    token,
    buildClientsQuery,
  ]);

  // (Opcional) cargar más
  const loadMore = async () => {
    if (!nextCursor || !token || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = buildClientsQuery({ cursor: nextCursor });
      const res = await fetch(`/api/clients?${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("No se pudieron cargar más clientes");
      const { items, nextCursor: newCursor } = await res.json();
      setClients((prev) => [...prev, ...(items as Client[])]);
      setNextCursor(newCursor ?? null);
    } catch (e) {
      console.error("loadMore clients:", e);
      toast.error("No se pudieron cargar más clientes.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Handlers de formulario
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.dni_number?.trim() && !formData.passport_number?.trim()) {
      toast.error(
        "El DNI y el Pasaporte son obligatorios. Debes cargar al menos uno",
      );
      return;
    }

    // backend espera "YYYY-MM-DD" o fecha parseable local; normalizamos
    const birthISO =
      formData.birth_date && formData.birth_date.includes("T")
        ? formData.birth_date.split("T")[0]
        : formData.birth_date;

    try {
      const url = editingClientId
        ? `/api/clients/${editingClientId}`
        : "/api/clients";
      const method = editingClientId ? "PUT" : "POST";
      const payload = { ...formData, birth_date: birthISO };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const body = await res.json();
      if (!res.ok)
        throw new Error(body?.error || "Error al guardar el cliente");

      // Refrescar primera página con filtros actuales
      const qs = buildClientsQuery();
      const listRes = await fetch(`/api/clients?${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!listRes.ok) throw new Error("No se pudo refrescar la lista.");
      const { items, nextCursor } = await listRes.json();
      setClients(items as Client[]);
      setNextCursor(nextCursor ?? null);
      setExpandedClientId(null);

      toast.success("Cliente guardado con éxito!");
    } catch (err: unknown) {
      console.error("Error al guardar el cliente:", err);
      toast.error(
        (err as Error).message ||
          "Error al guardar el cliente. Intente nuevamente.",
      );
    } finally {
      setFormData((prev) => ({
        first_name: "",
        last_name: "",
        phone: "",
        address: "",
        postal_code: "",
        locality: "",
        company_name: "",
        tax_id: "",
        commercial_address: "",
        dni_number: "",
        passport_number: "",
        birth_date: "",
        nationality: "",
        gender: "",
        email: "",
        id_user: prev.id_user,
        id_agency: prev.id_agency,
      }));
      setIsFormVisible(false);
      setEditingClientId(null);
    }
  };

  const deleteClient = async (id: number) => {
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body?.error ||
            (res.status === 409
              ? "El cliente tiene movimientos."
              : "Error al eliminar el cliente"),
        );
      }
      setClients((prev) => prev.filter((c) => c.id_client !== id));
      toast.success("Cliente eliminado con éxito!");
    } catch (err: unknown) {
      console.error("Error al eliminar el cliente:", err);
      toast.error(
        (err as Error).message ||
          "Error al eliminar el cliente. Intente nuevamente.",
      );
    }
  };

  const startEditingClient = (client: Client) => {
    setFormData({
      first_name: client.first_name,
      last_name: client.last_name,
      phone: client.phone || "",
      address: client.address || "",
      postal_code: client.postal_code || "",
      locality: client.locality || "",
      company_name: client.company_name || "",
      tax_id: client.tax_id || "",
      commercial_address: client.commercial_address || "",
      dni_number: client.dni_number || "",
      passport_number: client.passport_number || "",
      birth_date: client.birth_date
        ? new Date(client.birth_date).toISOString().split("T")[0]
        : "",
      nationality: client.nationality || "",
      gender: client.gender || "",
      email: client.email || "",
      id_user: client.user.id_user,
      id_agency: client.user.id_agency,
    });
    setEditingClientId(client.id_client);
    setIsFormVisible(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("es-AR", {
      timeZone: "UTC",
    });
  };

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        <motion.div layout>
          <ClientForm
            formData={formData}
            handleChange={handleChange}
            handleSubmit={handleSubmit}
            editingClientId={editingClientId}
            isFormVisible={isFormVisible}
            setIsFormVisible={setIsFormVisible}
          />
        </motion.div>

        <h2 className="my-4 text-2xl font-semibold dark:font-medium">
          Clientes
        </h2>

        <FilterPanel
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          role={profile?.role}
          selectedUserId={selectedUserId}
          setSelectedUserId={setSelectedUserId}
          selectedTeamId={selectedTeamId}
          setSelectedTeamId={setSelectedTeamId}
          displayedTeamMembers={teamMembers}
          teams={teamsList}
        />

        {isLoading ? (
          <div className="flex min-h-[50vh] items-center">
            <Spinner />
          </div>
        ) : (
          <ClientList
            clients={clients}
            expandedClientId={expandedClientId}
            setExpandedClientId={setExpandedClientId}
            formatDate={formatDate}
            startEditingClient={startEditingClient}
            deleteClient={deleteClient}
            hasMore={Boolean(nextCursor)}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
          />
        )}

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
