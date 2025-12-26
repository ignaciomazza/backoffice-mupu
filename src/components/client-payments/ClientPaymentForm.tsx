// src/components/client-payments/ClientPaymentForm.tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";
import {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { Booking, Client } from "@/types";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { authFetch } from "@/utils/authFetch";
import ClientPicker from "@/components/clients/ClientPicker";

type Props = {
  token: string | null;
  booking: Booking;
  onCreated?: () => void;
};

type AmountMode = "total" | "per_equal" | "per_custom";

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

/* ===== helpers de moneda robustos ===== */
function isValidCurrencyCode(code: string): boolean {
  const c = (code || "").trim().toUpperCase();
  if (!c) return false;
  try {
    new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(
      1,
    );
    return true;
  } catch {
    return false;
  }
}
function normalizeCurrencyCode(raw: string): string {
  const s = (raw || "").trim().toUpperCase();
  if (!s) return "ARS";
  const maps: Record<string, string> = {
    U$D: "USD",
    U$S: "USD",
    US$: "USD",
    USD$: "USD",
    AR$: "ARS",
    $: "ARS",
  };
  if (maps[s]) return maps[s];
  const m = s.match(/[A-Z]{3}/);
  const code = m ? m[0] : s;
  return isValidCurrencyCode(code) ? code : "ARS";
}

export default function ClientPaymentForm({
  token,
  booking,
  onCreated,
}: Props) {
  const [isFormVisible, setIsFormVisible] = useState(false);

  // Cliente que paga (prefill: titular al abrir)
  const [payerClientId, setPayerClientId] = useState<number | null>(null);

  // Cantidad de pagos
  const [count, setCount] = useState<number>(1);

  // Modo de importes
  const [amountMode, setAmountMode] = useState<AmountMode>("total");
  const [amountInput, setAmountInput] = useState<string>("");
  const [amountsArray, setAmountsArray] = useState<string[]>([""]);
  const [currency, setCurrency] = useState<string>("ARS");

  // Vencimientos
  const mkTodayIso = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  };
  const [dueDatesArray, setDueDatesArray] = useState<string[]>([""]);
  const [seedDate, setSeedDate] = useState<string>(mkTodayIso());
  const [frequencyDays, setFrequencyDays] = useState<number>(30);

  // Prefill de titular cuando se abre el form
  useEffect(() => {
    if (isFormVisible && !payerClientId && booking?.titular?.id_client) {
      setPayerClientId(booking.titular.id_client);
    }
  }, [isFormVisible, payerClientId, booking?.titular?.id_client]);

  // Mantener arrays en sync con 'count'
  useEffect(() => {
    const syncLen = (arr: string[], len: number) => {
      const next = [...arr];
      if (len > next.length) while (next.length < len) next.push("");
      else if (len < next.length) next.length = len;
      return next;
    };
    setAmountsArray((prev) => syncLen(prev, count));
    setDueDatesArray((prev) => syncLen(prev, count));
  }, [count]);

  // UI
  const inputBase =
    "w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10 dark:text-white";

  const formatMoney = useCallback((n: number, cur = "ARS") => {
    const code = normalizeCurrencyCode(cur);
    const v = Number.isFinite(n) ? n : 0;
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
      }).format(v);
    } catch {
      return `${v.toFixed(2)} ${code}`;
    }
  }, []);

  const sumCustom = (arr: string[]) =>
    arr.reduce((acc, v) => {
      const n = Number(v);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);

  const previewAmount = useMemo(() => {
    const code = normalizeCurrencyCode(currency);
    if (amountMode === "total") {
      const n = Number(amountInput);
      if (!Number.isFinite(n) || n <= 0) return "";
      return formatMoney(n, code);
    }
    if (amountMode === "per_equal") {
      const n = Number(amountInput);
      if (!Number.isFinite(n) || n <= 0) return "";
      return `${formatMoney(n, code)} × ${count} = ${formatMoney(n * count, code)}`;
    }
    const total = sumCustom(amountsArray);
    if (total <= 0) return "";
    return `${amountsArray
      .map((v, i) => `N°${i + 1}: ${formatMoney(Number(v || 0), code)}`)
      .join(" + ")} = ${formatMoney(total, code)}`;
  }, [amountMode, amountInput, currency, count, amountsArray, formatMoney]);

  const totalPreview = useMemo(() => {
    const code = normalizeCurrencyCode(currency);
    if (amountMode === "total") {
      const n = Number(amountInput);
      return Number.isFinite(n) && n > 0 ? formatMoney(n, code) : "";
    }
    if (amountMode === "per_equal") {
      const n = Number(amountInput);
      return Number.isFinite(n) && n > 0 ? formatMoney(n * count, code) : "";
    }
    const total = sumCustom(amountsArray);
    return total > 0 ? formatMoney(total, code) : "";
  }, [amountMode, amountInput, currency, count, amountsArray, formatMoney]);

  const headerPills = useMemo(() => {
    const pills: ReactNode[] = [];
    pills.push(
      <span
        key="count"
        className="rounded-full bg-white/30 px-3 py-1 text-xs font-medium dark:bg-white/10"
      >
        Cuotas: {count}
      </span>,
    );
    pills.push(
      <span
        key="currency"
        className="rounded-full bg-white/30 px-3 py-1 text-xs font-medium dark:bg-white/10"
      >
        Moneda: {normalizeCurrencyCode(currency)}
      </span>,
    );
    if (totalPreview) {
      pills.push(
        <span
          key="total"
          className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
        >
          Total: {totalPreview}
        </span>,
      );
    }
    return pills;
  }, [count, currency, totalPreview]);

  const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const autofillDueDates = () => {
    if (!seedDate || !Number.isFinite(frequencyDays) || frequencyDays <= 0) {
      toast.error("Completá la fecha inicial y una frecuencia válida (> 0).");
      return;
    }
    const filled = Array.from({ length: count }, (_, i) =>
      i === 0 ? seedDate : addDays(seedDate, i * frequencyDays),
    );
    setDueDatesArray(filled);
    toast.info("Fechas de vencimiento completadas.");
  };

  const resetForm = () => {
    setPayerClientId(null);
    setCount(1);
    setAmountMode("total");
    setAmountInput("");
    setAmountsArray([""]);
    setCurrency("ARS");
    setDueDatesArray([""]);
    setSeedDate(mkTodayIso());
    setFrequencyDays(30);
  };

  const [loading, setLoading] = useState(false);

  // Control de concurrencia submit
  const submitRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      if (submitRef.current) submitRef.current.abort();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("Sesión expirada. Volvé a iniciar sesión.");
      return;
    }
    if (loading) return;

    // Validaciones básicas
    if (!payerClientId) {
      toast.error("Seleccioná el cliente que paga.");
      return;
    }
    if (!count || count < 1) {
      toast.error("La cantidad de pagos debe ser al menos 1.");
      return;
    }
    const cur = normalizeCurrencyCode(currency);
    if (!isValidCurrencyCode(cur)) {
      toast.error("Moneda inválida.");
      return;
    }

    // Importes
    let amountTotal = 0;
    let perInstallmentAmounts: number[] | undefined;

    if (amountMode === "total") {
      const n = Number(amountInput);
      if (!Number.isFinite(n) || n <= 0) {
        toast.error("Ingresá el monto total (> 0).");
        return;
      }
      amountTotal = n;
    } else if (amountMode === "per_equal") {
      const n = Number(amountInput);
      if (!Number.isFinite(n) || n <= 0) {
        toast.error("Ingresá el monto por cuota (> 0).");
        return;
      }
      amountTotal = n * count;
      perInstallmentAmounts = Array.from({ length: count }, () => n);
    } else {
      const parsed = amountsArray.map((v) => Number(v));
      if (parsed.some((v) => !Number.isFinite(v) || v <= 0)) {
        toast.error(
          "Revisá los montos personalizados: deben ser > 0 y válidos.",
        );
        return;
      }
      if (parsed.length !== count) {
        toast.error(
          "La cantidad de montos no coincide con la cantidad de pagos.",
        );
        return;
      }
      perInstallmentAmounts = parsed;
      amountTotal = parsed.reduce((a, b) => a + b, 0);
    }

    // Vencimientos
    const cleanedDueDates = dueDatesArray.map((d) => (d || "").trim());
    if (cleanedDueDates.length !== count || cleanedDueDates.some((d) => !d)) {
      toast.error("Completá la fecha de vencimiento para cada cuota.");
      return;
    }

    // Enviar
    setLoading(true);
    if (submitRef.current) submitRef.current.abort();
    const ac = new AbortController();
    submitRef.current = ac;

    try {
      const payload: Record<string, unknown> = {
        bookingId: booking.id_booking,
        clientId: Number(payerClientId),
        count,
        amount: amountTotal,
        currency: cur,
        dueDates: cleanedDueDates,
        ...(perInstallmentAmounts ? { amounts: perInstallmentAmounts } : {}),
      };

      const res = await authFetch(
        "/api/client-payments",
        { method: "POST", body: JSON.stringify(payload), signal: ac.signal },
        token,
      );

      if (!res.ok) {
        let msg = "No se pudo crear el/los pago(s) del cliente.";
        try {
          const data = await res.json();
          const maybe =
            (data as { error?: string; message?: string }).error ||
            (data as { error?: string; message?: string }).message;
          if (maybe) msg = maybe;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      toast.success("Pagos del cliente creados correctamente.");
      onCreated?.();
      resetForm();
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      const msg =
        err instanceof Error ? err.message : "Error creando pagos del cliente.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ maxHeight: 96, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 2000 : 96,
        opacity: 1,
        transition: { duration: 0.35, ease: "easeInOut" },
      }}
      className="mb-6 overflow-auto rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md shadow-sky-950/10 dark:text-white"
    >
      <div
        className={`sticky top-0 z-10 ${isFormVisible ? "rounded-t-3xl border-b" : ""} border-white/10 px-4 py-3 backdrop-blur-sm`}
      >
        <button
          type="button"
          onClick={() => setIsFormVisible((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={isFormVisible}
          aria-controls="client-payment-form-body"
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
                {isFormVisible ? "Plan de pagos" : "Cargar plan de pagos"}
              </p>
              <p className="text-xs opacity-70">
                Reserva #{booking.id_booking}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">{headerPills}</div>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isFormVisible && (
          <motion.div
            key="body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.form
              id="client-payment-form-body"
              onSubmit={handleSubmit}
              className="space-y-5 px-4 pb-6 pt-4 md:px-6"
            >
              <Section
                title="Cliente que paga"
                desc="Podés seleccionar cualquier cliente, no se limita a la reserva."
              >
                <div className="md:col-span-2">
                  <ClientPicker
                    token={token}
                    label=""
                    placeholder="Buscar por ID, DNI, Pasaporte, CUIT o nombre..."
                    valueId={payerClientId}
                    excludeIds={[]}
                    onSelect={(c: Client | null) =>
                      setPayerClientId(c ? c.id_client : null)
                    }
                    onClear={() => setPayerClientId(null)}
                  />
                </div>
              </Section>

              <Section
                title="Plan de pagos"
                desc="Definí la cantidad de cuotas y cómo vas a repartir el importe."
              >
                <Field id="payment_count" label="Cantidad de pagos" required>
                  <input
                    id="payment_count"
                    type="number"
                    min={1}
                    step={1}
                    className={inputBase}
                    value={count}
                    onChange={(e) =>
                      setCount(Math.max(1, Number(e.target.value) || 1))
                    }
                    required
                  />
                </Field>

                <div className="space-y-2 md:col-span-2">
                  <label className="ml-1 block text-sm font-medium text-sky-950 dark:text-white">
                    Modo de importe
                  </label>
                  <div
                    className="grid grid-cols-1 gap-2 md:grid-cols-3"
                    role="radiogroup"
                    aria-label="Modo de importe"
                  >
                    <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/20 bg-white/40 px-3 py-2 text-sm shadow-sm shadow-sky-950/10 transition hover:bg-white/60 dark:bg-white/10">
                      <input
                        type="radio"
                        name="amountMode"
                        className="size-4"
                        checked={amountMode === "total"}
                        onChange={() => setAmountMode("total")}
                      />
                      <span>Total único</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/20 bg-white/40 px-3 py-2 text-sm shadow-sm shadow-sky-950/10 transition hover:bg-white/60 dark:bg-white/10">
                      <input
                        type="radio"
                        name="amountMode"
                        className="size-4"
                        checked={amountMode === "per_equal"}
                        onChange={() => setAmountMode("per_equal")}
                      />
                      <span>Por cuota (mismo monto)</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/20 bg-white/40 px-3 py-2 text-sm shadow-sm shadow-sky-950/10 transition hover:bg-white/60 dark:bg-white/10">
                      <input
                        type="radio"
                        name="amountMode"
                        className="size-4"
                        checked={amountMode === "per_custom"}
                        onChange={() => setAmountMode("per_custom")}
                      />
                      <span>Por cuota (montos personalizados)</span>
                    </label>
                  </div>
                </div>
              </Section>

              <Section
                title="Importes"
                desc="Ingresá los montos en la moneda seleccionada."
              >
                {amountMode !== "per_custom" ? (
                  <>
                    <Field
                      id="amount_input"
                      label={
                        amountMode === "total"
                          ? "Monto total"
                          : "Monto por cuota"
                      }
                      required
                    >
                      <input
                        id="amount_input"
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        className={inputBase}
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        placeholder="0.00"
                        required
                      />
                      {previewAmount && (
                        <p className="ml-1 mt-1 text-xs opacity-80">
                          {previewAmount}
                        </p>
                      )}
                    </Field>

                    <Field id="currency" label="Moneda" required>
                      <select
                        id="currency"
                        className={`${inputBase} cursor-pointer`}
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        required
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                    </Field>
                  </>
                ) : (
                  <>
                    <Field id="currency" label="Moneda" required>
                      <select
                        id="currency"
                        className={`${inputBase} cursor-pointer`}
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        required
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                      {previewAmount && (
                        <p className="ml-1 mt-1 text-xs opacity-80">
                          {previewAmount}
                        </p>
                      )}
                    </Field>

                    <div className="grid grid-cols-1 gap-3 md:col-span-2 md:grid-cols-2">
                      {Array.from({ length: count }).map((_, idx) => (
                        <Field
                          key={idx}
                          id={`custom_amount_${idx}`}
                          label={`Monto cuota N°${idx + 1}`}
                          required
                        >
                          <input
                            id={`custom_amount_${idx}`}
                            type="number"
                            step="0.01"
                            min="0"
                            className={inputBase}
                            value={amountsArray[idx] ?? ""}
                            onChange={(e) =>
                              setAmountsArray((prev) => {
                                const next = [...prev];
                                next[idx] = e.target.value;
                                return next;
                              })
                            }
                            placeholder="0.00"
                            required
                          />
                        </Field>
                      ))}
                    </div>
                  </>
                )}
              </Section>

              <Section
                title="Vencimientos"
                desc="Definí fechas manualmente o completalas con una frecuencia fija."
              >
                <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-3">
                  <Field id="seed_date" label="Fecha de la primera cuota">
                    <input
                      id="seed_date"
                      type="date"
                      className={`${inputBase} cursor-pointer`}
                      value={seedDate}
                      onChange={(e) => setSeedDate(e.target.value)}
                    />
                  </Field>
                  <Field id="frequency_days" label="Frecuencia (días)">
                    <input
                      id="frequency_days"
                      type="number"
                      min={1}
                      step={1}
                      className={inputBase}
                      value={frequencyDays}
                      onChange={(e) =>
                        setFrequencyDays(
                          Math.max(1, Number(e.target.value) || 1),
                        )
                      }
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={autofillDueDates}
                      className="w-full rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                    >
                      Autorellenar fechas
                    </button>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  {Array.from({ length: count }).map((_, idx) => (
                    <Field
                      key={idx}
                      id={`due_date_${idx}`}
                      label={`Vencimiento cuota N°${idx + 1}`}
                      required
                    >
                      <input
                        id={`due_date_${idx}`}
                        type="date"
                        className={`${inputBase} cursor-pointer`}
                        value={dueDatesArray[idx] ?? ""}
                        onChange={(e) =>
                          setDueDatesArray((prev) => {
                            const next = [...prev];
                            next[idx] = e.target.value;
                            return next;
                          })
                        }
                        required
                      />
                    </Field>
                  ))}
                  <p className="ml-1 text-xs text-sky-950/70 dark:text-white/70">
                    Todas las cuotas requieren una fecha de vencimiento.
                  </p>
                </div>
              </Section>

              <div className="sticky bottom-2 z-10 flex justify-end">
                <button
                  type="submit"
                  disabled={loading || !token}
                  aria-busy={loading}
                  className={`rounded-full px-6 py-2 shadow-sm shadow-sky-950/20 transition active:scale-[0.98] ${
                    loading || !token
                      ? "cursor-not-allowed bg-sky-950/20 text-white/60 dark:bg-white/5 dark:text-white/40"
                      : "bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
                  }`}
                >
                  {loading ? <Spinner /> : "Crear pagos"}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
