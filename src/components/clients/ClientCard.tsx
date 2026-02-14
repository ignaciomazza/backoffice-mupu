// src/components/clients/ClientCard.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";
import { Client } from "@/types";
import { ACTION_BUTTON, DANGER_BUTTON, ICON_BUTTON } from "../bookings/palette";
import ClientFilesPanel from "./ClientFilesPanel";

interface ClientCardProps {
  client: Client;
  expandedClientId: number | null;
  setExpandedClientId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (dateString: string | undefined) => string;
  startEditingClient: (client: Client) => void;
  deleteClient: (id: number) => void;
  onOpenRelations?: (client: Client) => void;
  passengerCategories?: Array<{ id_category: number; name: string }>;
  profileLabels?: Record<string, string>;
}

export default function ClientCard({
  client,
  expandedClientId,
  setExpandedClientId,
  formatDate,
  startEditingClient,
  deleteClient,
  onOpenRelations,
  passengerCategories = [],
  profileLabels = {},
}: ClientCardProps) {
  const isExpanded = expandedClientId === client.id_client;
  const clientNumber = client.agency_client_id ?? client.id_client;
  const categoryLabel =
    client.category_id && passengerCategories.length
      ? passengerCategories.find((c) => c.id_category === client.category_id)
          ?.name || `Cat ${client.category_id}`
      : client.category_id
        ? `Cat ${client.category_id}`
        : null;
  const profileLabel =
    profileLabels[String(client.profile_key || "")] ||
    client.profile_key ||
    "Pax";

  const handleEdit = (client: Client) => {
    startEditingClient(client);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleExpanded = () =>
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

  const actionBtn = `${ACTION_BUTTON} py-2 px-4`;
  const dangerBtn = `${DANGER_BUTTON} py-2 px-4`;


  return (
    <motion.div
      layout
      layoutId={`client-${client.id_client}`}
      className="h-fit space-y-4 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-900/85 dark:text-sky-100/85">
            Pax N°{clientNumber}
          </p>
          <p
            className="mt-1 truncate text-lg font-semibold text-sky-950 dark:text-white"
            title={`${client.first_name} ${client.last_name}`.trim() || "Sin nombre"}
          >
            {`${client.first_name} ${client.last_name}`.trim() || "Sin nombre"}
          </p>
        </div>
        <button
          onClick={toggleExpanded}
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

      <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <Field label="Tipo" value={profileLabel} />
        <Field label="Teléfono" value={client.phone || "—"} />
        <Field label="Email" value={client.email || "—"} />
        <Field label="Género" value={client.gender || "—"} />
        <Field label="Nacimiento" value={formatDate(client.birth_date)} />
      </div>

      {isExpanded && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-sky-950/5 dark:border-white/10 dark:bg-white/5">
          <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <Field label="DNI" value={client.dni_number || "—"} />
            <Field label="Pasaporte" value={client.passport_number || "—"} />
            <Field label="CUIT" value={client.tax_id || "—"} />
            <Field label="Nacionalidad" value={client.nationality || "—"} />
            <Field label="Dirección" value={client.address || "—"} />
            <Field label="Código Postal" value={client.postal_code || "—"} />
            <Field label="Localidad" value={client.locality || "—"} />
            <Field label="Razón Social" value={client.company_name || "—"} />
            <Field
              label="Dirección Comercial"
              value={client.commercial_address || "—"}
            />
            {categoryLabel && <Field label="Categoría" value={categoryLabel} />}
          </div>

          <ClientFilesPanel clientId={client.id_client} expanded={isExpanded} />

          <div className="flex justify-end gap-2">
            {onOpenRelations && (
              <button
                className={actionBtn}
                onClick={() => onOpenRelations(client)}
                aria-label="Relaciones y acompañantes"
                title="Relaciones"
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
                    d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                  />
                </svg>
              </button>
            )}
            <button
              className={actionBtn}
              onClick={() => handleEdit(client)}
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
    </motion.div>
  );
}
