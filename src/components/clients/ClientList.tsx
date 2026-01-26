"use client";
import React from "react";
import { Client } from "@/types";
import ClientCard from "./ClientCard";
import { ACTION_BUTTON, DANGER_BUTTON, ICON_BUTTON } from "../bookings/palette";
import ClientFilesPanel from "./ClientFilesPanel";

export type ClientViewMode = "grid" | "list";

interface ClientListProps {
  clients: Client[];
  expandedClientId: number | null;
  setExpandedClientId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (dateString: string | undefined) => string;
  startEditingClient: (client: Client) => void;
  deleteClient: (id: number) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  viewMode?: ClientViewMode;
}

export default function ClientList({
  clients,
  expandedClientId,
  setExpandedClientId,
  formatDate,
  startEditingClient,
  deleteClient,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  viewMode = "grid",
}: ClientListProps) {
  const content =
    viewMode === "list" ? (
      <div className="flex flex-col gap-3">
        {clients.map((client) => (
          <ClientListRow
            key={`row-${client.id_client}`}
            client={client}
            expandedClientId={expandedClientId}
            setExpandedClientId={setExpandedClientId}
            formatDate={formatDate}
            startEditingClient={startEditingClient}
            deleteClient={deleteClient}
          />
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <ClientCard
            key={client.id_client}
            client={client}
            expandedClientId={expandedClientId}
            setExpandedClientId={setExpandedClientId}
            formatDate={formatDate}
            startEditingClient={startEditingClient}
            deleteClient={deleteClient}
          />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {content}

      {hasMore && onLoadMore && (
        <div className="flex w-full justify-center">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white dark:backdrop-blur"
          >
            {loadingMore ? "Cargando..." : "Ver más"}
          </button>
        </div>
      )}
    </div>
  );
}

type ClientRowProps = {
  client: Client;
  expandedClientId: number | null;
  setExpandedClientId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (date: string | undefined) => string;
  startEditingClient: (client: Client) => void;
  deleteClient: (id: number) => void;
};

function ClientListRow({
  client,
  expandedClientId,
  setExpandedClientId,
  formatDate,
  startEditingClient,
  deleteClient,
}: ClientRowProps) {
  const isExpanded = expandedClientId === client.id_client;
  const clientNumber = client.agency_client_id ?? client.id_client;
  const fullName = `${client.first_name} ${client.last_name}`.trim() || "—";
  const toggleRow = () =>
    setExpandedClientId((prevId) =>
      prevId === client.id_client ? null : client.id_client,
    );

  const Field = ({
    label,
    value,
  }: {
    label: string;
    value: React.ReactNode;
  }) => (
    <p className="flex min-w-0 flex-wrap gap-x-2 text-sm text-sky-950 dark:text-white">
      <span className="font-semibold text-sky-900/80 dark:text-sky-100/80">
        {label}
      </span>
      <span className="min-w-0 break-words font-medium">{value || "—"}</span>
    </p>
  );

  const actionBtn = `${ACTION_BUTTON} p-2`;
  const dangerBtn = `${DANGER_BUTTON} p-2`;

  const emailDisplay = client.email || "Sin email";

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-3 text-sky-950 shadow-sm shadow-sky-950/10 backdrop-blur dark:bg-white/5 dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-900/80 dark:text-sky-100/80">
            Pax N°{clientNumber}
          </span>
          <p
            className="min-w-0 truncate text-base font-semibold text-sky-950 dark:text-white"
            title={fullName}
          >
            {fullName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleRow}
            className={`${ICON_BUTTON} p-2`}
            aria-label={isExpanded ? "Ocultar detalles" : "Mostrar detalles"}
          >
            {isExpanded ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            ) : (
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
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-sky-900/80 dark:text-sky-100/80">
        <span>{client.phone || "Sin teléfono"}</span>
        <span className="text-sky-900/50 dark:text-sky-100/50">•</span>
        <span className="max-w-[220px] truncate" title={emailDisplay}>
          {emailDisplay}
        </span>
        <span className="text-sky-900/50 dark:text-sky-100/50">•</span>
        <span>{client.gender || "Sin género"}</span>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm dark:border-white/10">
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <Field label="Nacimiento" value={formatDate(client.birth_date)} />
            <Field label="Nacionalidad" value={client.nationality || "—"} />
            <Field label="DNI" value={client.dni_number || "—"} />
            <Field label="Pasaporte" value={client.passport_number || "—"} />
            <Field label="CUIT" value={client.tax_id || "—"} />
            <Field label="Dirección" value={client.address || "—"} />
            <Field label="Código Postal" value={client.postal_code || "—"} />
            <Field label="Localidad" value={client.locality || "—"} />
            <Field label="Razón Social" value={client.company_name || "—"} />
            <Field
              label="Dirección Comercial"
              value={client.commercial_address || "—"}
            />
          </div>

          <ClientFilesPanel clientId={client.id_client} expanded={isExpanded} />

          <div className="flex justify-end gap-2">
            <button
              className={actionBtn}
              onClick={() => startEditingClient(client)}
              aria-label="Editar pax"
              title="Editar"
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
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                />
              </svg>
            </button>
            <button
              className={dangerBtn}
              onClick={() => deleteClient(client.id_client)}
              aria-label="Eliminar pax"
              title="Eliminar"
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
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
