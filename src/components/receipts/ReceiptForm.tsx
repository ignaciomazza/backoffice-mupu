// src/components/receipts/ReceiptForm.tsx
"use client";

import React, { useEffect, useMemo, useState, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Spinner from "@/components/Spinner";
import { loadFinancePicks } from "@/utils/loadFinancePicks";
import { authFetch } from "@/utils/authFetch";
import ClientPicker from "@/components/clients/ClientPicker";
import type { Client } from "@/types";
import { toast } from "react-toastify";

/* =========================
 * Tipos mínimos
 * ========================= */
export type BookingOption = {
  id_booking: number;
  label: string; // ej: "#1024 • Juan Pérez"
  subtitle?: string; // ej: "Europa 2025"
};

export type ServiceLite = {
  id_service: number;
  description?: string;
  currency: string; // "ARS" | "USD" | ...
  sale_price?: number; // para sugerir importe
  card_interest?: number; // para sugerir importe
  // opcionales de UI (si tu API los tuviera)
  type?: string;
  destination?: string;
};

type FinanceAccount = {
  id_account: number;
  name: string;
  display_name?: string;
  enabled?: boolean;
};

type FinancePaymentMethod = {
  id_method: number;
  name: string;
  requires_account?: boolean;
  enabled?: boolean;
};

type FinanceCurrency = {
  code: string;
  name?: string;
  enabled?: boolean;
};

type FinancePicks = {
  accounts: FinanceAccount[];
  paymentMethods: FinancePaymentMethod[];
  currencies: FinanceCurrency[];
};

type CurrencyCode = string;

/* ========= Payload de creación (API) ========= */
export type ReceiptPayload = {
  // Si es con reserva:
  booking?: { id_booking: number };
  serviceIds?: number[];

  // Datos obligatorios:
  concept: string;
  amount: number;
  amountString: string; // “UN MILLÓN…”
  amountCurrency: string; // ISO del importe numérico (ARS, USD, ...)

  // Clientes (opcional)
  clientIds?: number[];

  // Método/cuenta como TEXTO (no IDs)
  payment_method?: string;
  account?: string;

  // Texto libre que se imprime en el PDF (nota de cobro, detalle)
  currency?: string;

  // Conversión opcional
  base_amount?: number;
  base_currency?: string;
  counter_amount?: number;
  counter_currency?: string;
};

type Mode = "agency" | "booking";

/* ========= Adjuntar recibo existente ========= */
export type AttachableReceiptOption = {
  id_receipt: number;
  label: string; // "#000123 • U$D 500 • 12/10/2025"
  subtitle?: string; // "Sin reserva" | "Asociado a #1024"
  alreadyLinked?: boolean;
};

/* =========================
 * Props
 * ========================= */
export interface ReceiptFormProps {
  token: string | null;

  // Ahora opcionales (controlado/NO controlado)
  editingReceiptId?: number | null;
  isFormVisible?: boolean;
  setIsFormVisible?: React.Dispatch<React.SetStateAction<boolean>>;

  // Contexto (forzado desde una reserva)
  bookingId?: number;
  allowAgency?: boolean; // default true

  // Data loaders
  searchBookings?: (q: string) => Promise<BookingOption[]>;
  loadServicesForBooking?: (bookingId: number) => Promise<ServiceLite[]>;

  // Initial values
  initialServiceIds?: number[];
  initialConcept?: string;
  initialAmount?: number;
  initialCurrency?: CurrencyCode;
  initialPaymentMethodId?: number | null;
  initialFinanceAccountId?: number | null;
  initialClientIds?: number[];

  // Submit (CREAR)
  onSubmit: (payload: ReceiptPayload) => Promise<void> | void;

  // Opcional
  onCancel?: () => void;

  /* ==== NUEVO: Adjuntar existente (solo ServicesContainer) ==== */
  /** Habilita el modo "asociar recibo existente" (solo para ServicesContainer). Default: false */
  enableAttachAction?: boolean;

  /** Buscador de recibos existentes (si no pasás, usa fallback /api/receipts?q=) */
  searchReceipts?: (q: string) => Promise<AttachableReceiptOption[]>;

  /** Hook de attach si querés manejarlo arriba. Si no lo pasás, usa /api/receipts/attach o PATCH /api/receipts/:id */
  onAttachExisting?: (args: {
    id_receipt: number;
    bookingId: number;
    serviceIds: number[];
  }) => Promise<void> | void;
}

/* =========================
 * UI primitives
 * ========================= */
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

/* Pills e inputs (mismo lenguaje visual) */
const pillBase = "rounded-full px-3 py-1 text-xs font-medium transition-colors";
const pillNeutral = "bg-white/30 dark:bg-white/10";
const pillOk = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";

const inputBase =
  "w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10 dark:text-white";

/* =========================
 * Helpers de parseo seguro
 * ========================= */
function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function toNumberSafe(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/* =========================
 * Componente principal
 * ========================= */
export default function ReceiptForm({
  token,
  editingReceiptId = null,
  isFormVisible,
  setIsFormVisible,
  bookingId,
  allowAgency = true,
  searchBookings,
  loadServicesForBooking,
  initialServiceIds = [],
  initialConcept = "",
  initialAmount,
  initialCurrency,
  initialPaymentMethodId = null,
  initialFinanceAccountId = null,
  initialClientIds = [],
  onSubmit,
  onCancel,

  // nuevo (attach)
  enableAttachAction = false,
  searchReceipts,
  onAttachExisting,
}: ReceiptFormProps) {
  /* ------ Visibilidad: controlado o no controlado ------ */
  const [internalVisible, setInternalVisible] = useState<boolean>(false); // ⬅️ antes true
  const visible = isFormVisible ?? internalVisible;
  const setVisible = (v: boolean) => {
    if (setIsFormVisible) setIsFormVisible(v);
    else setInternalVisible(v);
  };
  const toggleVisible = () => setVisible(!visible);

  /* ------ Acción: crear o adjuntar ------ */
  const [action, setAction] = useState<"create" | "attach">("create");
  const attachEnabled = !!enableAttachAction;

  /* ------ Picks financieros ------ */
  const [picks, setPicks] = useState<FinancePicks | null>(null);
  const [loadingPicks, setLoadingPicks] = useState(false);

  useEffect(() => {
    if (!token) {
      setPicks({ accounts: [], paymentMethods: [], currencies: [] });
      return;
    }
    let alive = true;
    (async () => {
      try {
        setLoadingPicks(true);
        const raw = await loadFinancePicks(token);
        if (!alive) return;
        setPicks({
          accounts: raw?.accounts ?? [],
          paymentMethods: raw?.paymentMethods ?? [],
          currencies: raw?.currencies ?? [],
        });
      } finally {
        if (alive) setLoadingPicks(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  // Memo para arrays derivados de picks (evita deps inestables)
  const paymentMethods = useMemo(
    () => (picks?.paymentMethods ?? []) as FinancePaymentMethod[],
    [picks],
  );
  const accounts = useMemo(
    () => (picks?.accounts ?? []) as FinanceAccount[],
    [picks],
  );
  const currencies = useMemo(
    () => (picks?.currencies ?? []) as FinanceCurrency[],
    [picks],
  );

  /* ------ Modo (agency / booking) ------ */
  const forcedBookingMode = !!bookingId;
  const [mode, setMode] = useState<Mode>(
    forcedBookingMode ? "booking" : "agency",
  );
  useEffect(() => {
    if (forcedBookingMode) setMode("booking");
  }, [forcedBookingMode]);

  // Si el usuario pasa a "attach", siempre trabajamos con reserva
  const canToggleAgency =
    !forcedBookingMode && allowAgency && action !== "attach";

  /* ------ Reserva (buscador) ------ */
  const [bookingQuery, setBookingQuery] = useState("");
  const [bookingOptions, setBookingOptions] = useState<BookingOption[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    bookingId ?? null,
  );
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Fallback interno si no pasás searchBookings
  const effectiveSearchBookings = useMemo<
    ((q: string) => Promise<BookingOption[]>) | undefined
  >(() => {
    if (searchBookings) return searchBookings;
    if (!token) return undefined;
    return async (q: string) => {
      try {
        const res = await authFetch(
          `/api/bookings/search?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
          token || undefined,
        );
        if (!res.ok) return [];
        const json = await res.json();
        const items: unknown[] =
          (Array.isArray(json) && json) ||
          (isObj(json) && Array.isArray(json.items) && json.items) ||
          [];
        return items
          .map((b): BookingOption | null => {
            if (!isObj(b)) return null;
            const rawId = (b.id_booking ?? b.id) as unknown;
            const idNum = toNumberSafe(rawId);
            if (!idNum || idNum <= 0) return null;

            const titularObj = (b.titular ?? null) as unknown;
            let titular = "";
            if (isObj(titularObj)) {
              const first = (titularObj.first_name ?? "") as unknown;
              const last = (titularObj.last_name ?? "") as unknown;
              titular = `${String(first ?? "")} ${String(last ?? "")}`.trim();
            } else {
              const tname = (b.titular_name ?? "") as unknown;
              titular = typeof tname === "string" ? tname : "";
            }

            const label = `#${idNum}${titular ? ` • ${titular}` : ""}`;
            const subtitleRaw = (b.details ?? b.title ?? "") as unknown;
            const subtitle =
              typeof subtitleRaw === "string" ? subtitleRaw : undefined;

            return { id_booking: idNum, label: label.trim(), subtitle };
          })
          .filter((x): x is BookingOption => x !== null);
      } catch {
        return [];
      }
    };
  }, [searchBookings, token]);

  useEffect(() => {
    if (action === "attach") setMode("booking"); // attach requiere reserva
  }, [action]);

  useEffect(() => {
    if (!effectiveSearchBookings) return;
    if (forcedBookingMode) return;
    if (mode !== "booking") return;

    const raw = bookingQuery.trim().replace(/^#/, ""); // permitir "#376"
    if (raw.length < 1) {
      setBookingOptions([]);
      return;
    }

    let alive = true;
    setLoadingBookings(true);

    const t = setTimeout(() => {
      effectiveSearchBookings(raw)
        .then((res) => {
          if (alive) setBookingOptions(res || []);
        })
        .finally(() => {
          if (alive) setLoadingBookings(false);
        });
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [mode, bookingQuery, forcedBookingMode, effectiveSearchBookings]);

  /* ------ Servicios por reserva ------ */
  const [services, setServices] = useState<ServiceLite[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  useEffect(() => {
    if (!loadServicesForBooking) return;
    const bId = selectedBookingId ?? null;
    if (!bId) {
      setServices([]);
      return;
    }
    let alive = true;
    setLoadingServices(true);
    loadServicesForBooking(bId)
      .then((res) => {
        if (alive) setServices(res || []);
      })
      .finally(() => {
        if (alive) setLoadingServices(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedBookingId, loadServicesForBooking]);

  const [selectedServiceIds, setSelectedServiceIds] =
    useState<number[]>(initialServiceIds);
  const selectedServices = useMemo(
    () => services.filter((s) => selectedServiceIds.includes(s.id_service)),
    [services, selectedServiceIds],
  );

  const lockedCurrency: string | null = useMemo(() => {
    if (selectedServices.length === 0) return null;
    return selectedServices[0].currency;
  }, [selectedServices]);

  // Si por error quedaran servicios con moneda distinta, corregimos
  useEffect(() => {
    if (selectedServices.length <= 1) return;
    const first = selectedServices[0].currency;
    const allSame = selectedServices.every((s) => s.currency === first);
    if (!allSame) {
      const onlyFirst = selectedServices
        .filter((s) => s.currency === first)
        .map((s) => s.id_service);
      setSelectedServiceIds(onlyFirst);
    }
  }, [selectedServices]);

  const toggleService = (svc: ServiceLite) => {
    if (lockedCurrency && svc.currency !== lockedCurrency) return; // bloqueado
    setSelectedServiceIds((prev) =>
      prev.includes(svc.id_service)
        ? prev.filter((id) => id !== svc.id_service)
        : [...prev, svc.id_service],
    );
  };

  /* ------ Importe / moneda (numérico + sugerido) ------ */
  const [concept, setConcept] = useState(initialConcept);
  const [amount, setAmount] = useState<string>(
    initialAmount != null ? String(initialAmount) : "",
  );
  const [freeCurrency, setFreeCurrency] = useState<CurrencyCode>(
    initialCurrency || "ARS",
  );

  useEffect(() => {
    if (!lockedCurrency && !initialCurrency && currencies.length) {
      const firstEnabled = currencies.find((c) => c.enabled)?.code || "ARS";
      setFreeCurrency(firstEnabled);
    }
  }, [currencies, lockedCurrency, initialCurrency]);

  const effectiveCurrency: CurrencyCode = lockedCurrency || freeCurrency;

  const suggestedAmount = useMemo(() => {
    if (selectedServices.length === 0) return null;
    const total = selectedServices.reduce(
      (acc, s) => acc + (s.sale_price ?? 0) + (s.card_interest ?? 0),
      0,
    );
    return total > 0 ? total : null;
  }, [selectedServices]);

  const useSuggested = () => {
    if (suggestedAmount != null) setAmount(String(suggestedAmount));
  };

  /* ------ Método de pago / Cuenta + detalle PDF ------ */
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(
    initialPaymentMethodId,
  );
  const [financeAccountId, setFinanceAccountId] = useState<number | null>(
    initialFinanceAccountId,
  );
  const [paymentDescription, setPaymentDescription] = useState<string>("");

  const chosenMethod = paymentMethods.find(
    (m) => m.id_method === paymentMethodId,
  );
  const requiresAccount = !!chosenMethod?.requires_account;

  useEffect(() => {
    if (!requiresAccount) setFinanceAccountId(null);
  }, [requiresAccount]);

  /* ------ Clientes (picker múltiple) ------ */
  const [clientsCount, setClientsCount] = useState(
    Math.max(1, initialClientIds?.length || 1),
  );
  const [clientIds, setClientIds] = useState<(number | null)[]>(
    clientsCount === (initialClientIds?.length || 0)
      ? initialClientIds!
      : Array.from({ length: Math.max(1, initialClientIds?.length || 1) }).map(
          (_, i) => initialClientIds?.[i] ?? null,
        ),
  );

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

  /* ------ Importe en palabras (para PDF) ------ */
  const [amountWords, setAmountWords] = useState<string>(""); // texto en palabras
  const [amountWordsISO, setAmountWordsISO] = useState<string>(""); // ISO del texto

  // Sugerimos ISO del texto con la moneda efectiva si no elegiste una
  useEffect(() => {
    if (!amountWordsISO && effectiveCurrency)
      setAmountWordsISO(effectiveCurrency);
  }, [amountWordsISO, effectiveCurrency]);

  /* ------ Conversión (opcional) ------ */
  const [baseAmount, setBaseAmount] = useState<string>("");
  const [baseCurrency, setBaseCurrency] = useState<string>("");
  const [counterAmount, setCounterAmount] = useState<string>("");
  const [counterCurrency, setCounterCurrency] = useState<string>("");

  /* ------ Adjuntar existente (UI/estado) ------ */
  const [receiptQuery, setReceiptQuery] = useState("");
  const [receiptOptions, setReceiptOptions] = useState<
    AttachableReceiptOption[]
  >([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(
    null,
  );
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const effectiveSearchReceipts = useMemo<
    ((q: string) => Promise<AttachableReceiptOption[]>) | undefined
  >(() => {
    if (searchReceipts) return searchReceipts;
    if (!token) return undefined;
    return async (q: string) => {
      try {
        const url = `/api/receipts?q=${encodeURIComponent(q)}&take=10`;
        const res = await authFetch(
          url,
          { cache: "no-store" },
          token || undefined,
        );
        if (!res.ok) return [];
        const json = await res.json();
        const items: unknown[] =
          (Array.isArray(json) && json) ||
          (isObj(json) && Array.isArray(json.items) && json.items) ||
          [];
        return items
          .map((r): AttachableReceiptOption | null => {
            if (!isObj(r)) return null;
            const id = toNumberSafe(r.id_receipt);
            if (!id || id <= 0) return null;
            const numberStr =
              typeof r.receipt_number === "string"
                ? r.receipt_number
                : String(r.receipt_number ?? id);
            const cur =
              typeof r.amount_currency === "string"
                ? r.amount_currency.toUpperCase()
                : "ARS";
            const amt = toNumberSafe(r.amount) ?? 0;
            const dStr =
              typeof r.issue_date === "string" && r.issue_date
                ? new Date(r.issue_date).toLocaleDateString("es-AR")
                : "—";
            const label = `#${numberStr} • ${cur} ${amt.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • ${dStr}`;

            // detectar si está ya asociado
            let already = false;
            if (isObj(r.booking)) {
              const bid = toNumberSafe(
                (r.booking as Record<string, unknown>).id_booking,
              );
              already = !!bid && bid > 0;
            }
            const subtitle = already ? "Asociado a reserva" : "Sin reserva";
            return { id_receipt: id, label, subtitle, alreadyLinked: already };
          })
          .filter((x): x is AttachableReceiptOption => x !== null);
      } catch {
        return [];
      }
    };
  }, [searchReceipts, token]);

  useEffect(() => {
    if (!attachEnabled || action !== "attach") return;
    const q = receiptQuery.trim().replace(/^#/, "");
    if (!q) {
      setReceiptOptions([]);
      return;
    }
    if (!effectiveSearchReceipts) return;
    let alive = true;
    setLoadingReceipts(true);
    const t = setTimeout(() => {
      effectiveSearchReceipts(q)
        .then((opts) => alive && setReceiptOptions(opts || []))
        .finally(() => alive && setLoadingReceipts(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [attachEnabled, action, receiptQuery, effectiveSearchReceipts]);

  /* ------ Validación simple ------ */
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateCreate = (): boolean => {
    const e: Record<string, string> = {};

    if (mode === "booking") {
      if (!selectedBookingId) e.booking = "Elegí una reserva.";
      if (selectedServiceIds.length === 0)
        e.services = "Seleccioná al menos un servicio.";
      const svcs = services.filter((s) =>
        selectedServiceIds.includes(s.id_service),
      );
      if (svcs.length) {
        const m = svcs[0].currency;
        if (!svcs.every((s) => s.currency === m)) {
          e.services = "Todos los servicios deben ser de la misma moneda.";
        }
      }
    }

    const parsedAmount = Number(amount);
    if (
      (!amount || isNaN(parsedAmount) || parsedAmount <= 0) &&
      suggestedAmount == null
    ) {
      e.amount =
        "Importe inválido. Ingresá un número o seleccioná servicios con precio.";
    }
    if (!effectiveCurrency) e.currency = "Elegí una moneda.";

    if (requiresAccount && !financeAccountId) e.account = "Elegí una cuenta.";

    if (!amountWords.trim()) e.amountWords = "Ingresá el importe en palabras.";
    if (!amountWordsISO) e.amountWordsISO = "Elegí la moneda del texto.";

    if (!paymentDescription.trim())
      e.paymentDescription =
        "Agregá el detalle del método de pago (para el PDF).";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateAttach = (): boolean => {
    const e: Record<string, string> = {};
    if (!selectedReceiptId) e.receipt = "Elegí un recibo.";
    if (!selectedBookingId) e.booking = "Elegí una reserva.";
    if (selectedServiceIds.length === 0)
      e.services = "Seleccioná al menos un servicio.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ------ Submit (CREAR o ADJUNTAR) ------ */
  const [submitting, setSubmitting] = useState(false);

  const attachExisting = async () => {
    if (!token || !selectedReceiptId || !selectedBookingId) return;
    if (onAttachExisting) {
      await onAttachExisting({
        id_receipt: selectedReceiptId,
        bookingId: selectedBookingId,
        serviceIds: selectedServiceIds,
      });
      return;
    }
    const res = await authFetch(
      `/api/receipts/${selectedReceiptId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          booking: { id_booking: selectedBookingId },
          serviceIds: selectedServiceIds,
          // clientIds
        }),
      },
      token,
    );
    if (!res.ok) throw new Error("No se pudo asociar el recibo.");
  };

  const onLocalSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // === ASOCIAR EXISTENTE ===
    if (action === "attach") {
      if (!validateAttach()) return;
      setSubmitting(true);
      try {
        await attachExisting();
        toast.success("Recibo asociado correctamente."); // ⬅️ feedback que faltaba
        setVisible(false); // ⬅️ cerrar al asociar
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "No se pudo asociar el recibo.";
        toast.error(msg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // === CREAR NUEVO ===
    if (!validateCreate()) return;

    // Si no hay amount ingresado, usamos el sugerido
    const finalAmount =
      amount && !isNaN(Number(amount)) && Number(amount) > 0
        ? Number(amount)
        : (suggestedAmount as number);

    // Resolver nombres para API (texto)
    const paymentMethodName =
      paymentMethodId != null
        ? paymentMethods.find((m) => m.id_method === paymentMethodId)?.name
        : undefined;

    const accountName =
      requiresAccount && financeAccountId != null
        ? ((accounts.find((a) => a.id_account === financeAccountId)
            ?.display_name ||
            accounts.find((a) => a.id_account === financeAccountId)?.name) ??
          undefined)
        : undefined;

    // Body para API
    const apiBody: ReceiptPayload = {
      ...(mode === "booking" && selectedBookingId
        ? {
            booking: { id_booking: selectedBookingId },
            serviceIds: selectedServiceIds,
          }
        : {}),

      concept: (concept ?? "").trim(),
      amount: Number(finalAmount),
      amountString: amountWords.trim(),
      amountCurrency: effectiveCurrency,

      clientIds: clientIds.filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v),
      ),

      payment_method: paymentMethodName,
      account: accountName,

      currency: paymentDescription?.trim() || undefined,

      base_amount:
        baseAmount.trim() !== "" && !isNaN(Number(baseAmount))
          ? Number(baseAmount)
          : undefined,
      base_currency: baseCurrency || undefined,
      counter_amount:
        counterAmount.trim() !== "" && !isNaN(Number(counterAmount))
          ? Number(counterAmount)
          : undefined,
      counter_currency: counterCurrency || undefined,
    };

    setSubmitting(true);
    try {
      await Promise.resolve(onSubmit(apiBody));
      // El toast de "creado" ya lo muestran los padres (ServicesContainer / ReceiptsPage)
      setVisible(false); // ⬅️ cerrar al crear
    } finally {
      setSubmitting(false);
    }
  };

  /* ------ Helpers UI ------ */
  const formatNum = (n: number, cur = "ARS") =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const clearBookingContext = () => {
    setSelectedBookingId(null);
    setSelectedServiceIds([]);
  };

  /* =========================
   * Render
   * ========================= */
  const showHeaderPills = () => {
    const pills: React.ReactNode[] = [];

    pills.push(
      <span
        key="action"
        className={`${pillBase} ${action === "attach" ? pillOk : pillNeutral}`}
      >
        {action === "attach" ? "Asociar existente" : "Crear nuevo"}
      </span>,
    );

    pills.push(
      <span
        key="mode"
        className={`${pillBase} ${mode === "booking" ? pillOk : pillNeutral}`}
      >
        {mode === "booking" ? "Con reserva" : "Agencia"}
      </span>,
    );

    if (mode === "booking" && selectedBookingId) {
      pills.push(
        <span key="bk" className={`${pillBase} ${pillNeutral}`}>
          Reserva #{selectedBookingId}
        </span>,
      );
    }

    if (selectedServiceIds.length > 0) {
      pills.push(
        <span
          key="svc"
          className={`${pillBase} ${pillOk}`}
          title="Servicios seleccionados"
        >
          Svcs: {selectedServiceIds.length}
        </span>,
      );
    }

    if (effectiveCurrency) {
      pills.push(
        <span
          key="cur"
          className={`${pillBase} ${lockedCurrency ? pillOk : pillNeutral}`}
          title={
            lockedCurrency ? "Moneda bloqueada por servicios" : "Moneda libre"
          }
        >
          {effectiveCurrency}
          {lockedCurrency ? " (lock)" : ""}
        </span>,
      );
    }

    return pills;
  };

  return (
    <motion.div
      layout
      initial={{ maxHeight: 96, opacity: 1 }}
      animate={{
        maxHeight: visible ? 1600 : 96,
        opacity: 1,
        transition: { duration: 0.35, ease: "easeInOut" },
      }}
      id="receipt-form"
      className="mb-6 overflow-auto rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md shadow-sky-950/10 dark:text-white"
    >
      {/* HEADER */}
      <div
        className={`sticky top-0 z-10 ${visible ? "rounded-t-3xl border-b" : ""} border-white/10 px-4 py-3 backdrop-blur-sm`}
      >
        <button
          type="button"
          onClick={toggleVisible}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={visible}
          aria-controls="receipt-form-body"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-sky-100 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white">
              {visible ? (
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
                {editingReceiptId
                  ? "Editar Recibo"
                  : action === "attach"
                    ? "Asociar Recibo Existente"
                    : "Agregar Recibo"}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {showHeaderPills()}
          </div>
        </button>
      </div>

      {/* BODY */}
      <AnimatePresence initial={false}>
        {visible && (
          <motion.div
            key="body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative"
          >
            <motion.form
              id="receipt-form-body"
              onSubmit={onLocalSubmit}
              className="space-y-5 px-4 pb-6 pt-4 md:px-6"
            >
              {/* ACCIÓN (crear/adjuntar) SOLO si lo habilitás */}
              {attachEnabled && (
                <Section
                  title="Modo"
                  desc="Podés crear un recibo nuevo o asociar uno existente a una reserva/servicios."
                >
                  <div className="md:col-span-2">
                    <div className="inline-flex rounded-2xl border border-white/10 p-1">
                      <button
                        type="button"
                        onClick={() => setAction("create")}
                        className={`rounded-xl px-3 py-1 text-sm ${action === "create" ? "bg-white/20" : ""}`}
                      >
                        Crear nuevo
                      </button>
                      <button
                        type="button"
                        onClick={() => setAction("attach")}
                        className={`rounded-xl px-3 py-1 text-sm ${action === "attach" ? "bg-white/20" : ""}`}
                      >
                        Asociar existente
                      </button>
                    </div>
                  </div>
                </Section>
              )}

              {/* CONTEXTO */}
              <Section
                title="Contexto"
                desc={
                  action === "attach"
                    ? "Elegí la reserva y los servicios a los que querés asociar el recibo."
                    : "Podés asociarlo a una reserva y elegir servicios, o crearlo como recibo de agencia."
                }
              >
                {/* Toggle modo (si no viene forzado y si la acción es crear) */}
                {canToggleAgency && (
                  <div className="md:col-span-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-white/30 bg-white/30 text-sky-600 shadow-sm shadow-sky-950/10 dark:border-white/20 dark:bg-white/10"
                        checked={mode === "booking"}
                        onChange={(e) => {
                          const next = e.target.checked ? "booking" : "agency";
                          setMode(next);
                          if (next === "agency") clearBookingContext();
                        }}
                      />
                      Asociar a una reserva ahora
                    </label>
                  </div>
                )}

                {/* Booking picker */}
                {mode === "booking" && (
                  <>
                    {forcedBookingMode ? (
                      <div className="md:col-span-2">
                        <div className="rounded-xl border border-white/10 bg-white/10 p-3 text-sm">
                          ID de reserva:{" "}
                          <span className="font-semibold">#{bookingId}</span>{" "}
                          <span className="ml-2 rounded-full bg-white/30 px-2 py-0.5 text-xs">
                            bloqueado
                          </span>
                        </div>
                        <p className="ml-1 mt-1 text-xs opacity-70">
                          Seleccioná los servicios debajo.
                        </p>
                      </div>
                    ) : (
                      <>
                        <Field
                          id="booking_search"
                          label="Buscar reserva"
                          hint="Por número o titular…"
                        >
                          <input
                            id="booking_search"
                            type="text"
                            name="booking_search"
                            value={bookingQuery}
                            onChange={(e) => setBookingQuery(e.target.value)}
                            placeholder="Escribí al menos 2 caracteres"
                            className={inputBase}
                            autoComplete="off"
                          />
                        </Field>

                        <div className="md:col-span-2">
                          {loadingBookings ? (
                            <div className="py-2">
                              <Spinner />
                            </div>
                          ) : bookingOptions.length > 0 ? (
                            <div className="max-h-56 overflow-auto rounded-2xl border border-white/10">
                              {bookingOptions.map((opt) => {
                                const active =
                                  selectedBookingId === opt.id_booking;
                                return (
                                  <button
                                    type="button"
                                    key={opt.id_booking}
                                    className={`w-full px-3 py-2 text-left transition hover:bg-white/5 ${active ? "bg-white/10" : ""}`}
                                    onClick={() =>
                                      setSelectedBookingId(opt.id_booking)
                                    }
                                  >
                                    <div className="text-sm font-medium">
                                      {opt.label}
                                    </div>
                                    {opt.subtitle && (
                                      <div className="text-xs text-sky-950/70 dark:text-white/70">
                                        {opt.subtitle}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : bookingQuery && bookingQuery.length >= 2 ? (
                            <p className="text-sm text-sky-950/70 dark:text-white/70">
                              Sin resultados.
                            </p>
                          ) : null}
                          {errors.booking && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                              {errors.booking}
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {/* Services picker */}
                    {selectedBookingId && (
                      <div className="md:col-span-2">
                        <label className="mb-1 ml-1 block text-sm font-medium text-sky-950 dark:text-white">
                          Servicios de la reserva
                        </label>

                        {loadingServices ? (
                          <div className="py-2">
                            <Spinner />
                          </div>
                        ) : services.length === 0 ? (
                          <p className="text-sm text-sky-950/70 dark:text-white/70">
                            No hay servicios para esta reserva.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {services.map((svc) => {
                              const checked = selectedServiceIds.includes(
                                svc.id_service,
                              );
                              const disabled =
                                !!lockedCurrency &&
                                svc.currency !== lockedCurrency &&
                                !checked;
                              return (
                                <label
                                  key={svc.id_service}
                                  className={`flex items-start gap-3 rounded-2xl border px-3 py-2 ${
                                    checked
                                      ? "border-white/20 bg-white/10"
                                      : "border-white/10"
                                  } ${disabled ? "opacity-50" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-1 size-4"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => toggleService(svc)}
                                  />
                                  <div className="flex-1">
                                    <div className="text-sm font-medium">
                                      #{svc.id_service}{" "}
                                      {svc.type
                                        ? `· ${svc.type}`
                                        : svc.description || "Servicio"}
                                      {svc.destination
                                        ? ` · ${svc.destination}`
                                        : ""}
                                    </div>
                                    <div className="text-xs text-sky-950/70 dark:text-white/70">
                                      Moneda: <b>{svc.currency}</b>
                                      {typeof svc.sale_price === "number" && (
                                        <>
                                          {" "}
                                          • Venta:{" "}
                                          {formatNum(
                                            (svc.sale_price ?? 0) +
                                              (svc.card_interest ?? 0),
                                            (
                                              svc.currency || "ARS"
                                            ).toUpperCase(),
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {/* Pill de moneda */}
                        <div className="mt-2">
                          <span
                            className={`${pillBase} ${lockedCurrency ? pillOk : pillNeutral}`}
                          >
                            Moneda{" "}
                            {lockedCurrency
                              ? `${lockedCurrency} (lock)`
                              : "libre"}
                          </span>
                        </div>

                        {errors.services && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                            {errors.services}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </Section>

              {/* ====== BLOQUE EXCLUSIVO DE ADJUNTAR ====== */}
              {attachEnabled && action === "attach" && (
                <Section
                  title="Recibo existente"
                  desc="Buscá el recibo que ya fue creado para asociarlo a esta reserva/servicios."
                >
                  <Field
                    id="receipt_search"
                    label="Buscar recibo"
                    hint="Por número o importe…"
                  >
                    <input
                      id="receipt_search"
                      type="text"
                      value={receiptQuery}
                      onChange={(e) => setReceiptQuery(e.target.value)}
                      placeholder='Ej.: "#123", "USD 500", "ARS 1200000"...'
                      className={inputBase}
                    />
                  </Field>

                  <div className="md:col-span-2">
                    {loadingReceipts ? (
                      <div className="py-2">
                        <Spinner />
                      </div>
                    ) : receiptOptions.length > 0 ? (
                      <div className="max-h-56 overflow-auto rounded-2xl border border-white/10">
                        {receiptOptions.map((opt) => {
                          const active = selectedReceiptId === opt.id_receipt;
                          return (
                            <button
                              type="button"
                              key={opt.id_receipt}
                              className={`w-full px-3 py-2 text-left transition hover:bg-white/5 ${active ? "bg-white/10" : ""}`}
                              onClick={() =>
                                setSelectedReceiptId(opt.id_receipt)
                              }
                            >
                              <div className="text-sm font-medium">
                                {opt.label}
                              </div>
                              {opt.subtitle && (
                                <div className="text-xs text-sky-950/70 dark:text-white/70">
                                  {opt.subtitle}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : receiptQuery ? (
                      <p className="text-sm text-sky-950/70 dark:text-white/70">
                        Sin resultados.
                      </p>
                    ) : (
                      <p className="text-sm text-sky-950/70 dark:text-white/70">
                        Escribí para buscar…
                      </p>
                    )}
                    {errors.receipt && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                        {errors.receipt}
                      </p>
                    )}
                  </div>
                </Section>
              )}

              {/* ====== BLOQUES DE CREACIÓN (se ocultan si action=attach) ====== */}
              {action === "create" && (
                <>
                  {/* CLIENTES */}
                  <Section
                    title="Clientes"
                    desc="Podés adjudicar el recibo a uno o varios clientes (opcional)."
                  >
                    <div className="flex items-center gap-2 pl-1 md:col-span-2">
                      <button
                        type="button"
                        onClick={handleDecrementClient}
                        className="rounded-full border border-sky-950 p-1 disabled:opacity-40 dark:border-white dark:text-white"
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
                          className="size-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 12h14"
                          />
                        </svg>
                      </button>
                      <span className="rounded-full border border-sky-950 px-3 py-1 text-sm dark:border-white dark:text-white">
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
                          className="size-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 4.5v15m7.5-7.5h-15"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="space-y-3 md:col-span-2">
                      {Array.from({ length: clientsCount }).map((_, idx) => (
                        <div key={idx} className="pl-1">
                          <ClientPicker
                            token={token}
                            label={`Cliente ${idx + 1}`}
                            placeholder="Buscar por ID, DNI, Pasaporte, CUIT o nombre..."
                            valueId={clientIds[idx] ?? null}
                            excludeIds={excludeForIndex(idx)}
                            onSelect={(c) => setClientAt(idx, c)}
                            onClear={() => setClientAt(idx, null)}
                          />
                          <p className="ml-1 mt-1 text-xs text-sky-950/70 dark:text-white/60">
                            Si no corresponde a un cliente específico, dejalo
                            vacío.
                          </p>
                        </div>
                      ))}
                    </div>
                  </Section>

                  {/* IMPORTE NUMÉRICO Y MONEDA */}
                  <Section
                    title="Importe y moneda (numérico)"
                    desc="Cuánto te pagan y en qué divisa."
                  >
                    <Field id="amount" label="Importe" required>
                      <input
                        id="amount"
                        type="number"
                        name="amount"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0,00"
                        className={inputBase}
                      />
                      {errors.amount && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                          {errors.amount}
                        </p>
                      )}
                      {suggestedAmount != null && (
                        <button
                          type="button"
                          onClick={useSuggested}
                          className="mt-2 text-xs underline underline-offset-2"
                        >
                          Usar total sugerido:{" "}
                          {formatNum(suggestedAmount, effectiveCurrency)}
                        </button>
                      )}
                    </Field>

                    <Field id="currency" label="Moneda" required>
                      {lockedCurrency ? (
                        <div className="rounded-2xl border border-white/10 bg-white/10 p-2 text-sm">
                          {lockedCurrency} (bloqueada por servicios)
                        </div>
                      ) : loadingPicks ? (
                        <div className="flex h-[42px] items-center">
                          <Spinner />
                        </div>
                      ) : (
                        <select
                          id="currency"
                          name="currency"
                          value={freeCurrency}
                          onChange={(e) => setFreeCurrency(e.target.value)}
                          className={`${inputBase} cursor-pointer appearance-none`}
                        >
                          {currencies
                            .filter((c) => c.enabled)
                            .map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code} {c.name ? `— ${c.name}` : ""}
                              </option>
                            ))}
                        </select>
                      )}
                      {errors.currency && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                          {errors.currency}
                        </p>
                      )}
                    </Field>
                  </Section>

                  {/* IMPORTE EN PALABRAS (PDF) */}
                  <Section
                    title="Importe en palabras (PDF)"
                    desc='Ej.: "UN MILLÓN CIEN MIL" + Moneda ("ARS", "USD", ...)'
                  >
                    <Field
                      id="amount_words"
                      label="Equivalente en palabras"
                      required
                    >
                      <input
                        id="amount_words"
                        type="text"
                        value={amountWords}
                        onChange={(e) => setAmountWords(e.target.value)}
                        placeholder='Ej.: "UN MILLÓN CIEN MIL"'
                        className={inputBase}
                      />
                      {errors.amountWords && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                          {errors.amountWords}
                        </p>
                      )}
                    </Field>
                  </Section>

                  {/* FORMA DE COBRO + DETALLE PDF */}
                  <Section
                    title="Forma de cobro"
                    desc="Seleccioná método/cuenta y agregá el detalle para el PDF."
                  >
                    <Field id="payment_method" label="Método de pago">
                      {loadingPicks ? (
                        <div className="flex h-[42px] items-center">
                          <Spinner />
                        </div>
                      ) : (
                        <select
                          id="payment_method"
                          name="payment_method"
                          value={paymentMethodId ?? ""}
                          onChange={(e) =>
                            setPaymentMethodId(
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                          className={`${inputBase} cursor-pointer appearance-none`}
                        >
                          <option value="">— Elegir —</option>
                          {paymentMethods.map((m) => (
                            <option key={m.id_method} value={m.id_method}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>

                    {requiresAccount ? (
                      <Field id="finance_account" label="Cuenta" required>
                        {loadingPicks ? (
                          <div className="flex h-[42px] items-center">
                            <Spinner />
                          </div>
                        ) : (
                          <select
                            id="finance_account"
                            name="finance_account"
                            value={financeAccountId ?? ""}
                            onChange={(e) =>
                              setFinanceAccountId(
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                            className={`${inputBase} cursor-pointer appearance-none`}
                            required
                          >
                            <option value="">— Elegir —</option>
                            {accounts.map((a) => (
                              <option key={a.id_account} value={a.id_account}>
                                {a.display_name || a.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {errors.account && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                            {errors.account}
                          </p>
                        )}
                      </Field>
                    ) : (
                      <div />
                    )}

                    <div className="md:col-span-2">
                      <Field
                        id="payment_desc"
                        label="Método de pago (detalle para el PDF)"
                        required
                      >
                        <input
                          id="payment_desc"
                          type="text"
                          value={paymentDescription}
                          onChange={(e) =>
                            setPaymentDescription(e.target.value)
                          }
                          placeholder="Ej.: Transferencia bancaria — No adeuda saldo"
                          className={inputBase}
                        />
                        {errors.paymentDescription && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-500/90">
                            {errors.paymentDescription}
                          </p>
                        )}
                      </Field>
                    </div>
                  </Section>

                  {/* CONCEPTO */}
                  <Section
                    title="Concepto"
                    desc="Opcional — visible en el recibo."
                  >
                    <div className="md:col-span-2">
                      <Field id="concept" label="Detalle / Concepto">
                        <input
                          id="concept"
                          type="text"
                          name="concept"
                          value={concept}
                          onChange={(e) => setConcept(e.target.value)}
                          placeholder="Ej.: Pago parcial reserva #1024"
                          className={inputBase}
                        />
                      </Field>
                    </div>
                  </Section>

                  {/* CONVERSIÓN (OPCIONAL) */}
                  <Section
                    title="Conversión (opcional)"
                    desc="Registra un contravalor entre monedas (se imprime en PDF si lo completás)."
                  >
                    <Field id="base" label="Base">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={baseAmount}
                          onChange={(e) => setBaseAmount(e.target.value)}
                          className={inputBase}
                          placeholder="Ej: 500"
                        />
                        <select
                          value={baseCurrency}
                          onChange={(e) => setBaseCurrency(e.target.value)}
                          className={`${inputBase} cursor-pointer appearance-none`}
                        >
                          <option value="">Moneda</option>
                          {currencies
                            .filter((c) => c.enabled)
                            .map((c) => (
                              <option key={`bc-${c.code}`} value={c.code}>
                                {c.code}
                              </option>
                            ))}
                        </select>
                      </div>
                    </Field>

                    <Field id="counter" label="Contravalor">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={counterAmount}
                          onChange={(e) => setCounterAmount(e.target.value)}
                          className={inputBase}
                          placeholder="Ej: 700000"
                        />
                        <select
                          value={counterCurrency}
                          onChange={(e) => setCounterCurrency(e.target.value)}
                          className={`${inputBase} cursor-pointer appearance-none`}
                        >
                          <option value="">Moneda</option>
                          {currencies
                            .filter((c) => c.enabled)
                            .map((c) => (
                              <option key={`cc-${c.code}`} value={c.code}>
                                {c.code}
                              </option>
                            ))}
                        </select>
                      </div>
                    </Field>
                  </Section>
                </>
              )}

              {/* ACTION BAR */}
              <div className="sticky bottom-2 z-10 flex justify-end gap-3">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-full bg-sky-950/10 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition active:scale-[0.98] dark:bg-white/10 dark:text-white"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  aria-busy={submitting}
                  className={`rounded-full px-6 py-2 shadow-sm shadow-sky-950/20 transition active:scale-[0.98] ${
                    submitting
                      ? "cursor-not-allowed bg-sky-950/20 text-white/60 dark:bg-white/5 dark:text-white/40"
                      : "bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
                  }`}
                  aria-label={
                    editingReceiptId
                      ? "Guardar cambios del recibo"
                      : action === "attach"
                        ? "Asociar recibo"
                        : "Agregar recibo"
                  }
                >
                  {submitting ? (
                    <Spinner />
                  ) : editingReceiptId ? (
                    "Guardar Cambios"
                  ) : action === "attach" ? (
                    "Asociar Recibo"
                  ) : (
                    "Crear Recibo"
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
