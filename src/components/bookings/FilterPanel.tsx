// src/components/bookings/FilterPanel.tsx
"use client";
import React, {
  useState,
  Dispatch,
  SetStateAction,
  ChangeEvent,
  useEffect,
} from "react";
import { motion } from "framer-motion";
import { User, SalesTeam } from "@/types";

export type ClientStatus = "Todas" | "Pendiente" | "Pago" | "Facturado";

interface Props {
  role?: string | null;
  teams: SalesTeam[];
  displayedTeamMembers: User[];
  selectedUserId: number;
  setSelectedUserId: Dispatch<SetStateAction<number>>;
  selectedTeamId: number;
  setSelectedTeamId: Dispatch<SetStateAction<number>>;
  selectedBookingStatus: string;
  setSelectedBookingStatus: Dispatch<SetStateAction<string>>;
  selectedClientStatus: ClientStatus;
  setSelectedClientStatus: Dispatch<SetStateAction<ClientStatus>>;
  selectedOperatorStatus: string;
  setSelectedOperatorStatus: Dispatch<SetStateAction<string>>;
  creationFrom: string;
  setCreationFrom: Dispatch<SetStateAction<string>>;
  creationTo: string;
  setCreationTo: Dispatch<SetStateAction<string>>;
  travelFrom: string;
  setTravelFrom: Dispatch<SetStateAction<string>>;
  travelTo: string;
  setTravelTo: Dispatch<SetStateAction<string>>;
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
}

