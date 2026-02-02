// src/components/operators/OperatorList.tsx

"use client";
import { Operator } from "@/types";
import OperatorCard from "./OperatorCard";
import { ACTION_BUTTON, DANGER_BUTTON, ICON_BUTTON } from "../bookings/palette";

export type OperatorViewMode = "grid" | "list";

interface OperatorListProps {
  operators: Operator[];
  expandedOperatorId: number | null;
  setExpandedOperatorId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingOperator: (operator: Operator) => void;
  deleteOperator: (id: number) => void;
  viewMode?: OperatorViewMode;
}

export default function OperatorList({
  operators,
  expandedOperatorId,
  setExpandedOperatorId,
  startEditingOperator,
  deleteOperator,
  viewMode = "grid",
}: OperatorListProps) {
  const content =
    viewMode === "list" ? (
      <div className="flex flex-col gap-3">
        {operators.map((operator) => (
          <OperatorListRow
            key={`row-${operator.id_operator}`}
            operator={operator}
            expandedOperatorId={expandedOperatorId}
            setExpandedOperatorId={setExpandedOperatorId}
            startEditingOperator={startEditingOperator}
            deleteOperator={deleteOperator}
          />
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {operators.map((operator) => (
          <OperatorCard
            key={operator.id_operator}
            operator={operator}
            expandedOperatorId={expandedOperatorId}
            setExpandedOperatorId={setExpandedOperatorId}
            startEditingOperator={startEditingOperator}
            deleteOperator={deleteOperator}
          />
        ))}
      </div>
    );

  return <div className="flex flex-col gap-6">{content}</div>;
}

type OperatorRowProps = {
  operator: Operator;
  expandedOperatorId: number | null;
  setExpandedOperatorId: React.Dispatch<React.SetStateAction<number | null>>;
  startEditingOperator: (operator: Operator) => void;
  deleteOperator: (id: number) => void;
};

function OperatorListRow({
  operator,
  expandedOperatorId,
  setExpandedOperatorId,
  startEditingOperator,
  deleteOperator,
}: OperatorRowProps) {
  const isExpanded = expandedOperatorId === operator.id_operator;
  const operatorNumber = operator.agency_operator_id ?? operator.id_operator;
  const nameDisplay = operator.name || "Sin nombre";

  const toggleRow = () =>
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

  const emailDisplay = operator.email || "Sin email";

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-3 text-sky-950 shadow-sm shadow-sky-950/10 backdrop-blur dark:bg-white/5 dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-900/80 dark:text-sky-100/80">
            Operador N°{operatorNumber}
          </span>
          <p
            className="min-w-0 truncate text-base font-semibold text-sky-950 dark:text-white"
            title={nameDisplay}
          >
            {nameDisplay}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleRow}
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
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-sky-900/80 dark:text-sky-100/80">
        <span className="max-w-[220px] truncate" title={emailDisplay}>
          {emailDisplay}
        </span>
        <span className="text-sky-900/50 dark:text-sky-100/50">•</span>
        <span>{operator.phone || "Sin teléfono"}</span>
        <span className="text-sky-900/50 dark:text-sky-100/50">•</span>
        <span>{operator.country || "Sin país"}</span>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm dark:border-white/10">
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <Field label="Razón Social" value={operator.legal_name || "—"} />
            <Field label="CUIT" value={operator.tax_id || "—"} />
            <Field label="Condición IVA" value={operator.vat_status || "—"} />
            <Field label="Web" value={operator.website || "—"} />
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
              onClick={() => startEditingOperator(operator)}
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
    </div>
  );
}
