// src/components/receipts/ReceiptCard.tsx

"use client";

import { useCallback, useMemo, useState } from "react";
import { Receipt, Booking } from "@/types";
import { toast } from "react-toastify";
import Spinner from "@/components/Spinner";

/* ======================== Utils ======================== */

// src/components/receipts/ReceiptCard.tsx
const normCurrency = (c?: string | null) => {
  const cu = (c || "").toUpperCase().trim();
  if (["USD", "US$", "U$S", "DOL"].includes(cu)) return "USD";
  if (["ARS", "$"].includes(cu)) return "ARS";
  // si viene otra ISO válida (EUR, BRL, etc.), usarla
  if (/^[A-Z]{3}$/.test(cu)) return cu;
  return "ARS";
};

const fmtMoney = (v?: number | string | null, curr?: string | null) => {
  const n =
    typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  const currency = normCurrency(curr);
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
  }).format(safe);
};

const slugify = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/* ======================== Micro-componentes ======================== */

const Chip: React.FC<{
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warn" | "danger" | "brand";
  title?: string;
  className?: string;
}> = ({ children, tone = "neutral", title, className = "" }) => {
  const palette =
    tone === "success"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/40"
      : tone === "warn"
        ? "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800/40"
        : tone === "danger"
          ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800/40"
          : tone === "brand"
            ? "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-900/30 dark:text-sky-100 dark:border-sky-800/40"
            : "bg-white/20 text-sky-950 border-white/10 dark:bg-white/10 dark:text-white";
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${palette} ${className}`}
    >
      {children}
    </span>
  );
};

const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }
> = ({ loading, children, className = "", ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-sm transition-transform hover:scale-95 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 active:scale-90 disabled:opacity-50 ${className}`}
  >
    {loading ? <Spinner /> : children}
  </button>
);

/* ======================== Props ======================== */

interface ReceiptCardProps {
  receipt: Receipt;
  booking: Booking;
  role: string;
  onReceiptDeleted?: (id: number) => void;
}

/* ======================== Componente ======================== */

