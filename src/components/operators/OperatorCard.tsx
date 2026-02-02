// src/components/operators/OperatorCard.tsx

"use client";
import React from "react";
import { motion } from "framer-motion";
import { Operator } from "@/types";
import { ACTION_BUTTON, DANGER_BUTTON, ICON_BUTTON } from "../bookings/palette";

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
  const operatorNumber = operator.agency_operator_id ?? operator.id_operator;

  const handleEdit = (payload: Operator) => {
    startEditingOperator(payload);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const toggleExpanded = () =>
    setExpandedOperatorId((prevId) =>
      prevId === operator.id_operator ? null : operator.id_operator,
    );

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR");
  };

  const Field = ({
    label,
    value,
  }: {
    label: string;
    value: React.ReactNode;
  }) => {
    const display = value === 0 ? 0 : value || "—";
    return (
      <p className="flex min-w-0 flex-wrap gap-x-2 text-sm text-sky-950 dark:text-white">
        <span className="font-semibold text-sky-900/80 dark:text-sky-100/80">
          {label}
        </span>
        <span className="min-w-0 break-words font-medium">{display}</span>
      </p>
    );
  };

  const actionBtn = `${ACTION_BUTTON} p-2`;
  const dangerBtn = `${DANGER_BUTTON} p-2`;
  const iconBtn = `${ICON_BUTTON} p-2`;

  const nameDisplay = operator.name || "Sin nombre";

  return (
    <motion.div
      layout
      layoutId={`operator-${operator.id_operator}`}
      className="h-fit space-y-4 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-900/85 dark:text-sky-100/85">
            Operador N°{operatorNumber}
          </p>
          <p
            className="mt-1 truncate text-lg font-semibold text-sky-950 dark:text-white"
            title={nameDisplay}
          >
            {nameDisplay}
          </p>
        </div>
        <button
          onClick={toggleExpanded}
          className={iconBtn}
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
        <Field label="Email" value={operator.email || "—"} />
        <Field label="Teléfono" value={operator.phone || "—"} />
        <Field label="Web" value={operator.website || "—"} />
        <Field label="País" value={operator.country || "—"} />
      </div>

      {isExpanded && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-sky-950/5 dark:border-white/10 dark:bg-white/5">
          <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <Field label="Razón Social" value={operator.legal_name || "—"} />
            <Field label="CUIT" value={operator.tax_id || "—"} />
            <Field label="Condición IVA" value={operator.vat_status || "—"} />
            <Field label="Dirección" value={operator.address || "—"} />
            <Field label="Código Postal" value={operator.postal_code || "—"} />
            <Field label="Localidad" value={operator.city || "—"} />
            <Field label="Provincia" value={operator.state || "—"} />
            <Field label="Fecha de Registro" value={formatDate(operator.registration_date)} />
            <Field label="Saldo a Crédito" value={operator.credit_balance ?? 0} />
            <Field label="Saldo a Débito" value={operator.debit_balance ?? 0} />
          </div>

          <div className="flex justify-end gap-2">
            <button
              className={actionBtn}
              onClick={() => handleEdit(operator)}
              aria-label="Editar operador"
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
              onClick={() => deleteOperator(operator.id_operator)}
              aria-label="Eliminar operador"
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
