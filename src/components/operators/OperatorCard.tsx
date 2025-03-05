// src/components/operators/OperatorCard.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";
import { Operator } from "@/types";

interface OperatorCardProps {
  operator: Operator;
  expandedOperatorId: number | null;
  setExpandedOperatorId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingOperator: (operator: Operator) => void;
  deleteOperator: (id: number) => void;
}

export default function OperatorCard({
  operator,
  expandedOperatorId,
  setExpandedOperatorId,
  startEditingOperator,
  deleteOperator,
}: OperatorCardProps) {
  const isExpanded = expandedOperatorId === operator.id_operator;

  const handleEdit = (operator: Operator) => {
    startEditingOperator(operator);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <motion.div
      layout
      layoutId={`operator-${operator.id_operator}`}
      className="h-fit space-y-3 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white/50 dark:bg-black dark:text-white"
    >
      <p className="text-end text-xl font-light">{operator.id_operator}</p>
      <p className="font-semibold dark:font-medium">
        Nombre
        <span className="ml-2 font-light">{operator.name}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Email
        <span className="ml-2 font-light">{operator.email || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Teléfono
        <span className="ml-2 font-light">{operator.phone || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Sitio Web
        <span className="ml-2 font-light">{operator.website || "-"}</span>
      </p>

      {isExpanded && (
        <>
          <p className="font-semibold dark:font-medium">
            Dirección
            <span className="ml-2 font-light">{operator.address || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Código Postal
            <span className="ml-2 font-light">
              {operator.postal_code || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Localidad
            <span className="ml-2 font-light">{operator.city || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Provincia
            <span className="ml-2 font-light">{operator.state || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            País
            <span className="ml-2 font-light">{operator.country || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Condición IVA
            <span className="ml-2 font-light">
              {operator.vat_status || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Razón Social
            <span className="ml-2 font-light">
              {operator.legal_name || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            CUIT
            <span className="ml-2 font-light">{operator.tax_id || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Fecha de Registro
            <span className="ml-2 font-light">
              {new Date(operator.registration_date).toLocaleDateString("es-AR")}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Saldo a Crédito
            <span className="ml-2 font-light">{operator.credit_balance}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Saldo a Débito
            <span className="ml-2 font-light">{operator.debit_balance}</span>
          </p>
        </>
      )}

      <div>
        {isExpanded ? (
          <div className="flex w-full justify-between">
            <button
              onClick={() =>
                setExpandedOperatorId((prevId) =>
                  prevId === operator.id_operator ? null : operator.id_operator,
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
                onClick={() => handleEdit(operator)}
              >
                Editar
              </button>
              <button
                className="rounded-full bg-red-600 px-6 py-2 text-center text-white transition-transform hover:scale-105 active:scale-100 dark:bg-red-800"
                onClick={() => deleteOperator(operator.id_operator)}
              >
                Eliminar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() =>
              setExpandedOperatorId((prevId) =>
                prevId === operator.id_operator ? null : operator.id_operator,
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
