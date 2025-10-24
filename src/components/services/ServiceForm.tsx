// src/components/services/ServiceForm.tsx
"use client";

import { ChangeEvent, FormEvent, useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Operator, BillingData } from "@/types";
import BillingBreakdown from "@/components/BillingBreakdown";
import DestinationPicker, {
  DestinationOption,
} from "@/components/DestinationPicker";
import Spinner from "@/components/Spinner";
import { loadFinancePicks } from "@/utils/loadFinancePicks";

export type ServiceFormData = {
  type: string;
  description?: string;
  sale_price: number;
  cost_price: number;
  destination?: string;
  reference?: string;
  tax_21?: number;
  tax_105?: number;
  exempt?: number;
  other_taxes?: number;
  card_interest?: number;
  card_interest_21?: number;
  currency: string;
  id_operator: number;
  departure_date: string;
  return_date: string;
  transfer_fee_pct?: number | null;
};

type ServiceFormProps = {
  formData: ServiceFormData;
  handleChange: (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => void;
  handleSubmit: (e: FormEvent) => void | Promise<void>;
  editingServiceId: number | null;
  operators: Operator[];
  isFormVisible: boolean;
  setIsFormVisible: React.Dispatch<React.SetStateAction<boolean>>;
  onBillingUpdate?: (data: BillingData) => void;
  agencyTransferFeePct: number;
  token: string | null; // para cargar monedas desde finance
};

/* ---------- helpers UI (misma paleta) ---------- */
const Section: React.FC<{
  title: string;
  desc?: string;
  children: React.ReactNode;
}> = ({ title, desc, children }) => (
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

const Field: React.FC<{
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ id, label, hint, required, children }) => (
  <div className="space-y-1">
    <label
      htmlFor={id}
      className="ml-1 block text-sm font-medium text-sky-950 dark:text-white"
    >
      {label} {required && <span className="text-rose-600">*</span>}
    </label>
    {children}
    {hint && (
      <p
        id={`${id}-hint`}
        className="ml-1 text-xs text-sky-950/70 dark:text-white/70"
      >
        {hint}
      </p>
    )}
  </div>
);

/* util mínima para opciones únicas ordenadas */
const uniqSorted = (arr: string[]) =>
  Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "es"),
  );

type FinanceCurrency = { code: string; name: string; enabled: boolean };

