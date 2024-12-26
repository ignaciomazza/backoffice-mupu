"use client";
import { useState, useEffect } from "react";
import { SalesTeam, User, UserTeam } from "@/types/index";

export default function TeamsPage() {
  const [name, setName] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [teams, setTeams] = useState<SalesTeam[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);

  const [isFormVisible, setIsFormVisible] = useState(false);

  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data: User[]) => setUsers(data));

    fetch("/api/teams")
      .then((res) => res.json())
      .then((data: SalesTeam[]) => setTeams(data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const url = editingTeamId ? `/api/teams/${editingTeamId}` : "/api/teams";
    const method = editingTeamId ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, userIds: selectedUserIds }),
    });

    if (response.ok) {
      const updatedTeam = await response.json();
      setTeams((prevTeams) =>
        editingTeamId
          ? prevTeams.map((team) =>
              team.id_team === editingTeamId ? updatedTeam : team
            )
          : [...prevTeams, updatedTeam]
      );
      setName("");
      setSelectedUserIds([]);
      setEditingTeamId(null);
    } else {
      console.error("Error al guardar el equipo");
    }
  };

  const handleEditTeam = (team: SalesTeam) => {
    setName(team.name);
    setSelectedUserIds(team.user_teams.map((ut) => ut.user.id_user));
    setEditingTeamId(team.id_team);
  };

  const handleDeleteTeam = async (id_team: number) => {
    const response = await fetch(`/api/teams/${id_team}`, {
      method: "DELETE",
    });

    if (response.ok) {
      setTeams((prev) => prev.filter((team) => team.id_team !== id_team));
    } else {
      console.error("Error al eliminar el equipo");
    }
  };

  const handleRemoveUserFromTeam = async (
    id_user_team: number,
    id_team: number
  ) => {
    const response = await fetch(
      `/api/teams/${id_team}/users/${id_user_team}`,
      {
        method: "DELETE",
      }
    );

    if (response.ok) {
      setTeams((prevTeams) =>
        prevTeams.map((team) =>
          team.id_team === id_team
            ? {
                ...team,
                user_teams: team.user_teams.filter(
                  (ut) => ut.id_user_team !== id_user_team
                ),
              }
            : team
        )
      );
    } else {
      console.error("Error al eliminar el usuario del equipo");
    }
  };

  return (
    <div className="container mx-auto p-4">
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
        className={`transition-all duration-300 overflow-hidden ${
          isFormVisible ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-black text-black shadow-md rounded-3xl p-6 space-y-3 mb-6 mx-2 dark:border dark:border-white"
        >
          <div>
            <label className="block text-lg mb-2 dark:text-white">Nombre del Equipo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full p-2 rounded-lg border"
            />
          </div>
          <div>
            <label className="block text-lg mb-2 dark:text-white">Seleccionar Miembros</label>
            <ul className="space-y-2">
              {users.map((user) => (
                <li key={user.id_user}>
                  <label className="flex items-center dark:text-white">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id_user)}
                      onChange={() =>
                        setSelectedUserIds((prev) =>
                          prev.includes(user.id_user)
                            ? prev.filter((id) => id !== user.id_user)
                            : [...prev, user.id_user]
                        )
                      }
                      className="custom-checkbox mr-2"
                    />
                    {user.first_name} {user.last_name}
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <button
            type="submit"
            className="block py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
          >
            {editingTeamId ? "Guardar Cambios" : "Crear Equipo"}
          </button>
        </form>
      </div>
      <h2 className="text-xl font-semibold dark:font-medium mt-8">Equipos Existentes</h2>
      <ul className="space-y-4 mt-4">
        {teams.map((team) => (
          <li
            key={team.id_team}
            className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-3 dark:border dark:border-opacity-50 dark:border-white"
          >
            <h3 className="text-lg font-semibold dark:font-medium">{team.name}</h3>
            <ul className="list-disc ml-5">
              {team.user_teams.map((userTeam: UserTeam) => (
                <li
                  key={userTeam.id_user_team}
                  className="list-none font-light"
                >
                  {userTeam.user.first_name} {userTeam.user.last_name}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-4 mt-4">
              <button
                className="block py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
                onClick={() => {
                  handleEditTeam(team);
                  setIsFormVisible(true);
                }}
              >
                Editar
              </button>
              <button
                className="block py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
                onClick={() => handleDeleteTeam(team.id_team)}
              >
                Eliminar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
