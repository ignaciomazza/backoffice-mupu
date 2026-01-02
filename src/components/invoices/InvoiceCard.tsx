// src/components/invoices/InvoiceCard.tsx
"use client";
import { Invoice } from "@/types";
import { toast } from "react-toastify";
import Spinner from "@/components/Spinner";
import { authFetch } from "@/utils/authFetch";
import { useEffect, useMemo, useState } from "react";

/* ======================== Utils ======================== */
const normCurrency = (curr?: string) => {
  const c = (curr || "").toUpperCase();
  if (c === "USD" || c === "DOL" || c === "U$S") return "USD";
  return "ARS";
};

const fmtMoney = (v?: number, curr?: string) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: normCurrency(curr),
  }).format(v ?? 0);

const slugify = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const fmtCbteDate = (raw: string | number | Date) => {
  if (raw instanceof Date) return new Intl.DateTimeFormat("es-AR").format(raw);
  const s = String(raw);
  if (/^\d{8}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00Z`).toLocaleDateString("es-AR");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00Z`).toLocaleDateString("es-AR");
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : new Intl.DateTimeFormat("es-AR").format(d);
};

const TipoChip: React.FC<{ tipo?: number }> = ({ tipo }) => {
  const label = tipo === 1 ? "A" : tipo === 6 ? "B" : (tipo ?? "-");
  return (
    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-900 dark:border-sky-800/40 dark:bg-sky-900/30 dark:text-sky-100">
      {`Factura ${label}`}
    </span>
  );
};

