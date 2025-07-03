// src/components/bookings/FilterPanel.tsx
"use client";
import React, { useState, Dispatch, SetStateAction, ChangeEvent } from "react";
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

  const onTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = Number(e.target.value);
    setSelectedTeamId(t);
    setSelectedUserId(0);
  };

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
      const disp = `${paste.slice(0, 2)}/${paste.slice(2, 4)}/${paste.slice(4, 8)}`;
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

  const inputClass =
    "w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

  const inputClassDate =
    "w-full cursor-text appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

  const variants = {
    closed: { height: 0, opacity: 0, padding: 0, marginTop: 0 },
    open: { height: "auto", opacity: 1, padding: 24, marginTop: 16 },
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:text-white">
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
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-6 py-2 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:text-white"
        >
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
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(Number(e.target.value))}
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
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(Number(e.target.value))}
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
                value={selectedTeamId}
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
              value={selectedBookingStatus}
              onChange={(e) => setSelectedBookingStatus(e.target.value)}
              className={inputClass}
            >
              <option value="Todas">Todas</option>
              <option value="Abierta">Abierta</option>
              <option value="Bloqueada">Bloqueada</option>
              <option value="Cancelada">Cancelada</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-medium">Estado cliente</label>
            <select
              value={selectedClientStatus}
              onChange={(e) =>
                setSelectedClientStatus(e.target.value as ClientStatus)
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
              value={selectedOperatorStatus}
              onChange={(e) => setSelectedOperatorStatus(e.target.value)}
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
                value={formatIsoToDisplay(creationFrom)}
                onChange={(e) => handleDateChange(e, setCreationFrom)}
                onPaste={(e) => handleDatePaste(e, setCreationFrom)}
                onBlur={(e) => handleDateBlur(e, setCreationFrom)}
                placeholder="Desde"
                className={inputClassDate}
              />
              <span>–</span>
              <input
                type="text"
                value={formatIsoToDisplay(creationTo)}
                onChange={(e) => handleDateChange(e, setCreationTo)}
                onPaste={(e) => handleDatePaste(e, setCreationTo)}
                onBlur={(e) => handleDateBlur(e, setCreationTo)}
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
                value={formatIsoToDisplay(travelFrom)}
                onChange={(e) => handleDateChange(e, setTravelFrom)}
                onPaste={(e) => handleDatePaste(e, setTravelFrom)}
                onBlur={(e) => handleDateBlur(e, setTravelFrom)}
                placeholder="Desde"
                className={inputClassDate}
              />
              <span>–</span>
              <input
                type="text"
                value={formatIsoToDisplay(travelTo)}
                onChange={(e) => handleDateChange(e, setTravelTo)}
                onPaste={(e) => handleDatePaste(e, setTravelTo)}
                onBlur={(e) => handleDateBlur(e, setTravelTo)}
                placeholder="Hasta"
                className={inputClassDate}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
