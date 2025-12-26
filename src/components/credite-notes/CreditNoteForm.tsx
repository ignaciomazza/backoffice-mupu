// src/components/credit-notes/CreditNoteForm.tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Spinner from "@/components/Spinner";
import { authFetch } from "@/utils/authFetch";
import type { Invoice } from "@/types";
import { toast } from "react-toastify";

const Section = ({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) => (
  <section className="rounded-2xl border border-white/10 bg-white/10 p-4">
    <div className="mb-3">
      <h3 className="text-base font-semibold tracking-tight text-sky-950 dark:text-white">
        {title}
      </h3>
      {desc && (
        <p className="mt-1 text-xs font-light text-sky-950/70 dark:text-white/70">
          {desc}
        </p>
      )}
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
  </section>
);

const Field = ({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) => (
  <div className="space-y-1">
    <label
      htmlFor={id}
      className="ml-1 block text-sm font-medium text-sky-950 dark:text-white"
    >
      {label} {required && <span className="text-rose-600">*</span>}
    </label>
    {children}
    {hint && (
      <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">{hint}</p>
    )}
  </div>
);

const pillBase = "rounded-full px-3 py-1 text-xs font-medium transition-colors";
const pillNeutral = "bg-white/30 dark:bg-white/10";
const pillOk = "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100";

const inputBase =
  "w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10 dark:text-white";

export type CreditNoteFormData = {
  invoiceId: string;
  tipoNota: string;
  exchangeRate?: string;
  invoiceDate?: string;
};

interface CreditNoteFormProps {
  formData: CreditNoteFormData;
  invoices: Invoice[];
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isFormVisible: boolean;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  updateFormData: (
    key: keyof CreditNoteFormData,
    value: CreditNoteFormData[keyof CreditNoteFormData],
  ) => void;
  isSubmitting: boolean;
  token?: string | null;
  collapsible?: boolean;
  containerClassName?: string;
}

type VoucherData = {
  CbteTipo?: number;
  CbteFch?: number | string;
};

const normCurrency = (curr?: string | null) => {
  const c = (curr || "").toUpperCase();
  if (["USD", "DOL", "U$S", "US$"].includes(c)) return "USD";
  return "ARS";
};

const fmtMoney = (v?: number, curr?: string | null) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: normCurrency(curr),
  }).format(v ?? 0);

const fmtDate = (raw?: string | Date | null) => {
  if (!raw) return "—";
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-AR", { timeZone: "UTC" });
};

const getVoucher = (inv: Invoice): VoucherData | null => {
  const payload = inv.payloadAfip as unknown as
    | { voucherData?: VoucherData }
    | VoucherData
    | null;
  if (!payload) return null;
  if ("voucherData" in payload && payload.voucherData) {
    return payload.voucherData;
  }
  return payload as VoucherData;
};

const getSuggestedNoteType = (inv: Invoice): string | null => {
  const tipo = getVoucher(inv)?.CbteTipo;
  if (tipo === 1) return "3";
  if (tipo === 6) return "8";
  return null;
};

const invoiceTypeLabel = (inv: Invoice): string => {
  const tipo = getVoucher(inv)?.CbteTipo;
  if (tipo === 1) return "Factura A";
  if (tipo === 6) return "Factura B";
  return "Factura";
};

const statusTone = (status?: string) => {
  const s = (status || "").toLowerCase();
  if (s.includes("aprob"))
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100";
  if (s.includes("pend"))
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100";
  if (s.includes("rech") || s.includes("anul"))
    return "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100";
  return "bg-sky-100 text-sky-900 dark:bg-white/10 dark:text-white";
};