const StatusChip: React.FC<{ status?: string }> = ({ status }) => {
  const s = (status || "").toLowerCase();
  const palette =
    s === "aprobada" || s === "approved"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
      : s === "pendiente" || s === "pending"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
        : "bg-sky-100 text-sky-900 dark:bg-white/10 dark:text-white";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${palette}`}>
      {status || "—"}
    </span>
  );
};

const CurrencyChip: React.FC<{ currency?: string }> = ({ currency }) => (
  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-900 dark:border-sky-800/40 dark:bg-sky-900/30 dark:text-sky-100">
    {normCurrency(currency) === "ARS" ? "Pesos" : "Dólares"}
  </span>
);

/* ======================== Card ======================== */
interface InvoiceCardProps {
  invoice: Invoice;
  token?: string | null;
  onInvoiceUpdated?: (invoice: Invoice) => void;
}

export default function InvoiceCard({
  invoice,
  token,
  onInvoiceUpdated,
}: InvoiceCardProps) {
  const [loading, setLoading] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [isSavingDesc, setIsSavingDesc] = useState(false);
  const [desc21Draft, setDesc21Draft] = useState("");
  const [desc10Draft, setDesc10Draft] = useState("");
  const [descNonDraft, setDescNonDraft] = useState("");
  const [localDescriptions, setLocalDescriptions] = useState<{
    description21?: string[];
    description10_5?: string[];
    descriptionNonComputable?: string[];
  } | null>(null);

  type VoucherMinimal = {
    CbteFch: number | string | Date;
    ImpNeto: number;
    ImpIVA: number;
    Iva: { Id: number; BaseImp: number; Importe: number }[];
    CbteTipo?: number;
  };
  const voucher = invoice.payloadAfip?.voucherData as unknown as
    | VoucherMinimal
    | undefined;

  const payloadDescriptions = (invoice.payloadAfip ?? {}) as {
    description21?: string[];
    description10_5?: string[];
    descriptionNonComputable?: string[];
  };
  const activeDescriptions = localDescriptions ?? payloadDescriptions;
  const currentDesc21 = activeDescriptions.description21?.[0] ?? "";
  const currentDesc10 = activeDescriptions.description10_5?.[0] ?? "";
  const currentDescNon =
    activeDescriptions.descriptionNonComputable?.[0] ?? "";

  useEffect(() => {
    setLocalDescriptions(null);
  }, [invoice.id_invoice, invoice.payloadAfip]);

  const bases = useMemo(() => {
    const Iva = voucher?.Iva ?? [];
    let base21 = 0,
      base105 = 0,
      exento = 0;
    Iva.forEach(({ Id, BaseImp, Importe }) => {
      if (Id === 5) base21 += BaseImp + Importe;
      else if (Id === 4) base105 += BaseImp + Importe;
      else exento += BaseImp;
    });
    return { base21, base105, exento };
  }, [voucher]);

  const emitDate = voucher?.CbteFch ? fmtCbteDate(voucher.CbteFch) : "";

  const onDownload = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id_invoice}/pdf`, {
        headers: { Accept: "application/pdf" },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      const name = invoice.recipient
        ? slugify(invoice.recipient)
        : `cliente_${invoice.client_id}`;

      const bookingId =
        invoice.bookingId_booking != null
          ? String(invoice.bookingId_booking)
          : "reserva";

      link.download = `Factura_${name}_${bookingId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Factura descargada exitosamente.");
    } catch {
      toast.error("No se pudo descargar la factura.");
    } finally {
      setLoading(false);
    }
  };

  const startEditDescriptions = () => {
    setDesc21Draft(currentDesc21);
    setDesc10Draft(currentDesc10);
    setDescNonDraft(currentDescNon);
    setIsEditingDesc(true);
  };

  const cancelEditDescriptions = () => {
    setIsEditingDesc(false);
    setDesc21Draft(currentDesc21);
    setDesc10Draft(currentDesc10);
    setDescNonDraft(currentDescNon);
  };

  const handleSaveDescriptions = async () => {
    if (!token) {
      toast.error("Sesión expirada. Volvé a iniciar sesión.");
      return;
    }
    if (isSavingDesc) return;

    setIsSavingDesc(true);
    try {
      const res = await authFetch(
        `/api/invoices/${invoice.id_invoice}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            description21: desc21Draft,
            description10_5: desc10Draft,
            descriptionNonComputable: descNonDraft,
          }),
        },
        token,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(
          (err as { message?: string })?.message ||
            "No se pudieron guardar las descripciones.",
        );
      }
      const result = (await res.json()) as {
        success?: boolean;
        invoice?: { id_invoice: number; payloadAfip?: unknown };
        message?: string;
      };
      if (!result.success || !result.invoice) {
        throw new Error(result.message || "No se pudieron guardar.");
      }

      const updatedPayload = result.invoice.payloadAfip ?? {};
      setLocalDescriptions(
        (updatedPayload as {
          description21?: string[];
          description10_5?: string[];
          descriptionNonComputable?: string[];
        }) ?? null,
      );
      onInvoiceUpdated?.({
        ...invoice,
        payloadAfip: updatedPayload as Invoice["payloadAfip"],
      });
      toast.success("Descripciones actualizadas.");
      setIsEditingDesc(false);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al guardar descripciones.",
      );
    } finally {
      setIsSavingDesc(false);
    }
  };

  if (!invoice.payloadAfip) {
    return (
      <div className="group h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md backdrop-blur transition-transform hover:scale-[0.999] dark:text-white">
        <header className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm text-sky-950/70 dark:text-white/70">
              ID {invoice.id_invoice}
            </p>
            <CurrencyChip currency={invoice.currency} />
          </div>
          <StatusChip status={invoice.status} />
        </header>

        <div className="rounded-2xl border border-white/10 bg-white/20 p-3 dark:bg-white/10">
          <p className="text-sm font-semibold">
            Comprobante N°{" "}
            <span className="font-light">{invoice.invoice_number}</span>
          </p>
          <p className="text-sm">
            Fecha{" "}
            <span className="font-light">
              {new Date(invoice.issue_date).toLocaleDateString("es-AR")}
            </span>
          </p>
          <p className="mt-2 text-[13px] font-medium text-red-600 dark:text-red-400">
            Sin datos AFIP
          </p>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={onDownload}
            disabled={loading}
            className={`rounded-full bg-sky-100 px-4 py-2 text-sm text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur ${loading ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {loading ? (
              <Spinner />
            ) : (
              <span className="flex items-center gap-2">
                Descargar
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
              </span>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group h-fit rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur transition-transform hover:scale-[0.999] dark:text-white">
      <header className="mb-2 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm text-sky-950/70 dark:text-white/70">
              ID {invoice.id_invoice}
            </p>
          </div>
          <p className="text-[15px]">
            Comprobante N°{" "}
            <span className="font-medium">{invoice.invoice_number}</span>
          </p>
          <p className="text-sm opacity-80">
            {invoice.recipient} – N° {invoice.client_id}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <time className="text-xs text-sky-950/70 dark:text-white/70">
            {emitDate}
          </time>
        </div>
      </header>

      <div className="mb-4 flex w-full justify-end gap-2">
        <TipoChip tipo={voucher?.CbteTipo} />
        <CurrencyChip currency={invoice.currency} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
          <p className="text-xs opacity-70">Base 21%</p>
          <p className="text-sm font-medium tabular-nums">
            {fmtMoney(bases.base21, invoice.currency)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
          <p className="text-xs opacity-70">Base 10,5%</p>
          <p className="text-sm font-medium tabular-nums">
            {fmtMoney(bases.base105, invoice.currency)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
          <p className="text-xs opacity-70">Exento</p>
          <p className="text-sm font-medium tabular-nums">
            {fmtMoney(bases.exento, invoice.currency)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
          <p className="text-xs opacity-70">Neto</p>
          <p className="text-sm font-medium tabular-nums">
            {fmtMoney(voucher?.ImpNeto, invoice.currency)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/20 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
          <p className="text-xs opacity-70">IVA</p>
          <p className="text-sm font-medium tabular-nums">
            {fmtMoney(voucher?.ImpIVA, invoice.currency)}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-200/40 bg-sky-50/60 p-3 shadow-sm shadow-sky-950/10 dark:border-sky-400/10 dark:bg-sky-400/10">
          <p className="text-xs opacity-70">Total</p>
          <p className="text-base font-semibold tabular-nums">
            {fmtMoney(invoice.total_amount, invoice.currency)}
          </p>
        </div>
      </div>

      {token && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-3 shadow-sm shadow-sky-950/10 dark:bg-white/10">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-950/60 dark:text-white/60">
              Descripciones
            </p>
            <button
              type="button"
              onClick={
                isEditingDesc ? cancelEditDescriptions : startEditDescriptions
              }
              className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-sky-950/80 transition hover:border-sky-200 hover:text-sky-950 dark:border-white/10 dark:text-white/70"
            >
              {isEditingDesc ? "Cerrar" : "Editar"}
            </button>
          </div>

          {isEditingDesc ? (
            <div className="mt-3 space-y-3 text-sm">
              <label className="block">
                <span className="text-xs font-medium text-sky-950/80 dark:text-white/80">
                  IVA 21%
                </span>
                <input
                  type="text"
                  value={desc21Draft}
                  onChange={(e) => setDesc21Draft(e.target.value)}
                  placeholder="Ej: Servicio 21%"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-sky-950/80 dark:text-white/80">
                  IVA 10,5%
                </span>
                <input
                  type="text"
                  value={desc10Draft}
                  onChange={(e) => setDesc10Draft(e.target.value)}
                  placeholder="Ej: Servicio 10,5%"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-sky-950/80 dark:text-white/80">
                  No computable
                </span>
                <input
                  type="text"
                  value={descNonDraft}
                  onChange={(e) => setDescNonDraft(e.target.value)}
                  placeholder="Ej: Cargo no computable"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEditDescriptions}
                  className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-sky-950/80 transition hover:border-sky-200 hover:text-sky-950 dark:border-white/10 dark:text-white/70"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveDescriptions}
                  disabled={isSavingDesc}
                  className={`rounded-full px-4 py-2 text-xs font-medium shadow-sm shadow-sky-950/20 transition ${
                    isSavingDesc
                      ? "cursor-not-allowed bg-sky-950/20 text-white/60 dark:bg-white/5 dark:text-white/40"
                      : "bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
                  }`}
                >
                  {isSavingDesc ? <Spinner /> : "Guardar"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-1 text-xs text-sky-950/70 dark:text-white/70">
              <p>
                IVA 21%: {currentDesc21 ? currentDesc21 : "Sin descripción"}
              </p>
              <p>
                IVA 10,5%: {currentDesc10 ? currentDesc10 : "Sin descripción"}
              </p>
              <p>
                No computable:{" "}
                {currentDescNon ? currentDescNon : "Sin descripción"}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end">
        <button
          onClick={onDownload}
          disabled={loading}
          aria-label="Descargar PDF de la factura"
          className={`rounded-full bg-sky-100 px-5 py-2 text-sm text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur ${loading ? "cursor-not-allowed opacity-50" : ""}`}
        >
          {loading ? (
            <Spinner />
          ) : (
            <span className="flex items-center gap-2">
              Descargar PDF
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
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
