// src/components/groups/payments/GroupOperatorPaymentCard.tsx
"use client";

import { memo, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { authFetch } from "@/utils/authFetch";
import { formatDateInBuenosAires } from "@/lib/buenosAiresDate";

export type OperatorLite = { id_operator: number; name: string | null };
export type UserLite = {
  id_user: number;
  first_name: string;
  last_name: string;
};

export type InvestmentItem = {
  id_investment: number;
  agency_investment_id?: number | null;
  category: string;
  description: string;
  amount: number;
  currency: string;
  created_at: string;
  paid_at?: string | null;
  operator_id?: number | null;
  user_id?: number | null;
  booking_id?: number | null;
  serviceIds?: number[] | null;
  booking?: { id_booking: number; agency_booking_id?: number | null } | null;
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
  token?: string | null;
  allowDownload?: boolean;
};

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

function formatDate(s?: string | null) {
  if (!s) return "-";
  return formatDateInBuenosAires(s);
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

function GroupOperatorPaymentCard({
  item,
  token,
  allowDownload = true,
}: Props) {
  const [loadingPDF, setLoadingPDF] = useState(false);
  const formattedAmount = useMemo(
    () => fmtMoney(item.amount, item.currency),
    [item.amount, item.currency],
  );
  const bookingNumber = item.booking?.agency_booking_id ?? item.booking_id;
  const paymentDisplayId = item.agency_investment_id ?? item.id_investment;

  const downloadPDF = async () => {
    if (!token) {
      toast.error("Sesión expirada. Volvé a iniciar sesión.");
      return;
    }
    setLoadingPDF(true);
    try {
      const res = await authFetch(
        `/api/investments/${item.id_investment}/pdf`,
        { headers: { Accept: "application/pdf" } },
        token,
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const operatorName = item.operator?.name || "Operador";
      a.href = url;
      a.download = `Pago_Operador_${slugify(operatorName)}_${paymentDisplayId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Comprobante descargado exitosamente.");
    } catch {
      toast.error("No se pudo descargar el comprobante.");
    } finally {
      setLoadingPDF(false);
    }
  };

  const hasBase =
    item.base_amount !== null &&
    item.base_amount !== undefined &&
    !!item.base_currency;
  const hasCounter =
    item.counter_amount !== null &&
    item.counter_amount !== undefined &&
    !!item.counter_currency;
  const conversionLabel =
    hasBase || hasCounter
      ? `${hasBase ? fmtMoney(item.base_amount, item.base_currency) : "–"} / ${
          hasCounter
            ? fmtMoney(item.counter_amount, item.counter_currency)
            : "–"
        }`
      : null;
  const metaItemClass =
    "rounded-xl border border-sky-200/70 bg-sky-50/35 px-3 py-2.5 dark:border-sky-900/40 dark:bg-slate-900/45";

  return (
    <article className="space-y-5 rounded-2xl border border-sky-200/80 bg-white/75 p-5 text-slate-900 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-100">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Pago a operador
          </p>
          <h3 className="text-[15px] font-semibold tracking-tight md:text-base">
            {item.operator?.name || "Operador"}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">
            N° {paymentDisplayId}
            {item.booking_id ? ` · Reserva N° ${bookingNumber}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100 md:text-lg">
            {formattedAmount}
          </p>
          {allowDownload ? (
            <button
              type="button"
              onClick={downloadPDF}
              disabled={loadingPDF}
              className="rounded-full border border-sky-300/80 bg-sky-100/80 px-3 py-1 text-[11px] font-semibold text-sky-900 shadow-sm shadow-sky-100/60 transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100 dark:hover:bg-sky-900/35 md:text-xs"
              title="Descargar comprobante"
              aria-label="Descargar comprobante"
            >
              {loadingPDF ? (
                "..."
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-4"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
              )}
            </button>
          ) : null}
        </div>
      </header>

      <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 md:text-sm">
        {item.description}
      </p>

      <div className="grid grid-cols-1 gap-2.5 text-[13px] sm:grid-cols-2 md:text-sm lg:grid-cols-3">
        <div className={metaItemClass}>
          <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Creado
          </p>
          <p className="mt-1 font-medium">{formatDate(item.created_at)}</p>
        </div>
        {item.paid_at ? (
          <div className={metaItemClass}>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Pagado
            </p>
            <p className="mt-1 font-medium">{formatDate(item.paid_at)}</p>
          </div>
        ) : null}
        {item.payment_method ? (
          <div className={metaItemClass}>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Metodo
            </p>
            <p className="mt-1 font-medium">{item.payment_method}</p>
          </div>
        ) : null}
        {item.account ? (
          <div className={metaItemClass}>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Cuenta
            </p>
            <p className="mt-1 font-medium">{item.account}</p>
          </div>
        ) : null}
        {conversionLabel ? (
          <div className={metaItemClass}>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Valor base / contravalor
            </p>
            <p className="mt-1 font-medium">{conversionLabel}</p>
          </div>
        ) : null}
        {item.serviceIds && item.serviceIds.length > 0 ? (
          <div className={metaItemClass}>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Servicios
            </p>
            <p className="mt-1 font-medium">{item.serviceIds.length}</p>
          </div>
        ) : null}
      </div>

      {item.createdBy ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 md:text-xs">
          Cargado por: {item.createdBy.first_name} {item.createdBy.last_name}
        </p>
      ) : null}
    </article>
  );
}

export default memo(GroupOperatorPaymentCard);
