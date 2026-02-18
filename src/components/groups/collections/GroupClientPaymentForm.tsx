// src/components/groups/collections/GroupClientPaymentForm.tsx
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
import type { Booking } from "@/types";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { authFetch } from "@/utils/authFetch";

type Props = {
  token: string | null;
  booking: Booking;
  groupId?: string;
  groupPassengerId?: number | null;
  groupDepartureId?: number | null;
  onCreated?: () => void;
  defaultClientId?: number | null;
  lockClient?: boolean;
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
  <section className="rounded-2xl border border-sky-200/70 bg-white/75 p-5 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55">
    <div className="mb-4">
      <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-base">
        {title}
      </h3>
      {desc && (
        <p className="mt-1 text-[11px] font-light leading-relaxed text-slate-600 dark:text-slate-400 md:text-xs">
          {desc}
        </p>
      )}
    </div>
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-7">{children}</div>
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
  <div className="space-y-2">
    <label
      htmlFor={id}
      className="ml-1 block text-[13px] font-medium text-slate-900 dark:text-slate-100 md:text-sm"
    >
      {label} {required && <span className="text-rose-600">*</span>}
    </label>
    {children}
    {hint && (
      <p className="ml-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 md:text-xs">
        {hint}
      </p>
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

export default function GroupClientPaymentForm({
  token,
  booking,
  groupId,
  groupPassengerId = null,
  groupDepartureId = null,
  onCreated,
  defaultClientId = null,
  lockClient = false,
}: Props) {
  const [isFormVisible, setIsFormVisible] = useState(false);

  // Pax que paga (prefill: titular al abrir)
  const [payerClientId, setPayerClientId] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);

  const bookingPaxOptions = useMemo(() => {
    const items = [booking.titular, ...(booking.clients ?? [])];
    const unique = new Map<number, { id: number; label: string }>();

    for (const pax of items) {
      if (!pax?.id_client) continue;
      if (unique.has(pax.id_client)) continue;
      const fullName = `${pax.first_name ?? ""} ${pax.last_name ?? ""}`.trim();
      const paxCode = pax.agency_client_id ?? pax.id_client;
      unique.set(pax.id_client, {
        id: pax.id_client,
        label: `${fullName || `Pax ${pax.id_client}`} · N° ${paxCode}`,
      });
    }

    return Array.from(unique.values());
  }, [booking.titular, booking.clients]);

  const lockedPayerOption = useMemo(() => {
    if (!lockClient) return null;
    const raw = Number(defaultClientId);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const normalized = Math.trunc(raw);
    if (bookingPaxOptions.some((opt) => opt.id === normalized)) return null;
    return {
      id: normalized,
      label: `Pax bloqueado · N° ${normalized}`,
    };
  }, [bookingPaxOptions, defaultClientId, lockClient]);

  const payerOptions = useMemo(() => {
    if (!lockedPayerOption) return bookingPaxOptions;
    return [lockedPayerOption, ...bookingPaxOptions];
  }, [bookingPaxOptions, lockedPayerOption]);

  const bookingServiceOptions = useMemo(() => {
    const services = Array.isArray(booking.services) ? booking.services : [];
    return services.map((svc) => {
      const code = svc.agency_service_id ?? svc.id_service;
      const title = svc.description || svc.type || `Servicio ${code}`;
      return { id: svc.id_service, label: `${title} · N° ${code}` };
    });
  }, [booking.services]);

  const normalizedDefaultClientId = useMemo(() => {
    const raw = Number(defaultClientId);
    if (Number.isFinite(raw) && raw > 0) {
      const normalized = Math.trunc(raw);
      if (lockClient || bookingPaxOptions.some((opt) => opt.id === normalized)) {
        return normalized;
      }
    }
    return booking.titular?.id_client ?? null;
  }, [
    defaultClientId,
    bookingPaxOptions,
    booking.titular?.id_client,
    lockClient,
  ]);

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
    if (!isFormVisible) return;
    if (lockClient) {
      setPayerClientId(normalizedDefaultClientId);
      return;
    }
    if (!payerClientId && normalizedDefaultClientId) {
      setPayerClientId(normalizedDefaultClientId);
    }
  }, [isFormVisible, lockClient, payerClientId, normalizedDefaultClientId]);

  useEffect(() => {
    if (!lockClient) return;
    setPayerClientId(normalizedDefaultClientId);
  }, [lockClient, normalizedDefaultClientId]);

  useEffect(() => {
    if (lockClient) return;
    if (payerClientId == null) return;
    const exists = bookingPaxOptions.some((opt) => opt.id === payerClientId);
    if (!exists) {
      setPayerClientId(normalizedDefaultClientId);
    }
  }, [payerClientId, bookingPaxOptions, normalizedDefaultClientId, lockClient]);

  useEffect(() => {
    if (serviceId == null) return;
    const exists = bookingServiceOptions.some((opt) => opt.id === serviceId);
    if (!exists) setServiceId(null);
  }, [serviceId, bookingServiceOptions]);

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
    "w-full rounded-xl border border-slate-300/90 bg-white/95 p-2 px-3 text-slate-900 shadow-sm shadow-sky-100/40 outline-none transition placeholder:font-light focus:border-sky-400 focus:ring-2 focus:ring-sky-200/50 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-900/40";

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
          className="rounded-full border border-sky-200/70 bg-sky-50/45 px-3 py-1 text-[11px] font-medium text-slate-700 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-200 md:text-xs"
        >
          Cuotas: {count}
        </span>,
    );
    pills.push(
        <span
          key="currency"
          className="rounded-full border border-sky-200/70 bg-sky-50/45 px-3 py-1 text-[11px] font-medium text-slate-700 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-200 md:text-xs"
        >
          Moneda: {normalizeCurrencyCode(currency)}
        </span>,
    );
    if (totalPreview) {
      pills.push(
        <span
          key="total"
          className="rounded-full border border-emerald-300/70 bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300 md:text-xs"
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
    setPayerClientId(lockClient ? normalizedDefaultClientId : null);
    setServiceId(null);
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
      toast.error("Seleccioná el pax que paga.");
      return;
    }
    if (!lockClient && !bookingPaxOptions.some((opt) => opt.id === payerClientId)) {
      toast.error("El pax seleccionado no pertenece a la reserva.");
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
        clientId: Number(payerClientId),
        ...(serviceId ? { serviceId: Number(serviceId) } : {}),
        count,
        amount: amountTotal,
        currency: cur,
        dueDates: cleanedDueDates,
        ...(perInstallmentAmounts ? { amounts: perInstallmentAmounts } : {}),
      };

      let endpoint = "/api/client-payments";
      if (groupId) {
        if (!groupPassengerId || groupPassengerId <= 0) {
          toast.error("No se pudo identificar el pasajero de la grupal.");
          setLoading(false);
          return;
        }
        endpoint = `/api/groups/${encodeURIComponent(groupId)}/finance/client-payments`;
        payload.passengerId = Number(groupPassengerId);
        if (groupDepartureId && groupDepartureId > 0) {
          payload.departureId = Number(groupDepartureId);
        }
      } else {
        payload.bookingId = booking.id_booking;
      }
      const res = await authFetch(
        endpoint,
        { method: "POST", body: JSON.stringify(payload), signal: ac.signal },
        token,
      );

      if (!res.ok) {
        let msg = "No se pudo crear el/los pago(s) del pax.";
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

      toast.success("Pagos del pax creados correctamente.");
      onCreated?.();
      resetForm();
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      const msg =
        err instanceof Error ? err.message : "Error creando pagos del pax.";
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
      className="mb-8 overflow-auto rounded-3xl border border-sky-200/80 bg-white/75 text-slate-900 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-100"
    >
      <div
        className={`sticky top-0 z-10 ${isFormVisible ? "rounded-t-3xl border-b" : ""} border-sky-200/70 bg-white/65 px-5 py-4 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/50 md:px-6`}
      >
        <button
          type="button"
          onClick={() => setIsFormVisible((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={isFormVisible}
          aria-controls="client-payment-form-body"
        >
          <div className="flex items-center gap-3.5">
            <div className="grid size-9 place-items-center rounded-full border border-sky-300/70 bg-sky-100/80 text-sky-900 shadow-sm shadow-sky-100/70 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-100">
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
              <p className="text-base font-semibold leading-tight md:text-lg">
                {isFormVisible ? "Plan de pagos" : "Cargar plan de pagos"}
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 md:text-xs">
                Reserva N° {booking.agency_booking_id ?? booking.id_booking}
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
              className="space-y-8 px-5 pb-8 pt-6 md:space-y-9 md:px-6"
            >
              <Section
                title="Pax que paga"
                desc={
                  lockClient
                    ? "El plan queda asociado al pasajero seleccionado en la sección Grupal."
                    : "Solo se pueden seleccionar pasajeros de esta reserva. Opcionalmente podés asociar la cuota a un servicio."
                }
              >
                <Field id="payer_client_id" label="Pax" required>
                  <select
                    id="payer_client_id"
                    className={`${inputBase} cursor-pointer`}
                    value={payerClientId ?? ""}
                    onChange={(e) =>
                      setPayerClientId(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    disabled={lockClient}
                    required
                  >
                    <option value="">
                      {lockClient ? "Pasajero bloqueado" : "Seleccionar pax..."}
                    </option>
                    {payerOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  id="service_id"
                  label="Servicio asociado (opcional)"
                  hint="Si la cuota no corresponde a un servicio puntual, dejalo en General."
                >
                  <select
                    id="service_id"
                    className={`${inputBase} cursor-pointer`}
                    value={serviceId ?? ""}
                    onChange={(e) =>
                      setServiceId(e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">General de la reserva</option>
                    {bookingServiceOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>
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
                  <label className="ml-1 block text-[13px] font-medium text-slate-900 dark:text-slate-100 md:text-sm">
                    Modo de importe
                  </label>
                  <div
                    className="grid grid-cols-1 gap-2 md:grid-cols-3"
                    role="radiogroup"
                    aria-label="Modo de importe"
                  >
                    <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-300/80 bg-white/80 px-3 py-2 text-[13px] shadow-sm shadow-slate-900/10 transition-colors hover:border-sky-200/70 hover:bg-sky-50/45 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-sky-900/40 dark:hover:bg-slate-800/70 md:text-sm">
                      <input
                        type="radio"
                        name="amountMode"
                        className="size-4"
                        checked={amountMode === "total"}
                        onChange={() => setAmountMode("total")}
                      />
                      <span>Total único</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-300/80 bg-white/80 px-3 py-2 text-[13px] shadow-sm shadow-slate-900/10 transition-colors hover:border-sky-200/70 hover:bg-sky-50/45 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-sky-900/40 dark:hover:bg-slate-800/70 md:text-sm">
                      <input
                        type="radio"
                        name="amountMode"
                        className="size-4"
                        checked={amountMode === "per_equal"}
                        onChange={() => setAmountMode("per_equal")}
                      />
                      <span>Por cuota (mismo monto)</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-300/80 bg-white/80 px-3 py-2 text-[13px] shadow-sm shadow-slate-900/10 transition-colors hover:border-sky-200/70 hover:bg-sky-50/45 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-sky-900/40 dark:hover:bg-slate-800/70 md:text-sm">
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
                        <p className="ml-1 mt-1 text-[11px] text-slate-600 dark:text-slate-400 md:text-xs">
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
                        <p className="ml-1 mt-1 text-[11px] text-slate-600 dark:text-slate-400 md:text-xs">
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
                      className="w-full rounded-full border border-sky-300/80 bg-sky-100/80 px-4 py-2 text-[13px] text-sky-900 shadow-sm shadow-sky-100/60 transition-transform hover:scale-95 active:scale-90 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100 md:text-sm"
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
                  <p className="ml-1 text-[11px] text-slate-600 dark:text-slate-400 md:text-xs">
                    Todas las cuotas requieren una fecha de vencimiento.
                  </p>
                </div>
              </Section>

              <div className="sticky bottom-0 z-10 -mx-5 flex justify-end border-t border-sky-200/70 bg-white/70 px-5 py-4 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 md:-mx-6 md:px-6">
                <button
                  type="submit"
                  disabled={loading || !token}
                  aria-busy={loading}
                  className={`rounded-full border px-6 py-2 text-[13px] font-semibold shadow-sm shadow-slate-900/10 transition active:scale-[0.98] md:text-sm ${
                    loading || !token
                      ? "cursor-not-allowed border-slate-300/60 bg-slate-200 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      : "border-sky-300/80 bg-sky-100/80 text-sky-900 shadow-sky-100/60 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100 dark:hover:bg-sky-900/35"
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
