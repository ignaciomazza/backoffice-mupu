"use client";
import { useState, useEffect } from "react";
import { SalesTeam, User } from "@/types";
import TeamForm from "@/components/teams/TeamForm";
import TeamList from "@/components/teams/TeamList";
import { toast, ToastContainer } from "react-toastify";
import Spinner from "@/components/Spinner";
import "react-toastify/dist/ReactToastify.css";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

export default function TeamsPage() {
  const { token } = useAuth();

  // --- Perfil (para id_agency) ---
  const [agencyId, setAgencyId] = useState<number | null>(null);
  useEffect(() => {
    if (!token) return;
    fetch("/api/user/profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((p: { id_agency: number }) => setAgencyId(p.id_agency))
      .catch(() => toast.error("Error al obtener perfil"));
  }, [token]);

  const [name, setName] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(true);

  // Cargar usuarios
  useEffect(() => {
    if (!token) return;
    fetch("/api/users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<User[]>;
      })
      .then(setUsers)
      .catch(() => toast.error("Error al obtener usuarios"));
  }, [token]);

  // Cargar equipos de la agencia
  useEffect(() => {
    if (agencyId == null || !token) return;
    setLoadingTeams(true);
    fetch(`/api/teams?agencyId=${agencyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<SalesTeam[]>;
      })
      .then((data) => setTeams(data))
      .catch(() => toast.error("Error al obtener equipos"))
      .finally(() => setLoadingTeams(false));
  }, [agencyId, token]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      toast.error("El nombre del equipo es obligatorio.");
      return;
    }
    if (selectedUserIds.length === 0) {
      toast.error("Debe seleccionar al menos un miembro para el equipo.");
      return;
    }
    if (agencyId == null) {
      toast.error("Agencia no definida");
      return;
    }

    const url = editingTeamId ? `/api/teams/${editingTeamId}` : "/api/teams";
    const method = editingTeamId ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          userIds: selectedUserIds,
          id_agency: agencyId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar el equipo");
      }
      const team: SalesTeam = await res.json();
      setTeams((prev) =>
        editingTeamId
          ? prev.map((t) => (t.id_team === editingTeamId ? team : t))
          : [...prev, team],
      );
      toast.success(editingTeamId ? "Equipo actualizado!" : "Equipo creado!");
      // reset
      setName("");
      setSelectedUserIds([]);
      setEditingTeamId(null);
      setIsFormVisible(false);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    }
  };

  const handleEditTeam = (team: SalesTeam) => {
    setName(team.name);
    setSelectedUserIds(team.user_teams.map((ut) => ut.user.id_user));
    setEditingTeamId(team.id_team);
    setIsFormVisible(true);
  };

  const handleDeleteTeam = async (id_team: number) => {
    try {
      const res = await fetch(`/api/teams/${id_team}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setTeams((prev) => prev.filter((t) => t.id_team !== id_team));
      toast.success("Equipo eliminado con éxito");
    } catch {
      toast.error("Error al eliminar el equipo");
    }
  };

  return (
    <ProtectedRoute>
      <div className="container mx-auto">
        <h1 className="mb-4 text-2xl font-bold">Equipos de Ventas</h1>
        <div
          onClick={() => setIsFormVisible((prev) => !prev)}
          className="mx-2 my-12 flex cursor-pointer items-center justify-end gap-2 border-b border-sky-950 pb-1 text-lg font-medium text-sky-950 dark:border-white dark:text-white"
        >
          {isFormVisible ? (
            <p className="flex items-center gap-1">
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
                  d="m4.5 15.75 7.5-7.5 7.5 7.5"
                />
              </svg>
              Ocultar
            </p>
          ) : editingTeamId ? (
            <p className="flex items-center gap-1">
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
                  d="m19.5 8.25-7.5 7.5-7.5-7.5"
                />
              </svg>
              Editar
            </p>
          ) : (
            <p className="flex items-center gap-1">
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
                  d="m19.5 8.25-7.5 7.5-7.5-7.5"
                />
              </svg>
              Agregar
            </p>
          )}
        </div>

        <div
          className={`overflow-hidden transition-all duration-300 ${
            isFormVisible ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <TeamForm
            name={name}
            selectedUserIds={selectedUserIds}
            users={users}
            onNameChange={setName}
            onUserToggle={(userId) => {
              setSelectedUserIds((prev) =>
                prev.includes(userId)
                  ? prev.filter((id) => id !== userId)
                  : [...prev, userId],
              );
            }}
            onSubmit={handleFormSubmit}
            isVisible={isFormVisible}
          />
        </div>

        <h2 className="my-4 text-xl font-semibold dark:font-medium">
          Equipos Existentes
        </h2>
        {loadingTeams ? (
          <Spinner />
        ) : (
          <TeamList
            teams={teams}
            onEdit={handleEditTeam}
            onDelete={handleDeleteTeam}
          />
        )}
        <ToastContainer />
      </div>
    </ProtectedRoute>
  );
}
