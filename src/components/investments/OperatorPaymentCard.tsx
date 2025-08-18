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
  booking_id?: number | null; // si tu API/DB lo expone
  operator?: OperatorLite | null;
  user?: UserLite | null;
  createdBy?: UserLite | null;
};

type Props = {
  item: InvestmentItem;
};

function formatDate(s?: string | null) {
  if (!s) return "-";
  // mostramos en es-AR y timezone UTC como en Investments
  return new Date(s).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

function OperatorPaymentCard({ item }: Props) {
  const formattedAmount = useMemo(() => {
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: item.currency,
        minimumFractionDigits: 2,
      }).format(item.amount);
    } catch {
      return `${item.amount.toFixed(2)} ${item.currency}`;
    }
  }, [item.amount, item.currency]);

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
