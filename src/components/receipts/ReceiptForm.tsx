// src/components/receipts/ReceiptForm.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Booking, Client, Receipt, Service } from "@/types";
import Spinner from "@/components/Spinner";
import { motion } from "framer-motion";
import { authFetch } from "@/utils/authFetch";
import ClientPicker from "@/components/clients/ClientPicker";

/* ========= helpers ========= */
const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const uniqSorted = (arr: string[]) => {
  const seen = new Map<string, string>();
  for (const raw of arr) {
    if (!raw) continue;
    const key = norm(raw);
    if (!seen.has(key)) seen.set(key, String(raw).trim());
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "es"));
};

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ========= tipos ========= */
interface Props {
  booking: Booking;
  onCreated?: (receipt: Receipt) => void;
  token: string | null;
}

type FinanceAccount = { id_account: number; name: string; enabled: boolean };
type FinanceMethod = {
  id_method: number;
  name: string;
  enabled: boolean;
  requires_account?: boolean | null;
};
type FinanceCurrency = { code: string; name: string; enabled: boolean };

type FinanceConfig = {
  accounts: FinanceAccount[];
  paymentMethods: FinanceMethod[];
  currencies: FinanceCurrency[];
};

/* DTOs para parsear /api/finance/config sin any */
type AccountsDTO = Array<{
  id_account?: number;
  name?: string;
  enabled?: boolean;
}>;
type MethodsDTO = Array<{
  id_method?: number;
  name?: string;
  enabled?: boolean;
  requires_account?: boolean | null;
}>;
type CurrenciesDTO = Array<{
  code?: string;
  name?: string;
  enabled?: boolean;
}>;

type FinanceBundleDTO = Partial<{
  accounts: AccountsDTO;
  paymentMethods: MethodsDTO;
  currencies: CurrenciesDTO;
}>;

type ApiError = { error?: string; message?: string };

type ReceiptCreateResponse = { receipt: Receipt };

