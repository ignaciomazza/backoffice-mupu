// src/components/invoices/InvoiceForm.tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import Spinner from "@/components/Spinner";
import { Client, Service } from "@/types";
import ClientPicker from "@/components/clients/ClientPicker";
import { authFetch } from "@/utils/authFetch";
import { toast } from "react-toastify";
import { computeManualTotals } from "@/services/afip/manualTotals";

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
const pillOk = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";

const inputBase =
  "w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10 dark:text-white";

export type InvoiceFormData = {
  tipoFactura: string;
  clientIds: string[]; // ids de pasajeros como string
  services: string[]; // ids de servicios como string
  exchangeRate?: string;
  description21: string[];
  description10_5: string[];
  descriptionNonComputable: string[];
  invoiceDate?: string;
  manualTotalsEnabled: boolean;
  manualTotal: string;
  manualBase21: string;
  manualIva21: string;
  manualBase10_5: string;
  manualIva10_5: string;
  manualExempt: string;
};

interface InvoiceFormProps {
  formData: InvoiceFormData;
  availableServices: Service[];
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isFormVisible: boolean;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  updateFormData: (
    key: keyof InvoiceFormData,
    value: InvoiceFormData[keyof InvoiceFormData],
  ) => void;
  isSubmitting: boolean;
  token?: string | null;
  collapsible?: boolean;
  containerClassName?: string;
}