export default function FilterPanel({
  role = "",
  teams,
  displayedTeamMembers,
  selectedUserId,
  setSelectedUserId,
  selectedTeamId,
  setSelectedTeamId,
  selectedBookingStatus,
  setSelectedBookingStatus,
  selectedClientStatus,
  setSelectedClientStatus,
  selectedOperatorStatus,
  setSelectedOperatorStatus,
  creationFrom,
  setCreationFrom,
  creationTo,
  setCreationTo,
  travelFrom,
  setTravelFrom,
  travelTo,
  setTravelTo,
  searchTerm,
  setSearchTerm,
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
  const [draftBookingStatus, setDraftBookingStatus] = useState<string>(
    selectedBookingStatus,
  );
  const [draftClientStatus, setDraftClientStatus] =
    useState<ClientStatus>(selectedClientStatus);
  const [draftOperatorStatus, setDraftOperatorStatus] = useState<string>(
    selectedOperatorStatus,
  );
  const [draftCreationFrom, setDraftCreationFrom] =
    useState<string>(creationFrom);
  const [draftCreationTo, setDraftCreationTo] = useState<string>(creationTo);
  const [draftTravelFrom, setDraftTravelFrom] = useState<string>(travelFrom);
  const [draftTravelTo, setDraftTravelTo] = useState<string>(travelTo);
  const [draftSearch, setDraftSearch] = useState<string>(searchTerm);

  // Sincronizar draft cuando cambian los commits (por navegación, etc.)
  useEffect(() => {
    setDraftUserId(selectedUserId);
    setDraftTeamId(selectedTeamId);
    setDraftBookingStatus(selectedBookingStatus);
    setDraftClientStatus(selectedClientStatus);
    setDraftOperatorStatus(selectedOperatorStatus);
    setDraftCreationFrom(creationFrom);
    setDraftCreationTo(creationTo);
    setDraftTravelFrom(travelFrom);
    setDraftTravelTo(travelTo);
    setDraftSearch(searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedUserId,
    selectedTeamId,
    selectedBookingStatus,
    selectedClientStatus,
    selectedOperatorStatus,
    creationFrom,
    creationTo,
    travelFrom,
    travelTo,
    searchTerm,
  ]);

  // ===== Helpers fecha =====
  const formatIsoToDisplay = (iso: string): string => {
    if (!iso) return "";
    const parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };
  const formatDisplayToIso = (display: string): string => {
    const parts = display.split("/");
    if (parts.length !== 3) return display;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };
  const normalizeDateDraft = (v: string) =>
    v.includes("/") ? formatDisplayToIso(v) : v;

  const handleDateChange = (
    e: ChangeEvent<HTMLInputElement>,
    setter: (v: string) => void,
  ) => {
    const value = e.target.value;
    const digits = value.replace(/\D/g, "");
    let formatted = "";
    if (digits.length >= 1) formatted += digits.substring(0, 2);
    if (digits.length >= 3) formatted += "/" + digits.substring(2, 4);
    if (digits.length >= 5) formatted += "/" + digits.substring(4, 8);
    setter(formatted);
  };

  const handleDatePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    setter: (v: string) => void,
  ) => {
    const paste = e.clipboardData.getData("text").replace(/\D/g, "");
    if (paste.length === 8) {
      const disp = `${paste.slice(0, 2)}/${paste.slice(2, 4)}/${paste.slice(
        4,
        8,
      )}`;
      e.preventDefault();
      setter(disp);
    }
  };

  const handleDateBlur = (
    e: React.FocusEvent<HTMLInputElement>,
    setter: (v: string) => void,
  ) => {
    const iso = formatDisplayToIso(e.target.value);
    setter(iso);
  };

  // ===== Handlers =====
  const onTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = Number(e.target.value);
    setDraftTeamId(t);
    setDraftUserId(0); // al cambiar equipo, reset usuario
  };

  const applyFilters = () => {
    const cFrom = normalizeDateDraft(draftCreationFrom);
    const cTo = normalizeDateDraft(draftCreationTo);
    const tFrom = normalizeDateDraft(draftTravelFrom);
    const tTo = normalizeDateDraft(draftTravelTo);

    setSelectedUserId(draftUserId);
    setSelectedTeamId(draftTeamId);
    setSelectedBookingStatus(draftBookingStatus);
    setSelectedClientStatus(draftClientStatus);
    setSelectedOperatorStatus(draftOperatorStatus);
    setCreationFrom(cFrom);
    setCreationTo(cTo);
    setTravelFrom(tFrom);
    setTravelTo(tTo);
    setSearchTerm(draftSearch);
    // Opcional: cerrar panel al aplicar
    // setOpen(false);
  };

  const resetFilters = () => {
    setDraftUserId(0);
    setDraftTeamId(0);
    setDraftBookingStatus("Todas");
    setDraftClientStatus("Todas");
    setDraftOperatorStatus("Todas");
    setDraftCreationFrom("");
    setDraftCreationTo("");
    setDraftTravelFrom("");
    setDraftTravelTo("");
    setDraftSearch("");

    setSelectedUserId(0);
    setSelectedTeamId(0);
    setSelectedBookingStatus("Todas");
    setSelectedClientStatus("Todas");
    setSelectedOperatorStatus("Todas");
    setCreationFrom("");
    setCreationTo("");
    setTravelFrom("");
    setTravelTo("");
    setSearchTerm("");
  };

  // ===== UI =====
  const inputClass =
    "w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";
  const inputClassDate =
    "w-full cursor-text appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";
  const btn = "rounded-2xl px-4 py-2 shadow-sm border transition";

  const variants = {
    closed: { height: 0, opacity: 0, padding: 0, marginTop: 0 },
    open: { height: "auto", opacity: 1, padding: 24, marginTop: 16 },
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Barra superior: búsqueda + toggle filtros */}
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-1 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:text-white">
          <input
            type="text"
            placeholder="Buscar reservas..."
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

          {isManager && (
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
            <label className="mb-1 block font-medium">Estado reserva</label>
            <select
              value={draftBookingStatus}
              onChange={(e) => setDraftBookingStatus(e.target.value)}
              className={inputClass}
            >
              <option value="Todas">Todas</option>
              <option value="Abierta">Abierta</option>
              <option value="Bloqueada">Bloqueada</option>
              <option value="Cancelada">Cancelada</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block font-medium">Estado pax</label>
            <select
              value={draftClientStatus}
              onChange={(e) =>
                setDraftClientStatus(e.target.value as ClientStatus)
              }
              className={inputClass}
            >
              <option value="Todas">Todas</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Pago">Pago</option>
              <option value="Facturado">Facturado</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block font-medium">Estado operador</label>
            <select
              value={draftOperatorStatus}
              onChange={(e) => setDraftOperatorStatus(e.target.value)}
              className={inputClass}
            >
              <option value="Todas">Todas</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Pago">Pago</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block font-medium">Fecha creación</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={formatIsoToDisplay(draftCreationFrom)}
                onChange={(e) => handleDateChange(e, setDraftCreationFrom)}
                onPaste={(e) => handleDatePaste(e, setDraftCreationFrom)}
                onBlur={(e) => handleDateBlur(e, setDraftCreationFrom)}
                placeholder="Desde"
                className={inputClassDate}
              />
              <span>–</span>
              <input
                type="text"
                value={formatIsoToDisplay(draftCreationTo)}
                onChange={(e) => handleDateChange(e, setDraftCreationTo)}
                onPaste={(e) => handleDatePaste(e, setDraftCreationTo)}
                onBlur={(e) => handleDateBlur(e, setDraftCreationTo)}
                placeholder="Hasta"
                className={inputClassDate}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium">Fecha viaje</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={formatIsoToDisplay(draftTravelFrom)}
                onChange={(e) => handleDateChange(e, setDraftTravelFrom)}
                onPaste={(e) => handleDatePaste(e, setDraftTravelFrom)}
                onBlur={(e) => handleDateBlur(e, setDraftTravelFrom)}
                placeholder="Desde"
                className={inputClassDate}
              />
              <span>–</span>
              <input
                type="text"
                value={formatIsoToDisplay(draftTravelTo)}
                onChange={(e) => handleDateChange(e, setDraftTravelTo)}
                onPaste={(e) => handleDatePaste(e, setDraftTravelTo)}
                onBlur={(e) => handleDateBlur(e, setDraftTravelTo)}
                placeholder="Hasta"
                className={inputClassDate}
              />
            </div>
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
