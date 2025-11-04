// src/components/client-payments/ClientPaymentForm.tsx
"use client";
import { motion } from "framer-motion";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
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
    "w-full appearance-none bg-white/50 rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

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
      initial={{ maxHeight: 100, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 1400 : 100,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-3 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible((v) => !v)}
      >
        <p className="text-lg font-medium dark:text-white">
          {isFormVisible ? "Cerrar Formulario" : "Cargar plan de pago"}
        </p>
        <button className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white">
          {isFormVisible ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          )}
        </button>
      </div>

      {isFormVisible && (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Reserva */}
          <div className="text-sm opacity-80">
            <b>Reserva:</b> N° {booking.id_booking}
          </div>

          {/* Cliente que paga */}
          <section className="space-y-2">
            <label className="ml-2 block dark:text-white">
              Cliente que paga
            </label>
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
            <p className="ml-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
              Podés seleccionar cualquier cliente (no se limita a la reserva).
            </p>
          </section>

          {/* Cantidad de pagos */}
          <section>
            <label className="ml-2 block dark:text-white">
              Cantidad de pagos
            </label>
            <input
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
          </section>

          {/* Importes */}
          <section className="space-y-3 rounded-2xl border border-white/10 p-3">
            <p className="ml-2 text-xs font-semibold uppercase tracking-wide opacity-70">
              Importe
            </p>

            {/* Modo */}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="amountMode"
                  checked={amountMode === "total"}
                  onChange={() => setAmountMode("total")}
                />
                <span className="text-sm">Total único</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="amountMode"
                  checked={amountMode === "per_equal"}
                  onChange={() => setAmountMode("per_equal")}
                />
                <span className="text-sm">Por cuota (mismo monto)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="amountMode"
                  checked={amountMode === "per_custom"}
                  onChange={() => setAmountMode("per_custom")}
                />
                <span className="text-sm">
                  Por cuota (montos personalizados)
                </span>
              </label>
            </div>

            {/* Inputs de importe */}
            {amountMode !== "per_custom" ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="ml-2 block dark:text-white">
                    {amountMode === "total" ? "Monto total" : "Monto por cuota"}
                  </label>
                  <input
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
                    <div className="ml-2 mt-1 text-sm opacity-80">
                      {previewAmount}
                    </div>
                  )}
                </div>

                <div>
                  <label className="ml-2 block dark:text-white">Moneda</label>
                  <select
                    className={`${inputBase} cursor-pointer`}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    required
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="ml-2 block dark:text-white">Moneda</label>
                    <select
                      className={`${inputBase} cursor-pointer`}
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      required
                    >
                      <option value="ARS">ARS</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                  {previewAmount && (
                    <div className="ml-2 self-end text-sm opacity-80">
                      {previewAmount}
                    </div>
                  )}
                </div>
                {Array.from({ length: count }).map((_, idx) => (
                  <div key={idx}>
                    <label className="ml-2 block text-sm opacity-70 dark:text-white">
                      Monto cuota N°{idx + 1}
                    </label>
                    <input
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
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Vencimientos */}
          <section className="space-y-3 rounded-2xl border border-white/10 p-3">
            <p className="ml-2 text-xs font-semibold uppercase tracking-wide opacity-70">
              Vencimientos
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="ml-2 block dark:text-white">
                  Fecha de la primera cuota
                </label>
                <input
                  type="date"
                  className={`${inputBase} cursor-pointer`}
                  value={seedDate}
                  onChange={(e) => setSeedDate(e.target.value)}
                />
              </div>
              <div>
                <label className="ml-2 block dark:text-white">
                  Frecuencia (días)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={inputBase}
                  value={frequencyDays}
                  onChange={(e) =>
                    setFrequencyDays(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={autofillDueDates}
                  className="mb-1 w-full rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                >
                  Autorellenar fechas
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {Array.from({ length: count }).map((_, idx) => (
                <div key={idx}>
                  <label className="ml-2 block text-sm opacity-70 dark:text-white">
                    Vencimiento cuota N°{idx + 1}
                  </label>
                  <input
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
                </div>
              ))}
              <p className="ml-2 mt-1 text-xs opacity-70">
                Todas las cuotas requieren una fecha de vencimiento.
              </p>
            </div>
          </section>

          {/* Acción */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !token}
              aria-busy={loading}
              className={`rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white ${
                loading ? "opacity-60" : ""
              }`}
            >
              {loading ? <Spinner /> : "Crear pagos"}
            </button>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}
