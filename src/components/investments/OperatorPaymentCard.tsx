// src/components/investments/OperatorPaymentCard.tsx
"use client";

import { memo, useMemo } from "react";

export type OperatorLite = { id_operator: number; name: string | null };
export type UserLite = {
  id_user: number;
  first_name: string;
  last_name: string;
};

export type InvestmentItem = {
  id_investment: number;
  category: string;
  description: string;
  amount: number;
  currency: string;
  created_at: string;
  paid_at?: string | null;
  operator_id?: number | null;
  user_id?: number | null;
  booking_id?: number | null;
  operator?: OperatorLite | null;
  user?: UserLite | null;
  createdBy?: UserLite | null;

  // Nuevos campos
  payment_method?: string | null;
  account?: string | null;
  base_amount?: number | string | null;
  base_currency?: string | null;
  counter_amount?: number | string | null;
  counter_currency?: string | null;
};

type Props = {
  item: InvestmentItem;
};

function formatDate(s?: string | null) {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

function fmtMoney(v?: number | string | null, cur?: string | null) {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  const currency = (cur || "ARS").toUpperCase();
  if (!Number.isFinite(n)) return "–";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function OperatorPaymentCard({ item }: Props) {
  const formattedAmount = useMemo(
    () => fmtMoney(item.amount, item.currency),
    [item.amount, item.currency],
  );

  const hasBase =
    item.base_amount !== null &&
    item.base_amount !== undefined &&
    !!item.base_currency;
  const hasCounter =
    item.counter_amount !== null &&
    item.counter_amount !== undefined &&
    !!item.counter_currency;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">
          Pago a Operador
          {item.operator?.name ? ` · ${item.operator.name}` : ""}
        </div>
        <div className="flex items-center gap-2">
          {item.booking_id ? (
            <span className="text-xs opacity-70">
              Reserva #{item.booking_id}
            </span>
          ) : null}
          <span className="text-sm opacity-70">#{item.id_investment}</span>
        </div>
      </div>

      <div className="mt-1 text-lg opacity-90">{item.description}</div>

      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <span>
          <b>Monto:</b> {formattedAmount}
        </span>

        {/* Método de pago / Cuenta (opcionales) */}
        {item.payment_method && (
          <span>
            <b>Método:</b> {item.payment_method}
          </span>
        )}
        {item.account && (
          <span>
            <b>Cuenta:</b> {item.account}
          </span>
        )}

        {/* Valor base / Contravalor */}
        {(hasBase || hasCounter) && (
          <span>
            <b>Valor base / Contravalor:</b>{" "}
            {hasBase ? fmtMoney(item.base_amount, item.base_currency) : "–"} /{" "}
            {hasCounter
              ? fmtMoney(item.counter_amount, item.counter_currency)
              : "–"}
          </span>
        )}

        <span>
          <b>Creado:</b> {formatDate(item.created_at)}
        </span>
        {item.paid_at && (
          <span>
            <b>Pagado:</b> {formatDate(item.paid_at)}
          </span>
        )}
        {item.operator?.name && (
          <span>
            <b>Operador:</b> {item.operator.name}
          </span>
        )}
        {item.createdBy && (
          <span className="opacity-80">
            <b>Cargado por:</b> {item.createdBy.first_name}{" "}
            {item.createdBy.last_name}
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(OperatorPaymentCard);
