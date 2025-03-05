// src/components/clients/ClientCard.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";
import { Client } from "@/types";

interface ClientCardProps {
  client: Client;
  expandedClientId: number | null;
  setExpandedClientId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (dateString: string | undefined) => string;
  startEditingClient: (client: Client) => void;
  deleteClient: (id: number) => void;
}

export default function ClientCard({
  client,
  expandedClientId,
  setExpandedClientId,
  formatDate,
  startEditingClient,
  deleteClient,
}: ClientCardProps) {
  const isExpanded = expandedClientId === client.id_client;

  const handleEdit = (client: Client) => {
    startEditingClient(client);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <motion.div
      layout
      layoutId={`client-${client.id_client}`}
      className="h-fit space-y-3 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white/50 dark:bg-black dark:text-white"
    >
      <p className="text-end text-xl font-light">{client.id_client}</p>
      <p className="font-semibold dark:font-medium">
        Nombre
        <span className="ml-2 font-light">
          {client.first_name} {client.last_name}
        </span>
      </p>
      <p className="font-semibold dark:font-medium">
        Teléfono
        <span className="ml-2 font-light">{client.phone || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Nacimiento
        <span className="ml-2 font-light">{formatDate(client.birth_date)}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        DNI
        <span className="ml-2 font-light">{client.dni_number || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Pasaporte
        <span className="ml-2 font-light">{client.passport_number || "-"}</span>
      </p>

      {isExpanded && (
        <>
          <p className="font-semibold dark:font-medium">
            CUIT
            <span className="ml-2 font-light">{client.tax_id || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Dirección
            <span className="ml-2 font-light">{client.address || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Código Postal
            <span className="ml-2 font-light">{client.postal_code || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Localidad
            <span className="ml-2 font-light">{client.locality || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Nacionalidad
            <span className="ml-2 font-light">{client.nationality || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Género
            <span className="ml-2 font-light">{client.gender || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Emisión del DNI
            <span className="ml-2 font-light">
              {formatDate(client.dni_issue_date)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Vencimiento del DNI
            <span className="ml-2 font-light">
              {formatDate(client.dni_expiry_date)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Emisión del Pasaporte
            <span className="ml-2 font-light">
              {formatDate(client.passport_issue)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Vencimiento del Pasaporte
            <span className="ml-2 font-light">
              {formatDate(client.passport_expiry)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Razón Social
            <span className="ml-2 font-light">
              {client.company_name || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Dirección Comercial
            <span className="ml-2 font-light">
              {client.commercial_address || "-"}
            </span>
          </p>
        </>
      )}

      <div>
        {isExpanded ? (
          <div className="flex w-full justify-between">
            <button
              onClick={() =>
                setExpandedClientId((prevId) =>
                  prevId === client.id_client ? null : client.id_client,
                )
              }
              className="mt-4 rounded-full bg-black p-2 text-center text-white transition-transform hover:scale-105 active:scale-100 dark:bg-white dark:text-black"
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
                  d="M5 12h14"
                />
              </svg>
            </button>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-105 active:scale-100 dark:bg-white dark:text-black"
                onClick={() => handleEdit(client)}
              >
                Editar
              </button>
              <button
                className="rounded-full bg-red-600 px-6 py-2 text-center text-white transition-transform hover:scale-105 active:scale-100 dark:bg-red-800"
                onClick={() => deleteClient(client.id_client)}
              >
                Eliminar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() =>
              setExpandedClientId((prevId) =>
                prevId === client.id_client ? null : client.id_client,
              )
            }
            className="mt-4 flex items-center justify-center rounded-full bg-black p-2 text-center text-white transition-transform hover:scale-105 active:scale-100 dark:bg-white dark:text-black"
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
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
}