export default function ReceiptCard({
  receipt,
  booking,
  role,
  onReceiptDeleted,
}: ReceiptCardProps) {
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  // nombre cliente por id
  const getClientName = useCallback(
    (id: number): string => {
      if (booking.titular.id_client === id) {
        return `${booking.titular.first_name} ${booking.titular.last_name} · N°${booking.titular.id_client}`;
      }
      const found = booking.clients?.find((c) => c.id_client === id);
      return found
        ? `${found.first_name} ${found.last_name} · N°${id}`
        : `N°${id}`;
    },
    [booking],
  );

  // string de clientes
  const clientsStr = useMemo(() => {
    return receipt.clientIds?.length
      ? receipt.clientIds.map(getClientName).join(", ")
      : `${booking.titular.first_name} ${booking.titular.last_name} · N°${booking.titular.id_client}`;
  }, [receipt.clientIds, getClientName, booking.titular]);

  // flags conversión
  const hasBase =
    receipt.base_amount !== null &&
    receipt.base_amount !== undefined &&
    !!receipt.base_currency;
  const hasCounter =
    receipt.counter_amount !== null &&
    receipt.counter_amount !== undefined &&
    !!receipt.counter_currency;

  if (!receipt?.id_receipt) {
    return (
      <div className="flex h-40 items-center justify-center dark:text-white">
        <Spinner />
      </div>
    );
  }

  /* ====== handlers ====== */
  const downloadPDF = async () => {
    setLoadingPDF(true);
    try {
      const res = await fetch(`/api/receipts/${receipt.id_receipt}/pdf`, {
        headers: { Accept: "application/pdf" },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const rawName =
        booking.titular.company_name ||
        `${booking.titular.first_name} ${booking.titular.last_name}`;
      a.href = url;
      a.download = `Recibo_${slugify(rawName)}_${booking.id_booking}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Recibo descargado exitosamente.");
    } catch {
      toast.error("No se pudo descargar el recibo.");
    } finally {
      setLoadingPDF(false);
    }
  };

  const deleteReceipt = async () => {
    if (!confirm("¿Seguro querés eliminar este recibo?")) return;
    setLoadingDelete(true);
    try {
      const res = await fetch(`/api/receipts/${receipt.id_receipt}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error();
      onReceiptDeleted?.(receipt.id_receipt);
      toast.success("Recibo eliminado.");
    } catch {
      toast.error("No se pudo eliminar el recibo.");
    } finally {
      setLoadingDelete(false);
    }
  };

  /* ====== UI ====== */
  return (
    <div className="group h-fit rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur transition-[transform,box-shadow] hover:scale-[0.999] dark:text-white">
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-sky-950/70 dark:text-white/70">
              Recibo{" "}
              <span className="font-medium">N°{receipt.receipt_number}</span>
            </p>
            {receipt.payment_method ? (
              <Chip title="Método de pago">{receipt.payment_method}</Chip>
            ) : null}
          </div>
          <p className="text-sm opacity-80">{clientsStr}</p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <time
            className="text-xs text-sky-950/70 dark:text-white/70"
            title="Fecha de emisión"
          >
            {receipt.issue_date
              ? new Date(receipt.issue_date).toLocaleDateString("es-AR")
              : "–"}
          </time>
        </div>
      </header>

      <div className="mb-4 flex w-full justify-end">
        <Chip tone="brand" title="Moneda del monto">
          {normCurrency(receipt.amount_currency) === "ARS"
            ? "Pesos"
            : "Dólares"}
        </Chip>
      </div>

      {/* Totales en cards */}
      <section className="mb-4 flex gap-3">
        <div className="flex w-fit flex-col gap-2">
          <div className="rounded-2xl border border-sky-200/40 bg-sky-50/60 p-3 shadow-sm shadow-sky-950/10 dark:border-sky-400/10 dark:bg-sky-400/10">
            <p className="text-xs opacity-70">Monto</p>
            <p className="text-base font-semibold tabular-nums">
              {fmtMoney(receipt.amount, receipt.amount_currency)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
            <p className="text-xs opacity-70">Servicios (N°)</p>
            <p className="text-sm font-medium">
              {receipt.serviceIds?.length ? receipt.serviceIds.join(", ") : "—"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
          <p className="text-xs opacity-70">Método de pago</p>
          <p className="text-sm font-medium">
            {receipt.currency || receipt.payment_method || "—"}
          </p>
        </div>

        {(hasBase || hasCounter) && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
              <p className="text-xs opacity-70">Valor base</p>
              <p className="text-sm font-medium tabular-nums">
                {hasBase
                  ? fmtMoney(receipt.base_amount, receipt.base_currency)
                  : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
              <p className="text-xs opacity-70">Contravalor</p>
              <p className="text-sm font-medium tabular-nums">
                {hasCounter
                  ? fmtMoney(receipt.counter_amount, receipt.counter_currency)
                  : "—"}
              </p>
            </div>
          </>
        )}
      </section>

      {/* Concepto y Monto en letras */}
      <section className="flex flex-col gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
          <p className="text-xs opacity-70">Concepto</p>
          <p className="mt-1 text-sm">{receipt.concept}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
          <p className="text-xs opacity-70">Monto en letras</p>
          <p className="mt-1 text-sm">{receipt.amount_string}</p>
        </div>
      </section>

      {/* Footer acciones */}
      <footer className="mt-6 flex flex-wrap justify-end gap-2">
        <IconButton
          onClick={downloadPDF}
          disabled={loadingPDF}
          loading={loadingPDF}
          aria-label="Descargar PDF del recibo"
          className="bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          Descargar PDF
        </IconButton>

        {(role === "administrativo" ||
          role === "desarrollador" ||
          role === "gerente") && (
          <IconButton
            onClick={deleteReceipt}
            disabled={loadingDelete || loadingPDF}
            loading={loadingDelete}
            aria-label="Eliminar recibo"
            className="bg-red-600 text-red-100 hover:bg-red-600/90 dark:bg-red-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
            Eliminar
          </IconButton>
        )}
      </footer>
    </div>
  );
}
