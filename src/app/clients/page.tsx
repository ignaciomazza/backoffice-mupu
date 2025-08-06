"use client";
import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Client, User, SalesTeam } from "@/types";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import ClientForm from "@/components/clients/ClientForm";
import ClientList from "@/components/clients/ClientList";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import "react-toastify/dist/ReactToastify.css";

const FILTROS = [
  "lider",
  "gerente",
  "administrativo",
  "desarrollador",
] as const;
type FilterRole = (typeof FILTROS)[number];

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
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number>(0);

  // buscador
  const [searchTerm, setSearchTerm] = useState<string>("");

  // --- Clients state ---
  const [clients, setClients] = useState<Client[]>([]);
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

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

  useEffect(() => {
    if (!token) return;

    fetch("/api/user/profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((p) => {
        // Guardamos perfil y preparamos el formData
        setProfile(p);
        setFormData((f) => ({
          ...f,
          id_user: p.id_user,
          id_agency: p.id_agency,
        }));
        setSelectedUserId(FILTROS.includes(p.role) ? 0 : p.id_user);
        setSelectedTeamId(0);

        // 1) Cargamos los equipos de la agencia
        fetch(`/api/teams?agencyId=${p.id_agency}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => {
            if (!r.ok) throw new Error("No se pudieron cargar los equipos");
            return r.json() as Promise<SalesTeam[]>;
          })
          .then((allTeams) => {
            const allowedTeams =
              p.role === "lider"
                ? allTeams.filter((t) =>
                    t.user_teams.some(
                      (ut) =>
                        ut.user.id_user === p.id_user &&
                        ut.user.role === "lider",
                    ),
                  )
                : allTeams;
            setTeamsList(allowedTeams);
          })
          .catch((err) => console.error("❌ Error fetching teams:", err));

        // 2) Si el rol permite ver todos los usuarios, los cargamos
        if (FILTROS.includes(p.role)) {
          fetch("/api/users", {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => {
              if (!r.ok) throw new Error("No se pudieron cargar los usuarios");
              return r.json() as Promise<User[]>;
            })
            .then((users) => {
              setAllUsers(users);
              setTeamMembers(users);
            })
            .catch((err) => console.error("❌ Error fetching users:", err));
        }

        // 3) Si es líder, únicamente sus miembros
        if (p.role === "lider") {
          fetch(`/api/teams?agencyId=${p.id_agency}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => {
              if (!r.ok) throw new Error("No se pudieron cargar los equipos");
              return r.json() as Promise<SalesTeam[]>;
            })
            .then((allTeams) => {
              const myTeams = allTeams.filter((t) =>
                t.user_teams.some(
                  (ut) =>
                    ut.user.id_user === p.id_user && ut.user.role === "lider",
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
            })
            .catch((err) =>
              console.error("❌ Error fetching my teams members:", err),
            );
        }
      })
      .catch((err) => console.error("❌ Error fetching profile:", err));
  }, [token]);

  // 2) Al cambiar de equipo, recalcular miembros
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

  // 3) Fetch de clientes (agencia + filtros + validación)
  useEffect(() => {
    if (!profile || selectedUserId === null) return;

    setIsLoading(true);
    (async () => {
      try {
        let url = `/api/clients?agencyId=${profile.id_agency}`;
        if (selectedUserId > 0) url += `&userId=${selectedUserId}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);

        const data = await res.json();
        if (!Array.isArray(data)) {
          console.error("❌ clients response is not array:", data);
          setClients([]);
          return;
        }

        let filtered: Client[] = data;
        if (searchTerm.trim()) {
          const s = searchTerm.toLowerCase();
          filtered = filtered.filter(
            (c) =>
              `${c.first_name} ${c.last_name}`.toLowerCase().includes(s) ||
              (c.dni_number || "").includes(s) ||
              (c.passport_number || "").includes(s) ||
              (c.email || "").toLowerCase().includes(s) ||
              c.id_client.toString() === s ||
              (c.tax_id || "").toLowerCase().includes(s) ||
              (c.company_name || "").toLowerCase().includes(s),
          );
        }
        setClients(filtered);
      } catch (err) {
        console.error("❌ Error fetching clients:", err);
        toast.error("Error al obtener clientes.");
        setClients([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [profile, selectedUserId, searchTerm, token]);

  // Handlers de formulario, borrar, editar, etc...
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
    try {
      const url = editingClientId
        ? `/api/clients/${editingClientId}`
        : "/api/clients";
      const method = editingClientId ? "PUT" : "POST";
      const payload = {
        ...formData,
        birth_date: formData.birth_date
          ? new Date(formData.birth_date).toISOString()
          : null,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Error al guardar el cliente");
      setClients((prev) =>
        editingClientId
          ? prev.map((c) => (c.id_client === editingClientId ? body : c))
          : [...prev, body],
      );
      toast.success("Cliente guardado con éxito!");
    } catch (err: unknown) {
      console.error("Error al guardar el cliente:", err);
      toast.error(
        (err as Error).message ||
          "Error al guardar el cliente. Intente nuevamente.",
      );
    } finally {
      setFormData({
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
        id_user: formData.id_user,
        id_agency: formData.id_agency,
      });
      setIsFormVisible(false);
      setEditingClientId(null);
    }
  };

  const deleteClient = async (id: number) => {
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al eliminar el cliente");
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

        <div className="mb-4 flex w-full items-center space-x-2">
          <div className="relative flex w-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:border dark:border-white/10 dark:text-white">
            <input
              type="text"
              placeholder="Buscar clientes..."
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

          {(profile?.role === "lider" ||
            profile?.role === "gerente" ||
            profile?.role === "administrativo" ||
            profile?.role === "desarrollador") && (
            <div className="flex gap-2">
              <select
                className="w-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 p-2 px-3 text-sky-950 shadow-md shadow-sky-950/10 outline-none backdrop-blur dark:text-white md:w-fit"
                value={selectedUserId!}
                onChange={(e) => setSelectedUserId(Number(e.target.value))}
              >
                <option value={0}>Todo el equipo</option>
                {teamMembers.map((u) => (
                  <option key={u.id_user} value={u.id_user}>
                    {u.first_name} {u.last_name}
                  </option>
                ))}
              </select>

              {profile.role !== "lider" && (
                <select
                  className="w-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 p-2 px-3 text-sky-950 shadow-md shadow-sky-950/10 outline-none backdrop-blur dark:text-white md:w-fit"
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
        </div>

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
          />
        )}

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
