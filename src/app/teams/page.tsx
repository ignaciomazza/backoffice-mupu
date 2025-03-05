// src/app/teams/page.tsx

"use client";
import { useState, useEffect } from "react";
import { SalesTeam, User } from "@/types";
import TeamForm from "@/components/teams/TeamForm";
import TeamList from "@/components/teams/TeamList";
import { toast, ToastContainer } from "react-toastify";
import Spinner from "@/components/Spinner";
import "react-toastify/dist/ReactToastify.css";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function TeamsPage() {
  const [name, setName] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [isFormVisible, setIsFormVisible] = useState<boolean>(false);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [loadingTeams, setLoadingTeams] = useState<boolean>(true);

  // Cargar usuarios
  useEffect(() => {
    setLoadingUsers(true);
    fetch("/api/users")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Error al obtener usuarios");
        }
        return res.json();
      })
      .then((data: User[]) => {
        setUsers(data);
        setLoadingUsers(false);
      })
      .catch((error) => {
        console.error("Error fetching users:", error);
        toast.error("Error al obtener usuarios");
        setLoadingUsers(false);
      });
  }, []);

  // Cargar equipos
  useEffect(() => {
    setLoadingTeams(true);
    fetch("/api/teams")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Error al obtener equipos");
        }
        return res.json();
      })
      .then((data: SalesTeam[]) => {
        setTeams(data);
        setLoadingTeams(false);
      })
      .catch((error) => {
        console.error("Error fetching teams:", error);
        toast.error("Error al obtener equipos");
        setLoadingTeams(false);
      });
  }, []);

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name) {
      toast.error("El nombre del equipo es obligatorio.");
      return;
    }
    if (selectedUserIds.length === 0) {
      toast.error("Debe seleccionar al menos un miembro para el equipo.");
      return;
    }

    const url = editingTeamId ? `/api/teams/${editingTeamId}` : "/api/teams";
    const method = editingTeamId ? "PUT" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, userIds: selectedUserIds }),
      });
      if (!response.ok) {
        const errorResponse = await response.json();
        throw new Error(errorResponse.error || "Error al guardar el equipo");
      }
      const updatedTeam = await response.json();
      setTeams((prevTeams) =>
        editingTeamId
          ? prevTeams.map((team) =>
              team.id_team === editingTeamId ? updatedTeam : team
            )
          : [...prevTeams, updatedTeam]
      );
      toast.success(
        editingTeamId
          ? "Equipo actualizado con éxito!"
          : "Equipo creado con éxito!"
      );
      setName("");
      setSelectedUserIds([]);
      setEditingTeamId(null);
    } catch (error: any) {
      console.error("Error al guardar el equipo:", error.message || error);
      toast.error(error.message || "Error al guardar el equipo");
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
      const response = await fetch(`/api/teams/${id_team}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Error al eliminar el equipo");
      }
      setTeams((prevTeams) =>
        prevTeams.filter((team) => team.id_team !== id_team)
      );
      toast.success("Equipo eliminado con éxito");
    } catch (error: any) {
      console.error("Error al eliminar el equipo:", error.message || error);
      toast.error("Error al eliminar el equipo");
    }
  };

  return (
    <ProtectedRoute>
      <div className="container mx-auto">
        <h1 className="text-2xl font-bold mb-4">Equipos de Ventas</h1>
        <div
          onClick={() => setIsFormVisible((prev) => !prev)}
          className="text-lg font-medium cursor-pointer my-12 flex items-center justify-end gap-2 text-black dark:text-white border-b border-black dark:border-white mx-2 pb-1"
        >
          {isFormVisible ? (
            <p className="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
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
                className="w-6 h-6"
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
                className="w-6 h-6"
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
          className={`transition-all duration-300 overflow-hidden ${
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
                  : [...prev, userId]
              );
            }}
            onSubmit={handleFormSubmit}
            isVisible={isFormVisible}
          />
        </div>

        <h2 className="text-xl font-semibold dark:font-medium my-4">
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
