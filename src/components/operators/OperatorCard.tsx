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
      className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white"
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
              className="mt-4 rounded-full bg-black p-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
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
                className="rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
                onClick={() => handleEdit(operator)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.4}
                  stroke="currentColor"
                  className="size-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                  />
                </svg>
              </button>
              <button
                className="rounded-full bg-red-600 px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                onClick={() => deleteOperator(operator.id_operator)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.4}
                  stroke="currentColor"
                  className="size-6"
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
        ) : (
          <button
            onClick={() =>
              setExpandedOperatorId((prevId) =>
                prevId === operator.id_operator ? null : operator.id_operator,
              )
            }
            className="mt-4 flex items-center justify-center rounded-full bg-black p-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
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