export default function ServiceForm({
  formData,
  handleChange,
  handleSubmit,
  editingServiceId,
  operators,
  isFormVisible,
  setIsFormVisible,
  onBillingUpdate,
  agencyTransferFeePct,
  token,
}: ServiceFormProps) {
  const effectiveTransferFeePct =
    formData.transfer_fee_pct != null
      ? formData.transfer_fee_pct
      : agencyTransferFeePct;

  const currencySymbol = useMemo(
    () => (formData.currency === "USD" ? "US$" : "$"),
    [formData.currency],
  );

  const formatCurrency = (value: number) =>
    isNaN(value)
      ? ""
      : new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: formData.currency || "ARS",
        }).format(value);

  const formatIsoToDisplay = (v: string) =>
    !v || v.includes("/") ? v : v.split("-").reverse().join("/");
  const formatDisplayToIso = (v: string) => {
    const p = v.split("/");
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : v;
  };

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value: raw } = e.target;
    const d = raw.replace(/\D/g, "");
    let f = "";
    if (d.length >= 1) f += d.substring(0, 2);
    if (d.length >= 3) f += "/" + d.substring(2, 4);
    if (d.length >= 5) f += "/" + d.substring(4, 8);
    handleChange({
      target: { name, value: f },
    } as ChangeEvent<HTMLInputElement>);
  };
  const handleDatePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData("text").replace(/\D/g, "");
    if (t.length === 8) {
      e.preventDefault();
      handleChange({
        target: {
          name: e.currentTarget.name,
          value: `${t.slice(0, 2)}/${t.slice(2, 4)}/${t.slice(4, 8)}`,
        },
      } as ChangeEvent<HTMLInputElement>);
    }
  };
  const handleDateBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    handleChange({
      target: { name, value: formatDisplayToIso(value) },
    } as ChangeEvent<HTMLInputElement>);
  };

  const hasPrices =
    Number(formData.sale_price) > 0 && Number(formData.cost_price) > 0;
  const margin = useMemo(
    () =>
      hasPrices ? Number(formData.sale_price) - Number(formData.cost_price) : 0,
    [formData.sale_price, formData.cost_price, hasPrices],
  );

  /* ========== DESTINATION PICKER (con checkboxes siempre visibles) ========== */
  const [countryMode, setCountryMode] = useState(false);
  const [multiMode, setMultiMode] = useState(false);

  // Defaults por tipo (usuario siempre puede cambiarlos)
  useEffect(() => {
    setCountryMode(formData.type === "Visa");
    setMultiMode(["Circuito", "Tour"].includes(formData.type));
  }, [formData.type]);

  const [destSelection, setDestSelection] = useState<
    DestinationOption | DestinationOption[] | null
  >(null);
  const [destValid, setDestValid] = useState(false);

  // Si estamos editando y ya hay texto guardado, permitimos enviar sin re-pick
  useEffect(() => {
    if (
      editingServiceId &&
      (formData.destination || "").trim() &&
      !destSelection
    ) {
      setDestValid(true);
    }
  }, [editingServiceId, formData.destination, destSelection]);

  // Al cambiar modo país/múltiple, reseteamos selección/validez
  useEffect(() => {
    setDestSelection(null);
    setDestValid(false);
  }, [countryMode, multiMode]);

  const handleDestinationChange = (
    val: DestinationOption | DestinationOption[] | null,
  ) => {
    setDestSelection(val);
    let text = "";
    if (Array.isArray(val)) {
      text = val.map((v) => v.displayLabel).join(" · ");
    } else if (val) {
      text = val.displayLabel;
    }
    handleChange({
      target: { name: "destination", value: text },
    } as ChangeEvent<HTMLInputElement>);
  };

  /* ========== MONEDAS desde finance currency ========== */
  const [financeCurrencies, setFinanceCurrencies] = useState<
    FinanceCurrency[] | null
  >(null);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setLoadingCurrencies(true);
        const picks = await loadFinancePicks(token);
        setFinanceCurrencies(picks?.currencies ?? null);
      } catch {
        setFinanceCurrencies(null);
      } finally {
        setLoadingCurrencies(false);
      }
    })();
  }, [token]);

  const currencyOptions = useMemo(
    () =>
      uniqSorted(
        (financeCurrencies || [])
          .filter((c) => c.enabled)
          .map((c) => (c.code || "").toUpperCase()),
      ),
    [financeCurrencies],
  );

  const currencyLabelDict = useMemo(() => {
    const dict: Record<string, string> = {};
    for (const c of financeCurrencies || []) {
      if (c.enabled) dict[String(c.code).toUpperCase()] = c.name;
    }
    return dict;
  }, [financeCurrencies]);

  /* ========== Spinner de submit (sin any) ========== */
  const [submitting, setSubmitting] = useState(false);

  const onLocalSubmit = async (e: FormEvent) => {
    setSubmitting(true);
    try {
      // Soporta sync o async sin usar `any`
      await Promise.resolve(handleSubmit(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submitDisabled = !destValid || submitting;

  return (
    <motion.div
      layout
      initial={{ maxHeight: 96, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 700 : 96,
        opacity: 1,
        transition: { duration: 0.35, ease: "easeInOut" },
      }}
      id="service-form"
      className="mb-6 overflow-auto rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md shadow-sky-950/10 dark:text-white"
    >
      {/* HEADER */}
      <div
        className={`sticky top-0 z-10 ${isFormVisible ? "rounded-t-3xl border-b" : ""} border-white/10 px-4 py-3 backdrop-blur-sm`}
      >
        <button
          type="button"
          onClick={() => setIsFormVisible(!isFormVisible)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={isFormVisible}
          aria-controls="service-form-body"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white">
              {isFormVisible ? (
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
                {editingServiceId ? "Editar Servicio" : "Agregar Servicio"}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-full bg-white/30 px-3 py-1 text-xs font-medium dark:bg-white/10">
              {formData.currency || "ARS"}
            </span>
            {hasPrices && (
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Margen: {formatCurrency(margin)}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* BODY */}
      <AnimatePresence initial={false}>
        {isFormVisible && (
          <motion.div
            key="body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative"
          >
            <motion.form
              id="service-form-body"
              onSubmit={onLocalSubmit}
              className="space-y-5 px-4 pb-6 pt-4 md:px-6"
            >
              {/* DATOS BÁSICOS */}
              <Section
                title="Datos básicos"
                desc="Definen qué compró el cliente y cómo lo vas a identificar."
              >
                <Field
                  id="type"
                  label="Tipo de Servicio"
                  required
                  hint="Seleccioná una categoría."
                >
                  <select
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    required
                    className="w-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                    aria-describedby="type-hint"
                  >
                    <option value="" disabled>
                      Seleccionar tipo
                    </option>
                    <option value="Paquete Argentina">Paquete Argentina</option>
                    <option value="Cupo Exterior">Cupo Exterior</option>
                    <option value="Aéreo - Cabotaje">Aéreo - Cabotaje</option>
                    <option value="Aéreo - Regional">Aéreo - Regional</option>
                    <option value="Aéreo - Internacional">
                      Aéreo - Internacional
                    </option>
                    <option value="Hotelería">Hotelería</option>
                    <option value="Hotelería y Traslado">
                      Hotelería y Traslado
                    </option>
                    <option value="Traslado">Traslado</option>
                    <option value="Asistencia">Asistencia</option>
                    <option value="Excursiones">Excursiones</option>
                    <option value="Alquiler de Auto">Alquiler de Auto</option>
                    <option value="Tour">Tour</option>
                    <option value="Circuito">Circuito</option>
                    <option value="Crucero">Crucero</option>
                    <option value="Visa">Gestión de Visado</option>
                    <option value="Asientos">Gestión de Asientos</option>
                  </select>
                </Field>

                <Field
                  id="description"
                  label="Descripción"
                  hint="Aparece en recibos. Sé claro y breve."
                >
                  <input
                    id="description"
                    type="text"
                    name="description"
                    value={formData.description || ""}
                    onChange={handleChange}
                    placeholder="Detalle del servicio..."
                    className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  />
                </Field>

                {/* Destination controls (checkboxes) */}
                <div className="col-span-full -mb-1 flex flex-wrap items-center gap-4 px-1">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={countryMode}
                      onChange={(e) => setCountryMode(e.target.checked)}
                      className="size-4 rounded border-white/30 bg-white/30 text-sky-600 shadow-sm shadow-sky-950/10 dark:border-white/20 dark:bg-white/10"
                    />
                    Solo país
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={multiMode}
                      onChange={(e) => setMultiMode(e.target.checked)}
                      className="size-4 rounded border-white/30 bg-white/30 text-sky-600 shadow-sm shadow-sky-950/10 dark:border-white/20 dark:bg-white/10"
                    />
                    Múltiples destinos
                  </label>
                </div>

                {/* DestinationPicker */}
                <div className="space-y-1">
                  <DestinationPicker
                    type={countryMode ? "country" : "destination"}
                    multiple={multiMode}
                    value={destSelection}
                    onChange={handleDestinationChange}
                    onValidChange={setDestValid}
                    placeholder={
                      countryMode
                        ? "Ej.: Argentina, Brasil…"
                        : "Ej.: París, Salta…"
                    }
                    hint={
                      multiMode
                        ? "Podés sumar varios destinos/países. Se guardan como texto."
                        : countryMode
                          ? "Elegí el país correspondiente."
                          : "Elegí un destino habilitado."
                    }
                  />
                  {formData.destination ? (
                    <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                      Guardará como: <b>{formData.destination}</b>
                    </p>
                  ) : null}
                </div>

                <Field
                  id="reference"
                  label="Referencia"
                  hint="Localizador, nro de reserva del operador, etc."
                >
                  <input
                    id="reference"
                    type="text"
                    name="reference"
                    value={formData.reference || ""}
                    onChange={handleChange}
                    placeholder="Ej: ABC12345"
                    className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  />
                </Field>
              </Section>

              {/* FECHAS & OPERADOR */}
              <Section title="Fechas y Operador">
                <Field
                  id="departure_date"
                  label="Desde"
                  hint="Formato: dd/mm/aaaa"
                >
                  <input
                    id="departure_date"
                    type="text"
                    name="departure_date"
                    value={
                      formData.departure_date
                        ? formatIsoToDisplay(formData.departure_date)
                        : ""
                    }
                    onChange={handleDateChange}
                    onPaste={handleDatePaste}
                    onBlur={handleDateBlur}
                    inputMode="numeric"
                    placeholder="dd/mm/aaaa"
                    className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  />
                </Field>

                <Field
                  id="return_date"
                  label="Hasta"
                  hint="Formato: dd/mm/aaaa"
                >
                  <input
                    id="return_date"
                    type="text"
                    name="return_date"
                    value={
                      formData.return_date
                        ? formatIsoToDisplay(formData.return_date)
                        : ""
                    }
                    onChange={handleDateChange}
                    onPaste={handleDatePaste}
                    onBlur={handleDateBlur}
                    inputMode="numeric"
                    placeholder="dd/mm/aaaa"
                    className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  />
                </Field>

                <Field id="id_operator" label="Operador">
                  <select
                    id="id_operator"
                    name="id_operator"
                    value={formData.id_operator || 0}
                    onChange={handleChange}
                    className="w-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  >
                    <option value={0} disabled>
                      Seleccionar operador
                    </option>
                    {operators.map((op) => (
                      <option key={op.id_operator} value={op.id_operator}>
                        {op.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="currency" label="Moneda" required>
                  <select
                    id="currency"
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                    required
                    disabled={currencyOptions.length === 0}
                    className="w-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  >
                    <option value="" disabled>
                      {loadingCurrencies
                        ? "Cargando monedas…"
                        : currencyOptions.length
                          ? "Seleccionar moneda"
                          : "Sin monedas habilitadas"}
                    </option>
                    {currencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {currencyLabelDict[code]
                          ? `${code} — ${currencyLabelDict[code]}`
                          : code}
                      </option>
                    ))}
                  </select>
                </Field>
              </Section>

              {/* PRECIOS */}
              <Section
                title="Precios"
                desc="Ingresá los montos en la moneda seleccionada."
              >
                <Field
                  id="cost_price"
                  label="Costo"
                  required
                  hint={`Se mostrará como ${currencySymbol} en los totales.`}
                >
                  <div className="relative">
                    <input
                      id="cost_price"
                      type="number"
                      name="cost_price"
                      value={formData.cost_price || ""}
                      onChange={handleChange}
                      placeholder="0,00"
                      step="0.01"
                      min="0"
                      required
                      className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                    />
                  </div>
                  <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                    {formatCurrency(formData.cost_price)}
                  </p>
                </Field>

                <Field id="sale_price" label="Venta" required>
                  <div className="relative">
                    <input
                      id="sale_price"
                      type="number"
                      name="sale_price"
                      value={formData.sale_price || ""}
                      onChange={handleChange}
                      placeholder="0,00"
                      step="0.01"
                      min="0"
                      required
                      className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                    />
                  </div>
                  <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                    {formatCurrency(formData.sale_price)}
                  </p>
                </Field>

                <Field id="tax_21" label="IVA 21%">
                  <input
                    id="tax_21"
                    type="number"
                    name="tax_21"
                    value={formData.tax_21 || ""}
                    onChange={handleChange}
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                    className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  />
                  <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                    {formatCurrency(formData.tax_21 || 0)}
                  </p>
                </Field>

                <Field id="tax_105" label="IVA 10,5%">
                  <input
                    id="tax_105"
                    type="number"
                    name="tax_105"
                    value={formData.tax_105 || ""}
                    onChange={handleChange}
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                    className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  />
                  <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                    {formatCurrency(formData.tax_105 || 0)}
                  </p>
                </Field>

                <Field id="exempt" label="Exento">
                  <input
                    id="exempt"
                    type="number"
                    name="exempt"
                    value={formData.exempt || ""}
                    onChange={handleChange}
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                    className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  />
                  <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                    {formatCurrency(formData.exempt || 0)}
                  </p>
                </Field>

                <Field id="other_taxes" label="Otros Impuestos">
                  <input
                    id="other_taxes"
                    type="number"
                    name="other_taxes"
                    value={formData.other_taxes || ""}
                    onChange={handleChange}
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                    className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  />
                  <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                    {formatCurrency(formData.other_taxes || 0)}
                  </p>
                </Field>
              </Section>

              {/* TARJETA */}
              <Section
                title="Tarjeta"
                desc="Si la operación tiene interés por financiación, podés discriminarlo."
              >
                <Field id="card_interest" label="Interés">
                  <input
                    id="card_interest"
                    type="number"
                    name="card_interest"
                    value={formData.card_interest || ""}
                    onChange={handleChange}
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                    className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  />
                  <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                    {formatCurrency(formData.card_interest || 0)}
                  </p>
                </Field>

                <Field id="card_interest_21" label="IVA 21% (Interés)">
                  <input
                    id="card_interest_21"
                    type="number"
                    name="card_interest_21"
                    value={formData.card_interest_21 || ""}
                    onChange={handleChange}
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                    className="w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10"
                  />
                  <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                    {formatCurrency(formData.card_interest_21 || 0)}
                  </p>
                </Field>

                <div className="col-span-full">
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3 text-xs">
                    <span className="font-medium">Costo por transferencia</span>{" "}
                    aplicado en cálculos:{" "}
                    <span className="rounded-full bg-white/30 px-2 py-0.5 font-medium">
                      {(effectiveTransferFeePct * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </Section>

              {/* DESGLOSE */}
              {hasPrices && (
                <BillingBreakdown
                  importeVenta={formData.sale_price}
                  costo={formData.cost_price}
                  montoIva21={formData.tax_21 || 0}
                  montoIva10_5={formData.tax_105 || 0}
                  montoExento={formData.exempt || 0}
                  otrosImpuestos={formData.other_taxes || 0}
                  cardInterest={formData.card_interest || 0}
                  cardInterestIva={formData.card_interest_21 || 0}
                  moneda={formData.currency || "ARS"}
                  onBillingUpdate={onBillingUpdate}
                  transferFeePct={effectiveTransferFeePct}
                />
              )}

              {/* ACTION BAR */}
              <div className="sticky bottom-2 z-10 flex justify-end">
                <button
                  type="submit"
                  disabled={submitDisabled}
                  aria-busy={submitting}
                  className={`rounded-full px-6 py-2 shadow-sm shadow-sky-950/20 transition active:scale-[0.98] ${
                    submitDisabled
                      ? "cursor-not-allowed bg-sky-950/20 text-white/60 dark:bg-white/5 dark:text-white/40"
                      : "bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
                  }`}
                  aria-label={
                    editingServiceId
                      ? "Guardar cambios del servicio"
                      : "Agregar servicio"
                  }
                >
                  {submitting ? (
                    <Spinner />
                  ) : editingServiceId ? (
                    "Guardar Cambios"
                  ) : (
                    "Agregar Servicio"
                  )}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
