"use client";

import Spinner from "@/components/Spinner";
import type { Invoice } from "@/types";
import { formatDateOnlyInBuenosAires } from "@/lib/buenosAiresDate";

type Props = {
  invoices: Invoice[];
  loading?: boolean;
};

const money = (amount: number, currency?: string) => {
  const code = String(currency || "ARS")
    .trim()
    .toUpperCase();
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"} ${code}`;
  }
};

export default function GroupInvoiceList({ invoices, loading = false }: Props) {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className="rounded-2xl border border-sky-200/80 bg-white/75 p-5 text-center text-[13px] text-slate-700 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-300 md:text-sm">
        No hay facturas registradas en esta grupal.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {invoices.map((invoice) => (
        <article
          key={`group-invoice-${invoice.id_invoice}`}
          className="rounded-2xl border border-sky-200/80 bg-white/75 p-4 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55"
        >
          <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            Factura N° {invoice.invoice_number}
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {money(Number(invoice.total_amount || 0), String(invoice.currency || "ARS"))}
          </p>
          <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
            {invoice.recipient || `Cliente ${invoice.client_id}`}
          </p>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Fecha:{" "}
            {invoice.issue_date
              ? formatDateOnlyInBuenosAires(invoice.issue_date)
              : "-"}
            {" · "}Estado: {invoice.status || "EMITIDA"}
          </p>
        </article>
      ))}
    </div>
  );
}