export default function InvoiceForm({
  formData,
  availableServices,
  handleChange,
  handleSubmit,
  isFormVisible,
  setIsFormVisible,
  updateFormData,
  isSubmitting,
  token,
  collapsible = true,
  containerClassName = "",
}: InvoiceFormProps) {
  const showForm = collapsible ? isFormVisible : true;

  /* ========= Cotización (lazy con cache TTL) ========= */
  const [fetchedExchangeRate, setFetchedExchangeRate] = useState<string>("");
  const [rateStatus, setRateStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");

  // Cache en memoria para evitar re-fetch por 5 min sin depender de estado
  const rateCacheRef = useRef<{ ts: number; value: string } | null>(null);

  useEffect(() => {
    if (!token || !isFormVisible) return; // solo cuando se abre el form
    if (formData.exchangeRate && formData.exchangeRate.trim() !== "") return; // si el usuario la completó manualmente, no fetchear

    const TTL_MS = 5 * 60 * 1000;
    const now = Date.now();

    // Cache hit dentro del TTL
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
  }, [token, isFormVisible, formData.exchangeRate]);

  /* ========= Helpers ========= */
  const arraysEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  /* ========= Servicios (picker múltiple) ========= */
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>(
    () =>
      formData.services
        ?.map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n)) || [],
  );

  // Reflejar cambios externos de formData.services en el estado local
  useEffect(() => {
    const nums =
      formData.services
        ?.map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n)) || [];
    setSelectedServiceIds((prev) =>
      prev.length === nums.length && prev.every((v, i) => v === nums[i])
        ? prev
        : nums,
    );
  }, [formData.services]);

  // Sincronizar estado local -> formData (post-render, con guardas)
  useEffect(() => {
    const next = selectedServiceIds.map(String);
    const curr = formData.services || [];
    if (!arraysEqual(next, curr)) {
      updateFormData("services", next);
    }
  }, [selectedServiceIds, formData.services, updateFormData]);

  const selectedServices = useMemo(
    () =>
      availableServices.filter((s) =>
        selectedServiceIds.includes(s.id_service),
      ),
    [availableServices, selectedServiceIds],
  );

  const toggleService = (svc: Service) => {
    setSelectedServiceIds((prev) =>
      prev.includes(svc.id_service)
        ? prev.filter((id) => id !== svc.id_service)
        : [...prev, svc.id_service],
    );
  };

  // Ajustar longitudes de descripciones según cantidad de servicios seleccionados
  useEffect(() => {
    const count = selectedServiceIds.length;

    const resize = (arr: string[]) => {
      const copy = [...(arr || [])];
      while (copy.length < count) copy.push("");
      copy.length = count;
      return copy;
    };

    const next21 = resize(formData.description21 || []);
    const next10 = resize(formData.description10_5 || []);
    const nextNon = resize(formData.descriptionNonComputable || []);

    if ((formData.description21 || []).length !== next21.length) {
      updateFormData("description21", next21);
    }
    if ((formData.description10_5 || []).length !== next10.length) {
      updateFormData("description10_5", next10);
    }
    if ((formData.descriptionNonComputable || []).length !== nextNon.length) {
      updateFormData("descriptionNonComputable", nextNon);
    }
  }, [
    selectedServiceIds.length,
    formData.description21,
    formData.description10_5,
    formData.descriptionNonComputable,
    updateFormData,
  ]);

  // accesos cortos (siempre seguros)
  const desc21 = formData.description21 || [];
  const desc10 = formData.description10_5 || [];
  const descNon = formData.descriptionNonComputable || [];

  /* ========= Pasajeros (picker múltiple) ========= */
  const [clientCount, setClientCount] = useState<number>(
    Math.max(1, formData.clientIds?.length || 1),
  );

  // Mantener formData.clientIds con el tamaño elegido
  useEffect(() => {
    const arr = [...(formData.clientIds || [])];
    while (arr.length < clientCount) arr.push("");
    arr.length = clientCount;
    if (!arraysEqual(arr, formData.clientIds || [])) {
      updateFormData("clientIds", arr);
    }
  }, [clientCount, formData.clientIds, updateFormData]);

  const setClientAt = (idx: number, c: Client | null) => {
    const arr = [...(formData.clientIds || [])];
    arr[idx] = c ? String(c.id_client) : "";
    updateFormData("clientIds", arr);
  };

  const excludeForIndex = (idx: number) =>
    (formData.clientIds || [])
      .filter((_, i) => i !== idx)
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n)) as number[];

  /* ========= Fecha mínima/máxima ========= */
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dMin = new Date(today);
  dMin.setDate(dMin.getDate() - 8);
  const minDate = `${dMin.getFullYear()}-${pad(dMin.getMonth() + 1)}-${pad(dMin.getDate())}`;
  const dMax = new Date(today);
  dMax.setDate(dMax.getDate() + 8);
  const maxDate = `${dMax.getFullYear()}-${pad(dMax.getMonth() + 1)}-${pad(dMax.getDate())}`;

  const invoiceTypeLabel =
    formData.tipoFactura === "1"
      ? "Factura A"
      : formData.tipoFactura === "6"
        ? "Factura B"
        : "";

  const selectedClientsCount = useMemo(
    () =>
      (formData.clientIds || []).filter((v) => String(v || "").trim()).length,
    [formData.clientIds],
  );

  const formatDateLabel = (raw?: string) => {
    if (!raw) return "";
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? raw
      : d.toLocaleDateString("es-AR", { timeZone: "UTC" });
  };

  const headerPills = useMemo(() => {
    const pills: JSX.Element[] = [];
    if (invoiceTypeLabel) {
      pills.push(
        <span key="type" className={`${pillBase} ${pillOk}`}>
          {invoiceTypeLabel}
        </span>,
      );
    }
    if (selectedClientsCount > 0) {
      pills.push(
        <span key="clients" className={`${pillBase} ${pillNeutral}`}>
          Pasajeros: {selectedClientsCount}
        </span>,
      );
    }
    if (selectedServiceIds.length > 0) {
      pills.push(
        <span key="services" className={`${pillBase} ${pillNeutral}`}>
          Servicios: {selectedServiceIds.length}
        </span>,
      );
    }
    if (formData.invoiceDate) {
      pills.push(
        <span key="date" className={`${pillBase} ${pillNeutral}`}>
          {formatDateLabel(formData.invoiceDate)}
        </span>,
      );
    }
    if (formData.exchangeRate?.trim()) {
      pills.push(
        <span key="rate" className={`${pillBase} ${pillNeutral}`}>
          TC {formData.exchangeRate}
        </span>,
      );
    }
    return pills;
  }, [
    invoiceTypeLabel,
    selectedClientsCount,
    selectedServiceIds.length,
    formData.invoiceDate,
    formData.exchangeRate,
  ]);

  const hasDescriptionFields = useMemo(
    () =>
      selectedServices.some(
        (svc) =>
          (svc?.vatOnCommission21 ?? 0) > 0 ||
          (svc?.vatOnCommission10_5 ?? 0) > 0 ||
          (svc?.nonComputable ?? 0) > 0,
      ),
    [selectedServices],
  );

  const selectedCurrencies = useMemo(() => {
    const set = new Set<string>();
    selectedServices.forEach((svc) => {
      const cur = String(svc.currency || "ARS").toUpperCase();
      set.add(cur);
    });
    return set;
  }, [selectedServices]);

  const hasMultipleCurrencies = selectedCurrencies.size > 1;
  const manualEnabled = formData.manualTotalsEnabled;
  const manualToggleDisabled = hasMultipleCurrencies;

  useEffect(() => {
    if (manualEnabled && manualToggleDisabled) {
      updateFormData("manualTotalsEnabled", false);
    }
  }, [manualEnabled, manualToggleDisabled, updateFormData]);

  const parseManualValue = (value?: string) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed.replace(",", "."));
    return Number.isFinite(num) ? num : undefined;
  };

  const manualTotalsDraft = useMemo(
    () => ({
      total: parseManualValue(formData.manualTotal),
      base21: parseManualValue(formData.manualBase21),
      iva21: parseManualValue(formData.manualIva21),
      base10_5: parseManualValue(formData.manualBase10_5),
      iva10_5: parseManualValue(formData.manualIva10_5),
      exempt: parseManualValue(formData.manualExempt),
    }),
    [
      formData.manualTotal,
      formData.manualBase21,
      formData.manualIva21,
      formData.manualBase10_5,
      formData.manualIva10_5,
      formData.manualExempt,
    ],
  );

  const manualInputTouched = useMemo(
    () => Object.values(manualTotalsDraft).some((v) => typeof v === "number"),
    [manualTotalsDraft],
  );

  const manualValidationError = useMemo(() => {
    if (!manualEnabled || !manualInputTouched) return null;
    const validation = computeManualTotals(manualTotalsDraft);
    return validation.ok ? null : validation.error;
  }, [manualEnabled, manualInputTouched, manualTotalsDraft]);

  const manualPreview = useMemo(() => {
    const base21 = manualTotalsDraft.base21 ?? 0;
    const iva21 = manualTotalsDraft.iva21 ?? 0;
    const base10 = manualTotalsDraft.base10_5 ?? 0;
    const iva10 = manualTotalsDraft.iva10_5 ?? 0;
    const exempt = manualTotalsDraft.exempt ?? 0;
    const totalInput = manualTotalsDraft.total ?? 0;

    const ivaSum = Number((iva21 + iva10).toFixed(2));
    const baseSum = Number((base21 + base10 + exempt).toFixed(2));
    const totalFromParts = Number((baseSum + ivaSum).toFixed(2));
    const total = totalInput > 0 ? totalInput : totalFromParts;
    const neto = Number((total - ivaSum).toFixed(2));

    return {
      total,
      ivaSum,
      neto,
    };
  }, [manualTotalsDraft]);

  const manualCurrency = selectedServices[0]?.currency || "ARS";
  const manualFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: manualCurrency === "PES" ? "ARS" : manualCurrency,
        minimumFractionDigits: 2,
      }),
    [manualCurrency],
  );

  return (
    <motion.div
      layout
      initial={{ maxHeight: 96, opacity: 1 }}
      animate={{
        maxHeight: showForm ? 1400 : 96,
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
            aria-controls="invoice-form-body"
          >
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white">
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
                  {showForm ? "Factura" : "Crear factura"}
                </p>
                <p className="text-xs opacity-70">
                  Seleccioná pasajeros y servicios.
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
              <div className="grid size-9 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white">
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
                <p className="text-lg font-semibold">Factura</p>
                <p className="text-xs opacity-70">
                  Seleccioná pasajeros y servicios.
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
            id="invoice-form-body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              const hasClients = (formData.clientIds || []).some(
                (v) => v && v.trim(),
              );
              const hasServices = selectedServiceIds.length > 0;
              if (!formData.tipoFactura || !hasClients || !hasServices) {
                toast.error(
                  "Completá tipo de factura, al menos un pax y un servicio.",
                );
                return;
              }
              if (manualEnabled && hasMultipleCurrencies) {
                toast.error(
                  "Los importes manuales solo se permiten con una única moneda.",
                );
                return;
              }
              handleSubmit(e);
            }}
            className="space-y-5 px-4 pb-6 pt-4 md:px-6"
          >
            <Section title="Comprobante" desc="Definí tipo y fecha de emisión.">
              <Field id="tipoFactura" label="Tipo de factura" required>
                <select
                  id="tipoFactura"
                  name="tipoFactura"
                  value={formData.tipoFactura}
                  onChange={handleChange}
                  className={`${inputBase} cursor-pointer appearance-none`}
                  required
                >
                  <option value="">Seleccionar</option>
                  <option value="1">Factura A</option>
                  <option value="6">Factura B</option>
                </select>
              </Field>

              <Field id="invoiceDate" label="Fecha de factura" required>
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
                />
              </Field>
            </Section>

            <Section title="Pasajeros" desc="Agregá uno o más destinatarios.">
              <Field id="clientCount" label="Cantidad de pasajeros" required>
                <input
                  id="clientCount"
                  type="number"
                  value={clientCount}
                  min={1}
                  onChange={(e) =>
                    setClientCount(Math.max(1, Number(e.target.value) || 1))
                  }
                  placeholder="Cantidad de pasajeros..."
                  className={inputBase}
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 md:col-span-2">
                {Array.from({ length: clientCount }).map((_, idx) => (
                  <div key={idx}>
                    <ClientPicker
                      token={token}
                      label={`Pax ${idx + 1}`}
                      placeholder="Buscar por ID, DNI, Pasaporte, CUIT o nombre..."
                      valueId={
                        formData.clientIds?.[idx]
                          ? parseInt(formData.clientIds[idx]!, 10)
                          : null
                      }
                      excludeIds={excludeForIndex(idx)}
                      onSelect={(c) => setClientAt(idx, c)}
                      onClear={() => setClientAt(idx, null)}
                      required
                    />
                  </div>
                ))}
              </div>
              {selectedClientsCount > 1 && (
                <div className="text-xs text-sky-950/70 dark:text-white/70 md:col-span-2">
                  Se emite una factura por pax y se prorratea en partes
                  iguales.
                </div>
              )}
            </Section>

            <Section
              title="Servicios"
              desc="Seleccioná los servicios de la reserva."
            >
              <div className="md:col-span-2">
                {availableServices.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm opacity-80">
                    Esta reserva no tiene servicios cargados.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {availableServices.map((svc) => {
                      const isActive = selectedServiceIds.includes(
                        svc.id_service,
                      );
                      return (
                        <button
                          type="button"
                          key={svc.id_service}
                          onClick={() => toggleService(svc)}
                          className={`rounded-2xl border p-3 text-left transition-all ${
                            isActive
                              ? "border-sky-300/40 bg-sky-100 text-sky-950 shadow-sm dark:bg-white/10 dark:text-white"
                              : "border-white/10 bg-white/10 hover:bg-white/20 dark:border-white/10 dark:bg-white/10"
                          }`}
                          title={`Servicio N° ${
                            svc.agency_service_id ?? svc.id_service
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium">
                              N° {svc.agency_service_id ?? svc.id_service} ·{" "}
                              {svc.type}
                              {svc.destination ? ` · ${svc.destination}` : ""}
                            </div>
                            {isActive && (
                              <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-sky-900 dark:bg-white/20 dark:text-white">
                                seleccionado
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-sm opacity-80">
                            <b>Venta:</b>{" "}
                            {new Intl.NumberFormat("es-AR", {
                              style: "currency",
                              currency: svc.currency || "ARS",
                              minimumFractionDigits: 2,
                            }).format(
                              (svc.sale_price ?? 0) + (svc.card_interest ?? 0),
                            )}
                            <span className="opacity-70">
                              {" "}
                              ({svc.currency || "ARS"})
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedServices.length > 0 ? (
                  <div className="ml-1 mt-2 text-xs text-sky-950/70 dark:text-white/70">
                    Seleccionados:{" "}
                    {selectedServices
                      .map((s) => `N° ${s.agency_service_id ?? s.id_service}`)
                      .join(", ")}
                  </div>
                ) : availableServices.length > 0 ? (
                  <div className="ml-1 mt-2 text-xs text-amber-700 dark:text-amber-200">
                    Seleccioná al menos un servicio para emitir la factura.
                  </div>
                ) : null}
              </div>
            </Section>

            <Section
              title="Importes manuales"
              desc="Opcional: sobrescribe el desglose automático de los servicios."
            >
              <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
                <div className="text-sm font-medium">
                  Usar importes manuales
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateFormData("manualTotalsEnabled", !manualEnabled)
                  }
                  disabled={manualToggleDisabled}
                  className={`rounded-full border px-4 py-1 text-xs font-medium transition ${
                    manualToggleDisabled
                      ? "cursor-not-allowed border-white/20 bg-white/10 text-sky-950/40 dark:text-white/40"
                      : manualEnabled
                        ? "border-sky-300/50 bg-sky-100 text-sky-950"
                        : "border-white/20 bg-white/10 text-sky-950/70 dark:text-white/70"
                  }`}
                >
                  {manualEnabled ? "Activado" : "Desactivado"}
                </button>
              </div>

              {manualEnabled && (
                <>
                  <Field
                    id="manualTotal"
                    label="Importe total (opcional)"
                    hint="Si lo dejás vacío, se calcula con los campos de abajo. Si solo completás el total, se toma como exento."
                  >
                    <input
                      id="manualTotal"
                      name="manualTotal"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.manualTotal}
                      onChange={handleChange}
                      placeholder="0.00"
                      className={inputBase}
                    />
                  </Field>

                  <Field id="manualBase21" label="Base gravada 21%">
                    <input
                      id="manualBase21"
                      name="manualBase21"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.manualBase21}
                      onChange={handleChange}
                      placeholder="0.00"
                      className={inputBase}
                    />
                  </Field>

                  <Field id="manualIva21" label="IVA 21%">
                    <input
                      id="manualIva21"
                      name="manualIva21"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.manualIva21}
                      onChange={handleChange}
                      placeholder="0.00"
                      className={inputBase}
                    />
                  </Field>

                  <Field id="manualBase10_5" label="Base gravada 10,5%">
                    <input
                      id="manualBase10_5"
                      name="manualBase10_5"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.manualBase10_5}
                      onChange={handleChange}
                      placeholder="0.00"
                      className={inputBase}
                    />
                  </Field>

                  <Field id="manualIva10_5" label="IVA 10,5%">
                    <input
                      id="manualIva10_5"
                      name="manualIva10_5"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.manualIva10_5}
                      onChange={handleChange}
                      placeholder="0.00"
                      className={inputBase}
                    />
                  </Field>

                  <Field id="manualExempt" label="Exento / No computable">
                    <input
                      id="manualExempt"
                      name="manualExempt"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.manualExempt}
                      onChange={handleChange}
                      placeholder="0.00"
                      className={inputBase}
                    />
                  </Field>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-sky-950/70 dark:text-white/70 md:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>Total manual</span>
                      <span className="font-medium text-sky-950 dark:text-white">
                        {manualFormatter.format(manualPreview.total)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <span>Neto</span>
                      <span>{manualFormatter.format(manualPreview.neto)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <span>IVA</span>
                      <span>
                        {manualFormatter.format(manualPreview.ivaSum)}
                      </span>
                    </div>
                  </div>

                  {selectedClientsCount > 1 && (
                    <div className="text-xs text-sky-950/70 dark:text-white/70 md:col-span-2">
                      Se emite una factura por pax y se prorratea en partes
                      iguales. Si querés importes distintos, emití facturas por
                      separado.
                    </div>
                  )}

                  {manualValidationError && (
                    <div className="text-xs text-rose-700 dark:text-rose-200 md:col-span-2">
                      {manualValidationError}
                    </div>
                  )}

                  {hasMultipleCurrencies && (
                    <div className="text-xs text-amber-700 dark:text-amber-200 md:col-span-2">
                      Seleccioná servicios en una sola moneda para usar importes
                      manuales.
                    </div>
                  )}
                </>
              )}

              {manualToggleDisabled && (
                <div className="text-xs text-amber-700 dark:text-amber-200 md:col-span-2">
                  El modo manual solo está disponible cuando todos los servicios
                  están en la misma moneda.
                </div>
              )}
            </Section>

            {hasDescriptionFields && (
              <Section
                title="Descripciones por servicio"
                desc="Solo aplica a servicios con conceptos impositivos."
              >
                <div className="space-y-3 md:col-span-2">
                  {selectedServices.map((svc, idx) => (
                    <div
                      key={svc.id_service}
                      className="rounded-2xl border border-white/10 bg-white/5 p-3"
                    >
                      <div className="text-sm font-medium text-sky-950 dark:text-white">
                        Servicio N° {svc.agency_service_id ?? svc.id_service}
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {(svc?.vatOnCommission21 ?? 0) > 0 && (
                          <Field
                            id={`desc21-${svc.id_service}`}
                            label={`Descripción IVA 21% (servicio ${idx + 1})`}
                          >
                            <input
                              id={`desc21-${svc.id_service}`}
                              type="text"
                              value={desc21[idx] || ""}
                              onChange={(e) => {
                                const arr = [...desc21];
                                arr[idx] = e.target.value;
                                updateFormData("description21", arr);
                              }}
                              placeholder="Ej: Excursión guiada 21%"
                              className={inputBase}
                            />
                          </Field>
                        )}

                        {(svc?.vatOnCommission10_5 ?? 0) > 0 && (
                          <Field
                            id={`desc10-${svc.id_service}`}
                            label={`Descripción IVA 10.5% (servicio ${idx + 1})`}
                          >
                            <input
                              id={`desc10-${svc.id_service}`}
                              type="text"
                              value={desc10[idx] || ""}
                              onChange={(e) => {
                                const arr = [...desc10];
                                arr[idx] = e.target.value;
                                updateFormData("description10_5", arr);
                              }}
                              placeholder="Ej: Servicio terrestre 10.5%"
                              className={inputBase}
                            />
                          </Field>
                        )}

                        {(svc?.nonComputable ?? 0) > 0 && (
                          <Field
                            id={`descNon-${svc.id_service}`}
                            label="Descripción No Computable"
                          >
                            <input
                              id={`descNon-${svc.id_service}`}
                              type="text"
                              value={descNon[idx] || ""}
                              onChange={(e) => {
                                const arr = [...descNon];
                                arr[idx] = e.target.value;
                                updateFormData("descriptionNonComputable", arr);
                              }}
                              placeholder="Ej: Cargo no computable"
                              className={inputBase}
                            />
                          </Field>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section
              title="Cotización"
              desc="Completá solo si la factura se emite en USD."
            >
              <Field id="exchangeRate" label="Cotización del dólar (opcional)">
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
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className={`rounded-full px-6 py-2 shadow-sm shadow-sky-950/20 transition active:scale-[0.98] ${
                  isSubmitting
                    ? "cursor-not-allowed bg-sky-950/20 text-white/60 dark:bg-white/5 dark:text-white/40"
                    : "bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
                }`}
              >
                {isSubmitting ? <Spinner /> : "Crear factura"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
