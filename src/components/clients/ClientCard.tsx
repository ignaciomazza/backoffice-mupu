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
      className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-3 dark:border dark:border-opacity-50 dark:border-white h-fit"
    >
      <p className="text-xl font-light text-end">{client.id_client}</p>
      <p className="font-semibold dark:font-medium">
        Nombre
        <span className="font-light ml-2">
          {client.first_name} {client.last_name}
        </span>
      </p>
      <p className="font-semibold dark:font-medium">
        Teléfono
        <span className="font-light ml-2">{client.phone || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Nacimiento
        <span className="font-light ml-2">
          {formatDate(client.birth_date)}
        </span>
      </p>
      <p className="font-semibold dark:font-medium">
        DNI
        <span className="font-light ml-2">{client.dni_number || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Pasaporte
        <span className="font-light ml-2">
          {client.passport_number || "-"}
        </span>
      </p>

      {isExpanded && (
        <>
          <p className="font-semibold dark:font-medium">
            CUIT
            <span className="font-light ml-2">{client.tax_id || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Dirección
            <span className="font-light ml-2">{client.address || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Código Postal
            <span className="font-light ml-2">
              {client.postal_code || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Localidad
            <span className="font-light ml-2">{client.locality || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Nacionalidad
            <span className="font-light ml-2">{client.nationality || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Género
            <span className="font-light ml-2">{client.gender || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Emisión del DNI
            <span className="font-light ml-2">
              {formatDate(client.dni_issue_date)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Vencimiento del DNI
            <span className="font-light ml-2">
              {formatDate(client.dni_expiry_date)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Emisión del Pasaporte
            <span className="font-light ml-2">
              {formatDate(client.passport_issue)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Vencimiento del Pasaporte
            <span className="font-light ml-2">
              {formatDate(client.passport_expiry)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Condición IVA
            <span className="font-light ml-2">
              {client.iva_condition || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Razón Social
            <span className="font-light ml-2">
              {client.company_name || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Dirección Comercial
            <span className="font-light ml-2">
              {client.commercial_address || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Preferencia de Facturación
            <span className="font-light ml-2">
              {client.billing_preference || "-"}
            </span>
          </p>
        </>
      )}

      <div>
        {isExpanded ? (
          <div className="flex justify-between w-full">
            <button
              onClick={() =>
                setExpandedClientId((prevId) =>
                  prevId === client.id_client ? null : client.id_client
                )
              }
              className="p-2 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black mt-4"
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
            <div className="flex gap-2 mt-4">
              <button
                className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
                onClick={() => handleEdit(client)}
              >
                Editar
              </button>
              <button
                className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-red-600 text-white dark:bg-red-800"
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
                prevId === client.id_client ? null : client.id_client
              )
            }
            className="p-2 flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black mt-4"
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
