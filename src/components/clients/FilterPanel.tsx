// src/components/clients/FilterPanel.tsx
"use client";
import {
  useState,
  Dispatch,
  SetStateAction,
  useEffect,
  ChangeEvent,
} from "react";
import { motion } from "framer-motion";
import { User, SalesTeam } from "@/types";
import ClientPicker from "@/components/clients/ClientPicker";

interface Props {
  token?: string | null;
  role?: string | null;
  teams: SalesTeam[];
  displayedTeamMembers: User[];
  selectedUserId: number; // 0 = todos
  setSelectedUserId: Dispatch<SetStateAction<number>>;
  selectedTeamId: number; // 0 = todos, -1 = sin equipo
  setSelectedTeamId: Dispatch<SetStateAction<number>>;
  selectedGender: "" | "Masculino" | "Femenino" | "No Binario";
  setSelectedGender: Dispatch<
    SetStateAction<"" | "Masculino" | "Femenino" | "No Binario">
  >;
  profileOptions: Array<{ key: string; label: string }>;
  selectedProfileKey: string;
  setSelectedProfileKey: Dispatch<SetStateAction<string>>;
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  relatedClientId: number | null;
  setRelatedClientId: Dispatch<SetStateAction<number | null>>;
}

export default function FilterPanel({
  token,
  role = "",
  teams,
  displayedTeamMembers,
  selectedUserId,
  setSelectedUserId,
  selectedTeamId,
  setSelectedTeamId,
  selectedGender,
  setSelectedGender,
  profileOptions,
  selectedProfileKey,
  setSelectedProfileKey,
  searchTerm,
  setSearchTerm,
  relatedClientId,
  setRelatedClientId,
}: Props) {
  const [open, setOpen] = useState(false);
  const actualRole = role ?? "";
  const isManager = ["gerente", "administrativo", "desarrollador"].includes(
    actualRole,
  );
  const isLeader = actualRole === "lider";

  // ===== Draft (estados locales) =====
  const [draftUserId, setDraftUserId] = useState<number>(selectedUserId);
  const [draftTeamId, setDraftTeamId] = useState<number>(selectedTeamId);
  const [draftGender, setDraftGender] = useState<
    "" | "Masculino" | "Femenino" | "No Binario"
  >(selectedGender);
  const [draftProfileKey, setDraftProfileKey] = useState<string>(
    selectedProfileKey || "all",
  );
  const [draftSearch, setDraftSearch] = useState<string>(searchTerm);
  const [draftRelatedClientId, setDraftRelatedClientId] = useState<
    number | null
  >(relatedClientId);

  // Sincronizar draft cuando cambian los commits (por navegación, montado, etc.)
  useEffect(() => {
    setDraftUserId(selectedUserId);
    setDraftTeamId(selectedTeamId);
    setDraftGender(selectedGender);
    setDraftProfileKey(selectedProfileKey || "all");
    setDraftSearch(searchTerm);
    setDraftRelatedClientId(relatedClientId);
  }, [
    selectedUserId,
    selectedTeamId,
    selectedGender,
    selectedProfileKey,
    searchTerm,
    relatedClientId,
  ]);

  // ===== Handlers =====
  const onTeamChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const t = Number(e.target.value);
    setDraftTeamId(t);
    setDraftUserId(0); // al cambiar equipo, reseteamos usuario
  };

  const applyFilters = () => {
    setSelectedUserId(draftUserId);
    setSelectedTeamId(draftTeamId);
    setSelectedGender(draftGender);
    setSelectedProfileKey(draftProfileKey);
    setSearchTerm(draftSearch);
    setRelatedClientId(draftRelatedClientId);
    // setOpen(false); // si querés cerrarlo al aplicar, descomentá
  };

  const resetFilters = () => {
    setDraftUserId(0);
    setDraftTeamId(0);
    setDraftGender("");
    setDraftProfileKey("all");
    setDraftSearch("");
    setDraftRelatedClientId(null);

    setSelectedUserId(0);
    setSelectedTeamId(0);
    setSelectedGender("");
    setSelectedProfileKey("all");
    setSearchTerm("");
    setRelatedClientId(null);
  };

  // ===== UI =====
  const inputClass =
    "w-full cursor-pointer appearance-none rounded-2xl border border-sky-200 bg-white/50 p-2 px-3 outline-none shadow-sm shadow-sky-950/10 backdrop-blur placeholder:font-light placeholder:tracking-wide dark:bg-sky-100/10 dark:border-sky-200/60 dark:text-white";

  const btn = "rounded-2xl px-4 py-2 shadow-sm border transition";

  const variants = {
    closed: { height: 0, opacity: 0, padding: 0, marginTop: 0 },
    open: { height: "auto", opacity: 1, padding: 24, marginTop: 16 },
  };

  return (
    <div className="mb-4 flex flex-col gap-2">
      {/* Barra superior: búsqueda + toggle filtros */}
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex w-full items-center gap-2 rounded-2xl border border-sky-200 bg-white/50 px-4 py-1 text-sky-950 shadow-sm shadow-sky-950/10 backdrop-blur dark:border-sky-200/60 dark:bg-sky-100/10 dark:text-white">
          <input
            type="text"
            placeholder="Buscar pasajeros..."
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
            className="w-full bg-transparent outline-none placeholder:font-light placeholder:tracking-wide"
          />
          {/* Lupa como botón: aplica búsqueda */}
          <button
            type="button"
            aria-label="Buscar"
            onClick={applyFilters}
            className="p-1 opacity-80 hover:opacity-100"
            title="Buscar"
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
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          </button>
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-6 py-2 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:text-white"
        >
          {/* Icono sliders */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.4}
            stroke="currentColor"
            className="size-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
            />
          </svg>
          <span>Filtros</span>
        </button>
      </div>

      {/* Panel de filtros (con Aplicar / Limpiar adentro) */}
      <motion.div
        initial="closed"
        animate={open ? "open" : "closed"}
        variants={variants}
        transition={{ duration: 0.3 }}
        className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md backdrop-blur dark:text-white"
      >
        <div className="grid grid-cols-1 gap-6 text-sm md:grid-cols-2 xl:grid-cols-3">
          {isManager && (
            <div>
              <label className="mb-1 block font-medium">Usuario</label>
              <select
                value={draftUserId}
                onChange={(e) => setDraftUserId(Number(e.target.value))}
                className={inputClass}
              >
                <option value={0}>Todos los usuarios</option>
                {displayedTeamMembers.map((u) => (
                  <option key={u.id_user} value={u.id_user}>
                    {u.first_name} {u.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isLeader && (
            <div>
              <label className="mb-1 block font-medium">
                Miembro de mi equipo
              </label>
              <select
                value={draftUserId}
                onChange={(e) => setDraftUserId(Number(e.target.value))}
                className={inputClass}
              >
                <option value={0}>Todos</option>
                {displayedTeamMembers.map((u) => (
                  <option key={u.id_user} value={u.id_user}>
                    {u.first_name} {u.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(isManager || isLeader) && (
            <div>
              <label className="mb-1 block font-medium">Equipo</label>
              <select
                value={draftTeamId}
                onChange={onTeamChange}
                className={inputClass}
              >
                <option value={0}>Todos</option>
                <option value={-1}>Sin equipo</option>
                {teams.map((t) => (
                  <option key={t.id_team} value={t.id_team}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block font-medium">Género</label>
            <select
              value={draftGender}
              onChange={(e) =>
                setDraftGender(
                  e.target.value as
                    | ""
                    | "Masculino"
                    | "Femenino"
                    | "No Binario",
                )
              }
              className={inputClass}
            >
              <option value="">Todos</option>
              <option value="Masculino">Masculino</option>
              <option value="Femenino">Femenino</option>
              <option value="No Binario">No Binario</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block font-medium">Tipo de pax</label>
            <select
              value={draftProfileKey}
              onChange={(e) => setDraftProfileKey(e.target.value)}
              className={inputClass}
            >
              <option value="all">Todos</option>
              {profileOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 xl:col-span-3">
            <ClientPicker
              token={token}
              label="Relacionado con"
              placeholder="Elegí un pasajero..."
              valueId={draftRelatedClientId ?? null}
              onSelect={(c) => setDraftRelatedClientId(c.id_client)}
              onClear={() => setDraftRelatedClientId(null)}
            />
          </div>
        </div>

        {/* Acciones dentro del panel */}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={resetFilters}
            className={`${btn} flex items-center gap-2 border-sky-950/10 bg-white/10 text-sky-950 hover:bg-white/20 dark:border-white/10 dark:text-white`}
            title="Limpiar filtros"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            Limpiar
          </button>

          <button
            type="button"
            onClick={applyFilters}
            className={`${btn} border-emerald-700/30 bg-emerald-500/20 text-emerald-800 hover:bg-emerald-500/30 dark:text-emerald-200`}
            title="Aplicar filtros"
          >
            Aplicar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