/* ========= componente ========= */
export default function ReceiptForm({ booking, onCreated, token }: Props) {
  const [concept, setConcept] = useState("");

  // método de pago + cuenta (dinámicos por config)
  const [paymentMethod, setPaymentMethod] = useState("");
  const [account, setAccount] = useState("");

  // texto libre para PDF (compat/legacy)
  const [paymentDescription, setPaymentDescription] = useState("");

  const [amountString, setAmountString] = useState("");
  const [amountCurrency, setAmountCurrency] = useState(""); // ISO (USD/ARS/…)
  const [manualAmount, setManualAmount] = useState("");

  const [loading, setLoading] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(false);

  /* ========= traer config financiera ========= */
  const [finance, setFinance] = useState<FinanceConfig | null>(null);

  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();

    (async () => {
      try {
        const res = await authFetch(
          "/api/finance/config",
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (!res.ok) {
          // no tiramos error, simplemente no hay opciones
          setFinance(null);
          return;
        }

        const j = (await safeJson<FinanceBundleDTO>(res)) ?? {};

        const accounts: FinanceAccount[] = (j.accounts ?? [])
          .filter(
            (a): a is { id_account: number; name: string; enabled?: boolean } =>
              typeof a?.id_account === "number" && typeof a?.name === "string",
          )
          .map((a) => ({
            id_account: a.id_account!,
            name: a.name!,
            enabled: Boolean(a.enabled),
          }));

        const paymentMethods: FinanceMethod[] = (j.paymentMethods ?? [])
          .filter(
            (
              m,
            ): m is {
              id_method: number;
              name: string;
              enabled?: boolean;
              requires_account?: boolean | null;
            } =>
              typeof m?.id_method === "number" && typeof m?.name === "string",
          )
          .map((m) => ({
            id_method: m.id_method!,
            name: m.name!,
            enabled: Boolean(m.enabled),
            // cuidado: null -> false
            requires_account: !!m.requires_account,
          }));

        const currencies: FinanceCurrency[] = (j.currencies ?? [])
          .filter(
            (c): c is { code: string; name: string; enabled?: boolean } =>
              typeof c?.code === "string" && typeof c?.name === "string",
          )
          .map((c) => ({
            code: String(c.code).toUpperCase(),
            name: c.name!,
            enabled: Boolean(c.enabled),
          }));

        setFinance({ accounts, paymentMethods, currencies });
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") {
          setFinance(null);
        }
      }
    })();

    return () => ac.abort();
  }, [token]);

  /* ========= helpers de UI ========= */
  const inputBase =
    "w-full rounded-2xl bg-white/50 border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

  const formatMoney = (n: number, cur = "ARS") =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
    }).format(n);

  /* ========= servicios de la reserva ========= */
  const servicesFromBooking: Service[] = useMemo(
    () => booking.services ?? [],
    [booking],
  );

  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);

  const selectedServices = useMemo(
    () =>
      servicesFromBooking.filter((s) =>
        selectedServiceIds.includes(s.id_service),
      ),
    [servicesFromBooking, selectedServiceIds],
  );

  const allSelectedSameCurrency = useMemo(() => {
    if (selectedServices.length === 0) return true;
    const set = new Set(
      selectedServices.map((s) => (s.currency || "ARS").toUpperCase()),
    );
    return set.size === 1;
  }, [selectedServices]);

  const suggestedCurrency = useMemo(() => {
    if (!allSelectedSameCurrency || selectedServices.length === 0) return null;
    return (selectedServices[0].currency || "ARS").toUpperCase();
  }, [allSelectedSameCurrency, selectedServices]);

  const suggestedAmount = useMemo(
    () =>
      selectedServices.reduce(
        (sum, svc) => sum + (svc.sale_price ?? 0) + (svc.card_interest ?? 0),
        0,
      ),
    [selectedServices],
  );

  const toggleService = (svc: Service) => {
    setSelectedServiceIds((prev) =>
      prev.includes(svc.id_service)
        ? prev.filter((id) => id !== svc.id_service)
        : [...prev, svc.id_service],
    );
  };

  /* ========= clientes (picker múltiple) ========= */
  const [clientsCount, setClientsCount] = useState(1);
  const [clientIds, setClientIds] = useState<(number | null)[]>([null]);

  const handleIncrementClient = () => {
    setClientsCount((c) => c + 1);
    setClientIds((arr) => [...arr, null]);
  };
  const handleDecrementClient = () => {
    if (clientsCount <= 1) return;
    setClientsCount((c) => c - 1);
    setClientIds((arr) => arr.slice(0, -1));
  };

  const setClientAt = (index: number, client: Client | null) => {
    setClientIds((prev) => {
      const next = [...prev];
      next[index] = client ? client.id_client : null;
      return next;
    });
  };

  const excludeForIndex = (idx: number) =>
    clientIds.filter((_, i) => i !== idx).filter(Boolean) as number[];

  /* ========= Conversión (opcional) ========= */
  const [baseAmount, setBaseAmount] = useState<string>("");
  const [baseCurrency, setBaseCurrency] = useState<string>("");
  const [counterAmount, setCounterAmount] = useState<string>("");
  const [counterCurrency, setCounterCurrency] = useState<string>("");

  /* ========= Opciones por Config (sin fallbacks locales) ========= */
  const paymentMethodOptions = useMemo(
    () =>
      uniqSorted(
        finance?.paymentMethods?.filter((m) => m.enabled).map((m) => m.name) ??
          [],
      ),
    [finance?.paymentMethods],
  );

  const requiresAccountMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const m of finance?.paymentMethods || []) {
      if (!m.enabled) continue;
      map.set(norm(m.name), !!m.requires_account);
    }
    return map;
  }, [finance?.paymentMethods]);

  const showAccount = useMemo(() => {
    if (!paymentMethod) return false;
    return !!requiresAccountMap.get(norm(paymentMethod));
  }, [paymentMethod, requiresAccountMap]);

  const accountOptions = useMemo(
    () =>
      uniqSorted(
        finance?.accounts?.filter((a) => a.enabled).map((a) => a.name) ?? [],
      ),
    [finance?.accounts],
  );

  const currencyOptions = useMemo(
    () =>
      uniqSorted(
        finance?.currencies
          ?.filter((c) => c.enabled)
          .map((c) => c.code.toUpperCase()) ?? [],
      ),
    [finance?.currencies],
  );

  const currencyLabelDict = useMemo(() => {
    const dict: Record<string, string> = {};
    for (const c of finance?.currencies || []) {
      if (c.enabled) dict[String(c.code).toUpperCase()] = c.name;
    }
    return dict;
  }, [finance?.currencies]);

  // Sugerir moneda cuando:
  // - hay una sugerida por servicios
  // - aún no se eligió una
  // - y la sugerida está habilitada en config
  useEffect(() => {
    if (
      !amountCurrency &&
      suggestedCurrency &&
      currencyOptions.includes(suggestedCurrency)
    ) {
      setAmountCurrency(suggestedCurrency);
    }
  }, [amountCurrency, suggestedCurrency, currencyOptions]);

  /* ========= submit ========= */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!concept.trim()) return toast.error("Ingresá el concepto");
    if (selectedServiceIds.length === 0) {
      return toast.error("Seleccioná al menos un servicio de la reserva");
    }
    if (!paymentMethod) return toast.error("Seleccioná el método de pago");
    if (showAccount && !account) return toast.error("Seleccioná la cuenta");

    const pickedClientIds = clientIds.filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );

    let finalAmount: number;
    if (manualAmount.trim() !== "") {
      const parsed = parseFloat(manualAmount);
      if (!Number.isFinite(parsed)) {
        return toast.error("El importe debe ser un número válido");
      }
      finalAmount = parsed;
    } else {
      const setCur = new Set(
        selectedServices.map((s) => (s.currency || "ARS").toUpperCase()),
      );
      if (setCur.size > 1) {
        return toast.error(
          "Seleccionaste servicios con monedas distintas. Ingresá el Importe numérico.",
        );
      }
      finalAmount = suggestedAmount;
    }

    const payloadBaseAmount =
      baseAmount.trim() !== "" ? parseFloat(baseAmount) : undefined;
    const payloadCounterAmount =
      counterAmount.trim() !== "" ? parseFloat(counterAmount) : undefined;

    setLoading(true);
    try {
      const res = await authFetch(
        "/api/receipts",
        {
          method: "POST",
          body: JSON.stringify({
            booking,
            concept,
            currency: paymentDescription, // texto libre PDF (legacy)
            payment_method: paymentMethod,
            account: showAccount ? account : undefined,

            amountString,
            amountCurrency,
            serviceIds: selectedServiceIds,
            amount: finalAmount,
            clientIds: pickedClientIds,

            base_amount: payloadBaseAmount,
            base_currency: baseCurrency || undefined,
            counter_amount: payloadCounterAmount,
            counter_currency: counterCurrency || undefined,
          }),
        },
        token,
      );

      if (!res.ok) {
        const err = await safeJson<ApiError>(res);
        throw new Error(err?.error || err?.message || "Error guardando recibo");
      }

      const data = await safeJson<ReceiptCreateResponse>(res);
      if (!data?.receipt) {
        throw new Error("Respuesta inválida del servidor");
      }

      toast.success("Recibo creado exitosamente.");
      onCreated?.(data.receipt);

      // reset
      setConcept("");
      setPaymentMethod("");
      setAccount("");
      setPaymentDescription("");
      setAmountString("");
      setAmountCurrency("");
      setManualAmount("");
      setSelectedServiceIds([]);
      setClientsCount(1);
      setClientIds([null]);
      setBaseAmount("");
      setBaseCurrency("");
      setCounterAmount("");
      setCounterCurrency("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error guardando recibo";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ========= UI ========= */
  return (
    <motion.div
      layout
      initial={{ maxHeight: 100, opacity: 1 }}
      animate={{
        maxHeight: isFormVisible ? 1000 : 100,
        opacity: 1,
        transition: { duration: 0.4, ease: "easeInOut" },
      }}
      className="mb-6 space-y-4 overflow-hidden overflow-y-scroll rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white"
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setIsFormVisible(!isFormVisible)}
        aria-label="Alternar formulario de recibo"
        role="button"
      >
        <p className="text-lg font-medium dark:text-white">
          {isFormVisible ? "Cerrar Formulario" : "Crear Recibo"}
        </p>
        <button
          type="button"
          className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
          aria-label={isFormVisible ? "Cerrar formulario" : "Abrir formulario"}
        >
          {isFormVisible ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="size-6"
              aria-hidden="true"
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
              aria-hidden="true"
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
          exit={{ opacity: 0 }}
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* 1) Servicios */}
          <section className="space-y-2">
            <p className="ml-2 text-xs font-semibold uppercase tracking-wide opacity-70">
              Servicios de la reserva
            </p>
            {servicesFromBooking.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm opacity-80">
                Esta reserva no tiene servicios cargados.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {servicesFromBooking.map((svc) => {
                  const isActive = selectedServiceIds.includes(svc.id_service);
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
                      title={`Servicio N° ${svc.id_service}`}
                      aria-pressed={isActive}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">
                          #{svc.id_service} · {svc.type}
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
                        {formatMoney(
                          (svc.sale_price ?? 0) + (svc.card_interest ?? 0),
                          (svc.currency || "ARS").toUpperCase(),
                        )}
                        <span className="opacity-70">
                          {" "}
                          ({(svc.currency || "ARS").toUpperCase()})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedServices.length > 0 && (
              <div className="ml-2 text-xs opacity-70">
                Seleccionados:{" "}
                {selectedServices.map((s) => `N° ${s.id_service}`).join(", ")}
              </div>
            )}
          </section>

          {/* 2) Clientes */}
          <section className="space-y-3">
            <p className="ml-2 text-xs font-semibold uppercase tracking-wide opacity-70">
              Clientes
            </p>

            <div className="ml-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleDecrementClient}
                className="rounded-full border border-sky-950 p-1 dark:border-white dark:text-white"
                disabled={clientsCount <= 1}
                title="Quitar cliente"
                aria-label="Quitar cliente"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14"
                  />
                </svg>
              </button>
              <span className="rounded-full border border-sky-950 px-3 py-1 dark:border-white dark:text-white">
                {clientsCount}
              </span>
              <button
                type="button"
                onClick={handleIncrementClient}
                className="rounded-full border border-sky-950 p-1 dark:border-white dark:text-white"
                title="Agregar cliente"
                aria-label="Agregar cliente"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              {Array.from({ length: clientsCount }).map((_, idx) => (
                <div key={idx}>
                  <ClientPicker
                    token={token}
                    label={`Cliente ${idx + 1}`}
                    placeholder="Buscar por ID, DNI, Pasaporte, CUIT o nombre..."
                    valueId={clientIds[idx] ?? null}
                    excludeIds={excludeForIndex(idx)}
                    onSelect={(c) => setClientAt(idx, c)}
                    onClear={() => setClientAt(idx, null)}
                  />
                  <p className="ml-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Si el recibo no es para un cliente específico, podés dejarlo
                    vacío.
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* 3) Detalle del recibo */}
          <section className="space-y-3">
            <p className="ml-2 text-xs font-semibold uppercase tracking-wide opacity-70">
              Detalle del recibo
            </p>

            <div>
              <label className="ml-2 block dark:text-white">Concepto</label>
              <input
                type="text"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className={inputBase}
                placeholder="Ej: Pago total del paquete"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="ml-2 block dark:text-white">
                  Importe numérico
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className={inputBase}
                  placeholder="Ej: 1000.50"
                />
                <div className="ml-2 mt-1 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {Number(manualAmount) > 0 && (
                    <p>
                      {formatMoney(
                        Number(manualAmount),
                        (amountCurrency || "ARS").toUpperCase(),
                      )}
                    </p>
                  )}
                  <p>
                    Dejá vacío para calcularlo automáticamente
                    {selectedServices.length > 0 && allSelectedSameCurrency && (
                      <>
                        {" "}
                        (Sugerido:{" "}
                        {formatMoney(
                          suggestedAmount,
                          (suggestedCurrency || "ARS").toUpperCase(),
                        )}
                        )
                      </>
                    )}
                  </p>
                </div>
                {selectedServices.length > 0 && !allSelectedSameCurrency && (
                  <p className="ml-2 mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                    Los servicios seleccionados tienen monedas distintas.
                    Ingresá el Importe numérico.
                  </p>
                )}
              </div>

              <div>
                <label className="ml-2 dark:text-white">Moneda</label>
                <select
                  name="currency"
                  value={amountCurrency}
                  onChange={(e) => setAmountCurrency(e.target.value)}
                  className={`${inputBase} cursor-pointer appearance-none`}
                  disabled={currencyOptions.length === 0}
                  required
                >
                  <option value="" disabled>
                    {currencyOptions.length
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
                {selectedServices.length > 0 && allSelectedSameCurrency && (
                  <p className="ml-2 mt-1 text-xs opacity-70">
                    Sugerido por servicios: {suggestedCurrency}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="ml-2 block dark:text-white">
                Recibimos el equivalente a
              </label>
              <input
                type="text"
                value={amountString}
                onChange={(e) => setAmountString(e.target.value)}
                className={inputBase}
                placeholder="Ej: UN MILLON CIEN MIL"
                required
              />
            </div>
          </section>

          {/* 4) Pago */}
          <section className="space-y-3">
            <p className="ml-2 text-xs font-semibold uppercase tracking-wide opacity-70">
              Pago
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="ml-2 block dark:text-white">
                  Método de pago
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className={`${inputBase} cursor-pointer appearance-none`}
                  required
                  disabled={paymentMethodOptions.length === 0}
                >
                  <option value="" disabled>
                    {paymentMethodOptions.length
                      ? "Seleccionar método"
                      : "Sin métodos habilitados"}
                  </option>
                  {paymentMethodOptions.map((m) => (
                    <option key={norm(m)} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {showAccount && (
                <div>
                  <label className="ml-2 block dark:text-white">Cuenta</label>
                  <select
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    className={`${inputBase} cursor-pointer appearance-none`}
                    required={showAccount}
                    disabled={accountOptions.length === 0}
                  >
                    <option value="" disabled>
                      {accountOptions.length
                        ? "Seleccionar cuenta"
                        : "Sin cuentas habilitadas"}
                    </option>
                    {accountOptions.map((acc) => (
                      <option key={norm(acc)} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="ml-2 block dark:text-white">
                Método de pago (detalle para el PDF)
              </label>
              <input
                type="text"
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
                className={inputBase}
                placeholder="Ej: Tarjeta de crédito — No adeuda saldo"
                required
              />
            </div>
          </section>

          {/* 5) Conversión (opcional) */}
          <section className="space-y-2">
            <div className="ml-2 text-xs font-semibold uppercase tracking-wide opacity-70">
              Conversión (opcional)
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  className={inputBase}
                  placeholder="Base (ej: 500)"
                />
                <select
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                  className={`${inputBase} cursor-pointer appearance-none`}
                  disabled={currencyOptions.length === 0}
                >
                  <option value="" disabled>
                    {currencyOptions.length ? "Moneda base" : "Sin monedas"}
                  </option>
                  {currencyOptions.map((code) => (
                    <option key={`base-${code}`} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  className={inputBase}
                  placeholder="Contravalor (ej: 700000)"
                />
                <select
                  value={counterCurrency}
                  onChange={(e) => setCounterCurrency(e.target.value)}
                  className={`${inputBase} cursor-pointer appearance-none`}
                  disabled={currencyOptions.length === 0}
                >
                  <option value="" disabled>
                    {currencyOptions.length ? "Moneda contra" : "Sin monedas"}
                  </option>
                  {currencyOptions.map((code) => (
                    <option key={`counter-${code}`} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
              <p className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                {formatMoney(
                  Number(baseAmount || 0),
                  (baseCurrency || "ARS").toUpperCase(),
                )}
              </p>
              <p className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                {formatMoney(
                  Number(counterAmount || 0),
                  (counterCurrency || "ARS").toUpperCase(),
                )}
              </p>
            </div>
          </section>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
              aria-busy={loading}
            >
              {loading ? <Spinner /> : "Crear Recibo"}
            </button>
          </div>
        </motion.form>
      )}
    </motion.div>
  );
}
