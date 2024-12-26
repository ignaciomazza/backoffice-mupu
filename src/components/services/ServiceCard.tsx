// src/components/services/ServiceCard.tsx

"use client";

import React from "react";
import { motion } from "framer-motion";
import { Service } from "@/types";

interface ServiceCardProps {
  service: Service;
  expandedServiceId: number | null;
  setExpandedServiceId: React.Dispatch<React.SetStateAction<number | null>>;
  formatDate: (dateString: string | undefined) => string;
  startEditingService: (service: Service) => void;
  deleteService: (id: number) => void;
}

export default function ServiceCard({
  service,
  expandedServiceId,
  setExpandedServiceId,
  formatDate,
  startEditingService,
  deleteService,
}: ServiceCardProps) {
  const isExpanded = expandedServiceId === service.id_service;

  const formatCurrency = (value: number | undefined): string => {
    if (!value) return "N/A";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: service.currency || "USD",
    }).format(value);
  };

  return (
    <motion.div
      layout
      layoutId={`service-${service.id_service}`}
      className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-3 dark:border dark:border-opacity-50 dark:border-white h-fit"
    >
      <p className="text-xl font-light text-end">{service.id_service}</p>
      <p className="font-semibold dark:font-medium">
        Tipo: <span className="font-light">{service.type}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Descripción:{" "}
        <span className="font-light">
          {service.description || "Sin descripción"}
        </span>
      </p>
      <p className="font-semibold dark:font-medium">
        Operador
        <span className="font-light ml-2">
          {service.operator?.name || "N/A"}
        </span>
      </p>
      <p className="font-semibold dark:font-medium">
        Costo:{" "}
        <span className="font-light">{formatCurrency(service.cost_price)}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Venta:{" "}
        <span className="font-light">{formatCurrency(service.sale_price)}</span>
      </p>
      {isExpanded && (
        <div className="space-y-2">
          <p className="font-semibold dark:font-medium">
            Destino:{" "}
            <span className="font-light">{service.destination || "N/A"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Desde:{" "}
            <span className="font-light">
              {formatDate(service.departure_date)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Hasta:{" "}
            <span className="font-light">
              {formatDate(service.return_date)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Referencia:{" "}
            <span className="font-light">{service.reference || "N/A"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Fecha de Pago:{" "}
            <span className="font-light">
              {formatDate(service.payment_due_date)}
            </span>
          </p>
          <p className="font-semibold dark:font-medium mt-4">Impuestos</p>
          <ul className="ml-4 list-disc">
            <li>
              Tax 21%: <span>{formatCurrency(service.tax_21)}</span>
            </li>
            <li>
              Tax 10.5%: <span>{formatCurrency(service.tax_105)}</span>
            </li>
            <li>
              Otros impuestos:{" "}
              <span>{formatCurrency(service.other_taxes)}</span>
            </li>
          </ul>
        </div>
      )}
      <div>
        {isExpanded ? (
          <div className="flex justify-between w-full">
            <button
              onClick={() =>
                setExpandedServiceId((prevId) =>
                  prevId === service.id_service ? null : service.id_service
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
                onClick={() => startEditingService(service)}
              >
                Editar
              </button>
              <button
                className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-red-600 text-white dark:bg-red-800"
                onClick={() => deleteService(service.id_service)}
              >
                Eliminar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() =>
              setExpandedServiceId((prevId) =>
                prevId === service.id_service ? null : service.id_service
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