export default function CreditNoteForm({
  formData,
  invoices,
  handleChange,
  handleSubmit,
  isFormVisible,
  setIsFormVisible,
  updateFormData,
  isSubmitting,
  token,
  collapsible = true,
  containerClassName = "",
}: CreditNoteFormProps) {
  const showForm = collapsible ? isFormVisible : true;

  // date bounds ±5 days
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dMin = new Date(today);
  dMin.setDate(dMin.getDate() - 5);
  const dMax = new Date(today);
  dMax.setDate(dMax.getDate() + 5);
  const minDate = `${dMin.getFullYear()}-${pad(dMin.getMonth() + 1)}-${pad(
    dMin.getDate(),
  )}`;
  const maxDate = `${dMax.getFullYear()}-${pad(dMax.getMonth() + 1)}-${pad(
    dMax.getDate(),
  )}`;

  /* ========= Cotización (lazy con cache TTL) ========= */
  const [fetchedExchangeRate, setFetchedExchangeRate] = useState<string>("");
  const [rateStatus, setRateStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const rateCacheRef = useRef<{ ts: number; value: string } | null>(null);

  useEffect(() => {
    if (!token || !showForm) return;
    if (formData.exchangeRate && formData.exchangeRate.trim() !== "") return;

    const TTL_MS = 5 * 60 * 1000;
    const now = Date.now();
    const cached = rateCacheRef.current;
    if (cached && now - cached.ts < TTL_MS) {
      setFetchedExchangeRate(cached.value);
      setRateStatus("ok");
      return;
    }

    const ac = new AbortController();
    (async () => {
      try {
        setRateStatus("loading");
        const res = await authFetch(
          `/api/exchangeRate?ts=${Date.now()}`,
          { cache: "no-store", signal: ac.signal },
          token || undefined,
        );
        const raw = await res.text();
        if (!res.ok) throw new Error("Exchange rate fetch failed");
        const data = JSON.parse(raw);

        if (data?.success && data.rate != null) {
          const val = String(data.rate);
          setFetchedExchangeRate(val);
          setRateStatus("ok");
          rateCacheRef.current = { ts: now, value: val };
        } else {
          setFetchedExchangeRate("");
          setRateStatus("error");
          rateCacheRef.current = null;
        }
      } catch {
        if (!ac.signal.aborted) {
          setFetchedExchangeRate("");
          setRateStatus("error");
          rateCacheRef.current = null;
        }
      }
    })();

    return () => ac.abort();
  }, [token, showForm, formData.exchangeRate]);

  const selectedInvoiceId = Number(formData.invoiceId || 0);
  const selectedInvoice = useMemo(
    () => invoices.find((inv) => inv.id_invoice === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId],
  );

  useEffect(() => {
    if (!selectedInvoice || formData.tipoNota) return;
    const suggested = getSuggestedNoteType(selectedInvoice);
    if (suggested) updateFormData("tipoNota", suggested);
  }, [selectedInvoice, formData.tipoNota, updateFormData]);

  const toggleInvoice = (inv: Invoice) => {
    const next =
      selectedInvoiceId === inv.id_invoice ? "" : String(inv.id_invoice);
    updateFormData("invoiceId", next);
  };

  const canSubmit =
    !!selectedInvoiceId && !!formData.tipoNota && invoices.length > 0;

  const noteTypeLabel =
    formData.tipoNota === "3"
      ? "Nota A"
      : formData.tipoNota === "8"
        ? "Nota B"
        : "";

  const headerPills = useMemo(() => {
    const pills: JSX.Element[] = [];
    if (noteTypeLabel) {
      pills.push(
        <span key="type" className={`${pillBase} ${pillOk}`}>
          {noteTypeLabel}
        </span>,
      );
    }
    if (selectedInvoice) {
      pills.push(
        <span key="invoice" className={`${pillBase} ${pillNeutral}`}>
          Factura #{selectedInvoice.invoice_number || selectedInvoice.id_invoice}
        </span>,
      );
    }
    if (formData.invoiceDate) {
      pills.push(
        <span key="date" className={`${pillBase} ${pillNeutral}`}>
          {fmtDate(formData.invoiceDate)}
        </span>,
      );
    }
    return pills;
  }, [noteTypeLabel, selectedInvoice, formData.invoiceDate]);

  return (
    <motion.div
      layout
      initial={{ maxHeight: 96, opacity: 1 }}
      animate={{
        maxHeight: showForm ? 1200 : 96,
        opacity: 1,
        transition: { duration: 0.35, ease: "easeInOut" },
      }}
      className={`mb-6 overflow-auto rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md shadow-sky-950/10 dark:text-white ${containerClassName}`}
    >
      <div
        className={`sticky top-0 z-10 ${showForm ? "rounded-t-3xl border-b" : ""} border-white/10 px-4 py-3 backdrop-blur-sm`}
      >
        {collapsible ? (
          <button
            type="button"
            onClick={() => setIsFormVisible(!isFormVisible)}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={showForm}
            aria-controls="credit-note-form-body"
          >
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-full bg-rose-100 text-rose-900 shadow-sm shadow-rose-900/20 dark:bg-rose-500/15 dark:text-rose-100">
                {showForm ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 12h14"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-lg font-semibold">
                  {showForm ? "Nota de crédito" : "Crear nota de crédito"}
                </p>
                <p className="text-xs opacity-70">
                  Seleccioná la factura y completá la fecha.
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              {headerPills}
            </div>
          </button>
        ) : (
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-full bg-rose-100 text-rose-900 shadow-sm shadow-rose-900/20 dark:bg-rose-500/15 dark:text-rose-100">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14"
                  />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold">Nota de crédito</p>
                <p className="text-xs opacity-70">
                  Seleccioná la factura y completá la fecha.
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              {headerPills}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {showForm && (
          <motion.form
            id="credit-note-form-body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedInvoiceId || !formData.tipoNota) {
                toast.error("Seleccioná una factura y el tipo de nota.");
                return;
              }
              handleSubmit(e);
            }}
            className="space-y-5 px-4 pb-6 pt-4 md:px-6"
          >
            <Section
              title="Factura de origen"
              desc="Elegí la factura sobre la que se emitirá la nota de crédito."
            >
              <div className="md:col-span-2">
                {invoices.length === 0 ? (
                  <div className="rounded-2xl border border-amber-200/40 bg-amber-100/30 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
                    No hay facturas para esta reserva. Para crear una nota de
                    crédito primero emití una factura.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {invoices.map((inv) => {
                      const active = selectedInvoiceId === inv.id_invoice;
                      return (
                        <button
                          type="button"
                          key={inv.id_invoice}
                          onClick={() => toggleInvoice(inv)}
                          className={`rounded-2xl border p-3 text-left transition-all ${
                            active
                              ? "border-rose-200/70 bg-rose-50/80 text-rose-950 shadow-sm shadow-rose-900/10 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-50"
                              : "border-white/10 bg-white/10 hover:bg-white/20 dark:border-white/10 dark:bg-white/10"
                          }`}
                          title={`Factura ID ${inv.id_invoice}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium">
                              #{inv.invoice_number || inv.id_invoice} ·{" "}
                              {inv.recipient || "Sin destinatario"}
                            </div>
                            {active && (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800 dark:bg-rose-500/20 dark:text-rose-100">
                                seleccionada
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-sky-900 dark:bg-white/20 dark:text-white">
                              {invoiceTypeLabel(inv)}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone(inv.status)}`}
                            >
                              {inv.status || "—"}
                            </span>
                            <span className="text-[11px]">
                              {fmtDate(inv.issue_date)}
                            </span>
                          </div>
                          <div className="mt-2 text-sm">
                            <b>Total:</b>{" "}
                            {fmtMoney(inv.total_amount, inv.currency)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {invoices.length > 0 && !selectedInvoiceId && (
                  <p className="ml-1 mt-2 text-xs text-amber-700 dark:text-amber-200">
                    Seleccioná una factura para continuar.
                  </p>
                )}
              </div>
            </Section>

            <Section
              title="Comprobante"
              desc="Definí tipo y fecha de la nota de crédito."
            >
              <Field id="tipoNota" label="Tipo de nota" required>
                <select
                  id="tipoNota"
                  name="tipoNota"
                  value={formData.tipoNota}
                  onChange={handleChange}
                  className={`${inputBase} cursor-pointer appearance-none`}
                  required
                  disabled={!selectedInvoiceId}
                >
                  <option value="">Seleccionar</option>
                  <option value="3">Nota de Crédito A</option>
                  <option value="8">Nota de Crédito B</option>
                </select>
                {selectedInvoice && !formData.tipoNota && (
                  <p className="ml-1 mt-1 text-xs text-sky-950/70 dark:text-white/60">
                    Sugerencia: {invoiceTypeLabel(selectedInvoice)} →{" "}
                    {getSuggestedNoteType(selectedInvoice) === "3"
                      ? "Nota A"
                      : getSuggestedNoteType(selectedInvoice) === "8"
                        ? "Nota B"
                        : "elegir manualmente"}
                  </p>
                )}
              </Field>

              <Field id="invoiceDate" label="Fecha de nota" required>
                <input
                  id="invoiceDate"
                  type="date"
                  name="invoiceDate"
                  value={formData.invoiceDate || ""}
                  onChange={handleChange}
                  min={minDate}
                  max={maxDate}
                  className={inputBase}
                  required
                  disabled={!selectedInvoiceId}
                />
              </Field>
            </Section>

            <Section
              title="Cotización"
              desc="Completá solo si la nota está en USD."
            >
              <Field
                id="exchangeRate"
                label="Cotización del dólar (opcional)"
              >
                <input
                  id="exchangeRate"
                  type="text"
                  name="exchangeRate"
                  value={formData.exchangeRate || ""}
                  onChange={handleChange}
                  placeholder={
                    rateStatus === "loading"
                      ? "Cargando cotización..."
                      : fetchedExchangeRate
                        ? `Cotización: ${fetchedExchangeRate}`
                        : "Cotización actual"
                  }
                  className={inputBase}
                  disabled={!selectedInvoiceId}
                />
                {rateStatus === "loading" && (
                  <div className="ml-1 mt-1 text-xs opacity-70">
                    <Spinner />
                  </div>
                )}
                {rateStatus === "ok" && fetchedExchangeRate && (
                  <div className="ml-1 mt-1 text-xs opacity-70">
                    Cotización detectada: {fetchedExchangeRate}
                  </div>
                )}
              </Field>
            </Section>

            <div className="sticky bottom-2 z-10 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || !canSubmit}
                className={`rounded-full px-6 py-2 shadow-sm shadow-rose-900/20 transition active:scale-[0.98] ${
                  isSubmitting || !canSubmit
                    ? "cursor-not-allowed bg-rose-200/40 text-rose-900/50 dark:bg-rose-500/10 dark:text-rose-100/50"
                    : "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100"
                }`}
              >
                {isSubmitting ? <Spinner /> : "Crear nota"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
