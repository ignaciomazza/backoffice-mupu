// src/app/teams/page.tsx (o donde lo tengas)
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
import { authFetch } from "@/utils/authFetch";

export default function TeamsPage() {
  const { token } = useAuth();

  // --- Perfil (para id_agency) ---
  const [agencyId, setAgencyId] = useState<number | null>(null);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    (async () => {
      try {
        const r = await authFetch(
          "/api/user/profile",
          { signal: controller.signal },
          token,
        );
        if (!r.ok) throw new Error("Error al obtener perfil");
        const p: { id_agency: number } = await r.json();
        setAgencyId(p.id_agency);
      } catch (e) {
        if ((e as DOMException)?.name !== "AbortError") {
          toast.error("Error al obtener perfil");
        }
      }
    })();

    return () => controller.abort();
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
    const controller = new AbortController();

    (async () => {
      try {
        const res = await authFetch(
          "/api/users",
          { signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error();
        const data: User[] = await res.json();
        setUsers(data);
      } catch (e) {
        if ((e as DOMException)?.name !== "AbortError") {
          toast.error("Error al obtener usuarios");
        }
      }
    })();

    return () => controller.abort();
  }, [token]);

  // Cargar equipos de la agencia
  useEffect(() => {
    if (agencyId == null || !token) return;
    setLoadingTeams(true);
    const controller = new AbortController();

    (async () => {
      try {
        const res = await authFetch(
          `/api/teams?agencyId=${agencyId}`,
          { signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error();
        const data: SalesTeam[] = await res.json();
        setTeams(data);
      } catch (e) {
        if ((e as DOMException)?.name !== "AbortError") {
          toast.error("Error al obtener equipos");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingTeams(false);
      }
    })();

    return () => controller.abort();
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
      const res = await authFetch(
        url,
        {
          method,
          body: JSON.stringify({
            name,
            userIds: selectedUserIds,
            id_agency: agencyId,
          }),
        },
        token,
      );

      if (!res.ok) {
        let msg = "Error al guardar el equipo";
        try {
          const err = await res.json();
          msg = err?.error || msg;
        } catch {}
        throw new Error(msg);
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
    } catch (err) {
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
      const res = await authFetch(
        `/api/teams/${id_team}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) throw new Error("Error al eliminar el equipo");
      setTeams((prev) => prev.filter((t) => t.id_team !== id_team));
      toast.success("Equipo eliminado con éxito");
    } catch (e) {
      toast.error((e as Error).message || "Error al eliminar el equipo");
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
