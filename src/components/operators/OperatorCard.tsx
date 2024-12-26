// src/components/operators/OperatorCard.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";

interface OperatorCardProps {
  operator: any;
  expandedOperatorId: number | null;
  setExpandedOperatorId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingOperator: (operator: any) => void;
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

  const handleEdit = (operator: any) => {
    startEditingOperator(operator);

    // Smoothly scroll to the top of the page
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <motion.div
      layout
      layoutId={`operator-${operator.id_operator}`}
      className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-3 dark:border dark:border-opacity-50 dark:border-white h-fit"
    >
      <p className="text-xl font-light text-end">{operator.id_operator}</p>
      <p className="font-semibold dark:font-medium">
        Nombre
        <span className="font-light ml-2">{operator.name}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Email
        <span className="font-light ml-2">{operator.email || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Teléfono
        <span className="font-light ml-2">{operator.phone || "-"}</span>
      </p>
      <p className="font-semibold dark:font-medium">
        Sitio Web
        <span className="font-light ml-2">{operator.website || "-"}</span>
      </p>

      {isExpanded && (
        <>
          <p className="font-semibold dark:font-medium">
            Dirección
            <span className="font-light ml-2">{operator.address || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Código Postal
            <span className="font-light ml-2">
              {operator.postal_code || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Localidad
            <span className="font-light ml-2">{operator.city || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Provincia
            <span className="font-light ml-2">{operator.state || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            País
            <span className="font-light ml-2">{operator.country || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Condición IVA
            <span className="font-light ml-2">
              {operator.vat_status || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Razón Social
            <span className="font-light ml-2">
              {operator.legal_name || "-"}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            CUIT
            <span className="font-light ml-2">{operator.tax_id || "-"}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Fecha de Registro
            <span className="font-light ml-2">
              {new Date(operator.registration_date).toLocaleDateString("es-AR")}
            </span>
          </p>
          <p className="font-semibold dark:font-medium">
            Saldo a Crédito
            <span className="font-light ml-2">{operator.credit_balance}</span>
          </p>
          <p className="font-semibold dark:font-medium">
            Saldo a Débito
            <span className="font-light ml-2">{operator.debit_balance}</span>
          </p>
        </>
      )}

      <div>
        {isExpanded ? (
          <div className="flex justify-between w-full">
            <button
              onClick={() =>
                setExpandedOperatorId((prevId) =>
                  prevId === operator.id_operator ? null : operator.id_operator
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
                onClick={() => handleEdit(operator)}
              >
                Editar
              </button>
              <button
                className="py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-red-600 text-white dark:bg-red-800"
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
                prevId === operator.id_operator ? null : operator.id_operator
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
