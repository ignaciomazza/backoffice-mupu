// src/components/investments/OperatorPaymentForm.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Booking, Operator, Service } from "@/types";
import { toast } from "react-toastify";
import Spinner from "@/components/Spinner";
import { authFetch } from "@/utils/authFetch";
import { loadFinancePicks } from "@/utils/loadFinancePicks";
import ServiceAllocationsEditor, {
  type AllocationSummary,
  type ExcessAction,
  type ExcessMissingAccountAction,
} from "@/components/investments/ServiceAllocationsEditor";

/* ========= Helpers ========= */
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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const hasIdAccount = (v: unknown): v is { id_account: number } =>
  isRecord(v) && typeof v.id_account === "number";

const getNum = (o: Record<string, unknown>, k: string): number | undefined => {
  const v = o[k];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return undefined;
};

const getStr = (o: Record<string, unknown>, k: string): string | undefined => {
  const v = o[k];
  return typeof v === "string" ? v : undefined;
};

const getBool = (
  o: Record<string, unknown>,
  k: string,
): boolean | undefined => {
  const v = o[k];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  if (typeof v === "number") return v !== 0;
  return undefined;
};

const fromKey = (o: unknown, key: string): unknown[] | null => {
  if (!isRecord(o)) return null;
  const rec = o as Record<string, unknown>;
  const v = rec[key];
  return Array.isArray(v) ? (v as unknown[]) : null;
};

type CreditAccount = {
  id_account: number;
  currency?: string | null;
  currency_code?: string | null;
  iso?: string | null;
};

function extractCreditAccounts(data: unknown): CreditAccount[] {
  const candidates: unknown[] = Array.isArray(data)
    ? data
    : (fromKey(data, "items") ??
      fromKey(data, "data") ??
      fromKey(data, "accounts") ??
      fromKey(data, "rows") ??
      fromKey(data, "results") ??
      (hasIdAccount(data) ? [data] : []));

  const out: CreditAccount[] = [];
  for (const raw of candidates) {
    if (!isRecord(raw)) continue;
    const rec = raw as Record<string, unknown>;

    // Soportar id_credit_account de Prisma
    const id =
      getNum(rec, "id_account") ??
      getNum(rec, "id_credit_account") ??
      getNum(rec, "id") ??
      0;
    if (!id) continue;

    out.push({
      id_account: id, // mapeamos cualquiera de los keys al campo común
      currency: getStr(rec, "currency"),
      currency_code: getStr(rec, "currency_code"),
      iso: getStr(rec, "iso"),
    });
  }
  return out;
}

/* ========= Finance config (tipos) ========= */
type FinanceAccount = {
  id_account: number;
  name: string;
  display_name?: string;
  enabled?: boolean;
  // campos opcionales que algunas APIs ya traen:
  currency?: string | null;
  currency_code?: string | null;
  iso?: string | null;
};

type FinanceMethod = {
  id_method: number;
  name: string;
  enabled?: boolean;
  requires_account?: boolean | null;
};

type FinanceCurrency = { code: string; name?: string; enabled?: boolean };

type FinanceCategory = {
  id_category: number;
  name: string;
  enabled?: boolean;
  requires_operator?: boolean;
};

type FinanceConfig = {
  accounts: FinanceAccount[];
  paymentMethods: FinanceMethod[];
  currencies: FinanceCurrency[];
  categories?: FinanceCategory[];
};

type ApiError = { error?: string; message?: string; details?: string };

const getApiErrorMessage = (
  err: ApiError | null | undefined,
  fallback: string,
): string => {
  const error = typeof err?.error === "string" ? err.error.trim() : "";
  const message = typeof err?.message === "string" ? err.message.trim() : "";
  const details = typeof err?.details === "string" ? err.details.trim() : "";
  if (error && details && details !== error) return `${error} (${details})`;
  if (message && details && details !== message) return `${message} (${details})`;
  return error || message || details || fallback;
};

// Estado de verificación de cuenta de crédito del Operador (por moneda)
type CreditAccStatus =
  | "idle"
  | "checking"
  | "exists"
  | "missing"
  | "creating"
  | "error";

/* ========= UI primitives (igual lenguaje que ReceiptForm) ========= */
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

const pillBase = "rounded-full px-3 py-1 text-xs font-medium transition-colors";
const pillNeutral = "bg-white/30 dark:bg-white/10";
const pillOk = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";

const inputBase =
  "w-full rounded-2xl border border-sky-200 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-sky-100/10 dark:border-sky-200/60 dark:text-white";

const EXCESS_TOLERANCE = 0.01;

/* ========= Categorías ========= */
function parseCategories(raw: unknown): FinanceCategory[] {
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.categories)
      ? raw.categories
      : isRecord(raw) && Array.isArray(raw.items)
        ? raw.items
        : [];
  const out: FinanceCategory[] = [];
  for (const el of arr) {
    if (!isRecord(el)) continue;
    const idRaw =
      ("id_category" in el ? el.id_category : undefined) ??
      ("id" in el ? el.id : undefined);
    const id =
      typeof idRaw === "number"
        ? idRaw
        : typeof idRaw === "string"
          ? Number(idRaw)
          : 0;
    const name =
      typeof el.name === "string"
        ? el.name
        : typeof el.label === "string"
          ? el.label
          : "";
    const enabled =
      typeof el.enabled === "boolean"
        ? el.enabled
        : typeof (el as Record<string, unknown>).is_enabled === "boolean"
          ? ((el as Record<string, unknown>).is_enabled as boolean)
          : true;
    const requires_operator =
      getBool(el as Record<string, unknown>, "requires_operator") ??
      getBool(el as Record<string, unknown>, "requiresOperator") ??
      getBool(el as Record<string, unknown>, "needs_operator") ??
      getBool(el as Record<string, unknown>, "needsOperator") ??
      false;
    if (id && name)
      out.push({ id_category: id, name, enabled, requires_operator });
  }
  return out;
}

const isOperatorCategoryLegacy = (name: string) => {
  const n = norm(name);
  return n === "operador" || n.startsWith("operador ");
};

// método virtual de crédito
const CREDIT_METHOD = "Crédito operador";

/* ========= Props ========= */
type Props = {
  token: string | null;
  booking: Booking;
  availableServices: Service[];
  operators: Operator[];
  onCreated?: () => void;
};

// respuesta mínima del investment creado
type InvestmentLite = {
  id_investment: number;
  category: string;
  description: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  operator_id?: number | null;
};

type OperatorPaymentOption = {
  id_investment: number;
  agency_investment_id?: number | null;
  description: string;
  amount: number;
  currency: string;
  operator_id?: number | null;
  operator_name?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
  serviceIds?: number[] | null;
};

export default function OperatorPaymentForm({
  token,
  booking,
  availableServices,
  operators,
  onCreated,
}: Props) {
  const [visible, setVisible] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [action, setAction] = useState<"create" | "attach">("create");
  const [paymentQuery, setPaymentQuery] = useState("");
  const [paymentOptions, setPaymentOptions] = useState<OperatorPaymentOption[]>(
    [],
  );
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [selectedPayment, setSelectedPayment] =
    useState<OperatorPaymentOption | null>(null);

  useEffect(() => {
    setAllocationSummary({
      allocations: [],
      assignedTotal: 0,
      missingAmountCount: 0,
      missingFxCount: 0,
      overAssigned: false,
      excess: 0,
    });
    setExcessAction("carry");
    setExcessMissingAccountAction("carry");
    setAllocationResetKey((k) => k + 1);
  }, [action, selectedPayment?.id_investment]);

  // ====== Finance config + categorías
  const [finance, setFinance] = useState<FinanceConfig | null>(null);
  const [loadingPicks, setLoadingPicks] = useState(false);

  useEffect(() => {
    if (!token) {
      setFinance({ accounts: [], paymentMethods: [], currencies: [] });
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        setLoadingPicks(true);
        const picks = await loadFinancePicks(token);
        if (ac.signal.aborted) return;

        const picksCategories: FinanceCategory[] =
          picks.categories?.map((c) => ({
            id_category: c.id_category,
            name: c.name,
            enabled: c.enabled,
            requires_operator: c.requires_operator,
          })) ?? [];
        let categories: FinanceCategory[] | undefined = picksCategories.length
          ? picksCategories
          : undefined;
        try {
          const catsRes = await authFetch(
            "/api/finance/categories",
            { cache: "no-store", signal: ac.signal },
            token,
          );
          if (catsRes.ok) {
            const raw = await safeJson<unknown>(catsRes);
            const cats = parseCategories(raw);
            if (cats.length) categories = cats;
          }
        } catch {}

        setFinance({
          accounts: picks.accounts || [],
          paymentMethods: picks.paymentMethods || [],
          currencies: picks.currencies || [],
          categories,
        });
      } finally {
        if (!ac.signal.aborted) setLoadingPicks(false);
      }
    })();
    return () => ac.abort();
  }, [token]);

  const allCategories = useMemo(
    () => finance?.categories?.filter((c) => c.enabled !== false) ?? [],
    [finance?.categories],
  );
  const operatorCategories = useMemo(
    () =>
      allCategories.filter(
        (c) => c.requires_operator === true || isOperatorCategoryLegacy(c.name),
      ),
    [allCategories],
  );
  const operatorCategorySet = useMemo(
    () => new Set(operatorCategories.map((c) => norm(c.name))),
    [operatorCategories],
  );
  const isOperatorCategory = useCallback(
    (name: string) => {
      const n = norm(name);
      if (!n) return false;
      return operatorCategorySet.has(n) || isOperatorCategoryLegacy(name);
    },
    [operatorCategorySet],
  );

  const paymentMethodOptions = useMemo(
    () =>
      uniqSorted(
        finance?.paymentMethods
          ?.filter((m) => m.enabled !== false)
          .map((m) => m.name) ?? [],
      ),
    [finance?.paymentMethods],
  );

  const requiresAccountMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const m of finance?.paymentMethods || []) {
      if (m.enabled === false) continue;
      map.set(norm(m.name), !!m.requires_account);
    }
    map.set(norm(CREDIT_METHOD), false);
    return map;
  }, [finance?.paymentMethods]);

  const accounts = useMemo(
    () => (finance?.accounts ?? []).filter((a) => a.enabled !== false),
    [finance?.accounts],
  );

  const currencyOptions = useMemo(
    () =>
      uniqSorted(
        finance?.currencies
          ?.filter((c) => c.enabled !== false)
          .map((c) => c.code.toUpperCase()) ?? [],
      ),
    [finance?.currencies],
  );

  const currencyDict = useMemo(() => {
    const d: Record<string, string> = {};
    for (const c of finance?.currencies || []) {
      if (c.enabled !== false) d[c.code.toUpperCase()] = c.name || c.code;
    }
    return d;
  }, [finance?.currencies]);

  useEffect(() => {
    if (action !== "attach") {
      setPaymentQuery("");
      setPaymentOptions([]);
      setSelectedPayment(null);
      setLoadingPayments(false);
      return;
    }
  }, [action]);

  useEffect(() => {
    if (action !== "attach") return;
    if (!token) {
      setLoadingPayments(false);
      return;
    }
    const raw = paymentQuery.trim();
    if (raw.length < 2) {
      setPaymentOptions([]);
      setLoadingPayments(false);
      return;
    }

    let alive = true;
    const controller = new AbortController();
    setLoadingPayments(true);

    const t = setTimeout(() => {
      authFetch(
        `/api/investments?operatorOnly=1&take=12&q=${encodeURIComponent(raw)}`,
        { cache: "no-store", signal: controller.signal },
        token,
      )
        .then(async (res) => {
          if (!res.ok) return [];
          const data = (await safeJson<unknown>(res)) ?? {};
          const items = isRecord(data)
            ? ((data as Record<string, unknown>).items as unknown[])
            : Array.isArray(data)
              ? data
              : [];
          if (!Array.isArray(items)) return [];

          return items
            .map((it): OperatorPaymentOption | null => {
              if (!isRecord(it)) return null;
              const rec = it as Record<string, unknown>;
              const id = getNum(rec, "id_investment") ?? getNum(rec, "id");
              if (!id) return null;
              const operator =
                isRecord(rec.operator) && rec.operator
                  ? (rec.operator as Record<string, unknown>)
                  : null;
              const serviceIds = Array.isArray(rec.serviceIds)
                ? rec.serviceIds.filter((v) => Number.isFinite(Number(v)))
                : null;
              return {
                id_investment: id,
                agency_investment_id: getNum(rec, "agency_investment_id"),
                description: getStr(rec, "description") || "Pago a operador",
                amount: getNum(rec, "amount") ?? 0,
                currency: (getStr(rec, "currency") || "ARS").toUpperCase(),
                operator_id:
                  getNum(rec, "operator_id") ??
                  (operator ? getNum(operator, "id_operator") : undefined),
                operator_name: operator ? getStr(operator, "name") : undefined,
                created_at: getStr(rec, "created_at"),
                paid_at: getStr(rec, "paid_at"),
                serviceIds,
              };
            })
            .filter((x): x is OperatorPaymentOption => x !== null);
        })
        .then((opts) => {
          if (alive) setPaymentOptions(opts);
        })
        .catch(() => {
          if (alive) setPaymentOptions([]);
        })
        .finally(() => {
          if (alive) setLoadingPayments(false);
        });
    }, 250);

    return () => {
      alive = false;
      controller.abort();
      clearTimeout(t);
    };
  }, [action, paymentQuery, token]);

  /* ========= Servicios de la reserva ========= */
  const servicesFromBooking: Service[] = useMemo(() => {
    const embedded = (booking as unknown as { services?: Service[] })?.services;
    if (embedded && Array.isArray(embedded) && embedded.length > 0) {
      return embedded;
    }
    return (availableServices || []).filter(
      (s) =>
        (s as unknown as { booking_id?: number })?.booking_id ===
        booking.id_booking,
    );
  }, [booking, availableServices]);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const selectedServices = useMemo(
    () => servicesFromBooking.filter((s) => selectedIds.includes(s.id_service)),
    [servicesFromBooking, selectedIds],
  );
  const [allocationSummary, setAllocationSummary] = useState<AllocationSummary>({
    allocations: [],
    assignedTotal: 0,
    missingAmountCount: 0,
    missingFxCount: 0,
    overAssigned: false,
    excess: 0,
  });
  const [excessAction, setExcessAction] = useState<ExcessAction>("carry");
  const [excessMissingAccountAction, setExcessMissingAccountAction] =
    useState<ExcessMissingAccountAction>("carry");
  const [allocationResetKey, setAllocationResetKey] = useState(0);

  useEffect(() => {
    if (selectedServices.length === 0) {
      setAllocationSummary({
        allocations: [],
        assignedTotal: 0,
        missingAmountCount: 0,
        missingFxCount: 0,
        overAssigned: false,
        excess: 0,
      });
      setExcessAction("carry");
      setExcessMissingAccountAction("carry");
      setAllocationResetKey((k) => k + 1);
    }
  }, [selectedServices.length]);

  /* ========= Sugeridos / locks ========= */
  const operatorIdFromSelection = useMemo<number | null>(() => {
    if (selectedServices.length === 0) return null;
    const first = selectedServices[0].id_operator;
    const allSame = selectedServices.every((s) => s.id_operator === first);
    return allSame ? (first ?? null) : null;
  }, [selectedServices]);

  const allSameCurrency = useMemo<boolean>(() => {
    if (selectedServices.length === 0) return true;
    const set = new Set(
      selectedServices.map((s) => (s.currency || "").toUpperCase()),
    );
    return set.size === 1;
  }, [selectedServices]);

  const lockedSvcCurrency = useMemo<string | null>(() => {
    if (!allSameCurrency || selectedServices.length === 0) return null;
    const code = (selectedServices[0].currency || "").toUpperCase();
    return code || null;
  }, [selectedServices, allSameCurrency]);

  const selectedCurrencies = useMemo(() => {
    const set = new Set(
      selectedServices.map((s) => (s.currency || "").toUpperCase()),
    );
    return Array.from(set).filter(Boolean);
  }, [selectedServices]);

  const suggestedAmount = useMemo<number>(() => {
    return selectedServices.reduce((sum, s) => sum + (s.cost_price ?? 0), 0);
  }, [selectedServices]);

  const formatMoney = useCallback(
    (n: number, cur = "ARS") =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: cur,
        minimumFractionDigits: 2,
      }).format(n),
    [],
  );

  /* ========= Campos ========= */
  const [category, setCategory] = useState<string>("");
  const [operatorId, setOperatorId] = useState<number | "">("");

  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [account, setAccount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>("");

  const [useConversion, setUseConversion] = useState<boolean>(false);
  const [baseAmount, setBaseAmount] = useState<string>("");
  const [baseCurrency, setBaseCurrency] = useState<string>("");
  const [counterAmount, setCounterAmount] = useState<string>("");
  const [counterCurrency, setCounterCurrency] = useState<string>("");

  const [loading, setLoading] = useState(false);

  const getOperatorDisplayId = useCallback(
    (id?: number | null) => {
      if (!id) return id ?? null;
      const found = operators.find((o) => o.id_operator === id);
      return found?.agency_operator_id ?? id;
    },
    [operators],
  );

  // Estado verificación/creación de cuenta de crédito
  const [creditAccStatus, setCreditAccStatus] =
    useState<CreditAccStatus>("idle");
  const [creditAccMsg, setCreditAccMsg] = useState<string>("");

  // Auto categoría por defecto
  useEffect(() => {
    if (!category && operatorCategories.length > 0) {
      const preferred =
        operatorCategories.find((c) => norm(c.name) === "operador") ??
        operatorCategories[0];
      setCategory(preferred.name);
    }
  }, [operatorCategories, category]);

  // Reacciones a selección de servicios
  useEffect(() => {
    // operador
    if (operatorIdFromSelection != null) {
      setOperatorId(operatorIdFromSelection);
    } else if (selectedServices.length === 0) {
      setOperatorId("");
    }

    // moneda
    if (!currency && lockedSvcCurrency && currencyOptions.includes(lockedSvcCurrency)) {
      setCurrency(lockedSvcCurrency);
    }

    // monto (solo sugerir si hay una sola moneda y no hay monto cargado)
    if (selectedServices.length > 0) {
      if (!amount && allSameCurrency) {
        setAmount(
          Number.isFinite(suggestedAmount) && suggestedAmount > 0
            ? String(suggestedAmount)
            : "",
        );
      }
    } else {
      setAmount("");
    }

    // descripción
    if (selectedServices.length > 0) {
      const ids = selectedServices
        .map((s) => `N° ${s.agency_service_id ?? s.id_service}`)
        .join(", ");
      const opName =
        operators.find((o) => o.id_operator === operatorIdFromSelection)
          ?.name || "Operador";
      setDescription(
        `Pago a operador ${opName} | Reserva N° ${
          booking.agency_booking_id ?? booking.id_booking
        } | Servicios ${ids}`,
      );
    } else {
      setDescription("");
    }
  }, [
    selectedServices,
    operatorIdFromSelection,
    lockedSvcCurrency,
    suggestedAmount,
    operators,
    booking.agency_booking_id,
    booking.id_booking,
    currencyOptions,
    currency,
    amount,
    allSameCurrency,
  ]);

  // Si es categoría Operador, incluir el método virtual de crédito.
  const uiPaymentMethodOptions = useMemo(() => {
    if (!isOperatorCategory(category)) return paymentMethodOptions;
    return uniqSorted([...paymentMethodOptions, CREDIT_METHOD]);
  }, [paymentMethodOptions, category, isOperatorCategory]);

  const payingWithCredit = useMemo(
    () => isOperatorCategory(category) && paymentMethod === CREDIT_METHOD,
    [category, paymentMethod, isOperatorCategory],
  );

  const requiresAccount = useMemo(() => {
    if (!paymentMethod) return false;
    return !!requiresAccountMap.get(norm(paymentMethod));
  }, [paymentMethod, requiresAccountMap]);

  // conversion: autocompletar
  useEffect(() => {
    if (!useConversion) return;
    setBaseAmount((v) => v || amount || "");
    setBaseCurrency((v) => v || currency || "");
    setCounterCurrency((v) => {
      if (v) return v;
      const base = (baseCurrency || currency || "").toUpperCase();
      const other = currencyOptions.find((c) => c !== base) || "";
      return other;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useConversion]);

  useEffect(() => {
    if (!useConversion) return;
    setBaseCurrency((v) => v || currency || "");
    setBaseAmount((v) => v || amount || "");
    setCounterCurrency((v) => {
      if (v) return v;
      const base = (baseCurrency || currency || "").toUpperCase();
      const other = currencyOptions.find((c) => c !== base) || "";
      return other;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, amount, currencyOptions]);

  // Restringir método de crédito a categorías de Operador.
  useEffect(() => {
    setPaymentMethod((pm) => {
      const isOperador = isOperatorCategory(category);
      if (!isOperador && pm === CREDIT_METHOD) {
        setAccount("");
        return "";
      }
      if (isOperador && pm === CREDIT_METHOD && account) {
        setAccount("");
        return pm;
      }
      return pm;
    });
  }, [category, account, isOperatorCategory]);

  // Toggle selección con validación operador y moneda homogéneos
  const toggleService = (svc: Service) => {
    const isSelected = selectedIds.includes(svc.id_service);
    if (isSelected) {
      setSelectedIds((prev) => prev.filter((id) => id !== svc.id_service));
      return;
    }
    if (selectedServices.length > 0) {
      const baseOp = selectedServices[0].id_operator;
      if (baseOp && svc.id_operator && baseOp !== svc.id_operator) {
        toast.error(
          "No podés mezclar servicios de operadores distintos en un mismo pago.",
        );
        return;
      }
    }
    setSelectedIds((prev) => [...prev, svc.id_service]);
  };

  const useSuggested = () => {
    if (selectedServices.length === 0) return;
    setAmount(String(suggestedAmount || 0));
    if (lockedSvcCurrency && currencyOptions.includes(lockedSvcCurrency)) {
      setCurrency(lockedSvcCurrency);
    }
    if (useConversion) {
      setBaseAmount(String(suggestedAmount || 0));
      setBaseCurrency(lockedSvcCurrency || currency || "");
      const other =
        currencyOptions.find(
          (c) => c !== (lockedSvcCurrency || currency || ""),
        ) || "";
      setCounterCurrency(other);
    }
  };

  const previewAmount = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return "";
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: currency || "ARS",
        minimumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${currency || ""}`;
    }
  }, [amount, currency]);

  const previewBase = useMemo(() => {
    const n = Number(baseAmount);
    if (!useConversion || !Number.isFinite(n) || n <= 0 || !baseCurrency)
      return "";
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: baseCurrency,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${baseCurrency}`;
    }
  }, [useConversion, baseAmount, baseCurrency]);

  const previewCounter = useMemo(() => {
    const n = Number(counterAmount);
    if (!useConversion || !Number.isFinite(n) || n <= 0 || !counterCurrency)
      return "";
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: counterCurrency,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${counterCurrency}`;
    }
  }, [useConversion, counterAmount, counterCurrency]);

  const editorPaymentCurrency =
    action === "attach" ? selectedPayment?.currency || "" : currency;
  const editorPaymentAmount =
    action === "attach" ? Number(selectedPayment?.amount || 0) : Number(amount || 0);

  /* ========= Detección de moneda de cuenta ========= */
  const guessAccountCurrency = useCallback(
    (accName: string | undefined | null): string | null => {
      if (!accName) return null;
      const upper = accName.toUpperCase();
      // señaladores comunes
      const synonyms: Record<string, string[]> = {
        USD: ["USD", "U$D", "DOLARES", "DÓLARES", "US DOLLAR", "U SD"],
        ARS: ["ARS", "PESOS", "$ "],
        EUR: ["EUR", "€", "EUROS"],
        BRL: ["BRL", "REALES"],
        UYU: ["UYU"],
        CLP: ["CLP"],
        PYG: ["PYG"],
      };
      // 1) si el account tiene campo currency/iso
      const byObject =
        accounts.find((a) => (a.display_name || a.name) === accName)
          ?.currency ||
        accounts.find((a) => (a.display_name || a.name) === accName)
          ?.currency_code ||
        accounts.find((a) => (a.display_name || a.name) === accName)?.iso ||
        null;
      if (byObject && typeof byObject === "string")
        return byObject.trim().toUpperCase();

      // 2) si matchea con alguna ISO de picks
      for (const code of currencyOptions) {
        if (upper.includes(code.toUpperCase())) return code.toUpperCase();
      }
      // 3) sinonimia simple
      for (const [code, keys] of Object.entries(synonyms)) {
        if (keys.some((k) => upper.includes(k))) return code;
      }
      return null;
    },
    [accounts, currencyOptions],
  );

  /* ========= Verificación explícita de cuenta de CRÉDITO del Operador ========= */
  const checkCreditAccount = useCallback(
    async (opId: number, cur: string) => {
      if (!token || !opId || !cur) return "missing" as const;

      const C = cur.toUpperCase();
      try {
        // Tu API es singular: /api/credit/account
        const url = `/api/credit/account?operator_id=${encodeURIComponent(
          String(opId),
        )}&currency=${encodeURIComponent(C)}`;

        const res = await authFetch(url, { cache: "no-store" }, token);
        if (!res.ok) {
          // 4xx → consideramos "missing", 5xx → "error"
          return res.status >= 500 ? ("error" as const) : ("missing" as const);
        }
        const data = await safeJson<unknown>(res);
        const items = extractCreditAccounts(data);
        return items.length > 0 ? ("exists" as const) : ("missing" as const);
      } catch {
        return "error" as const;
      }
    },
    [token],
  );

  useEffect(() => {
    if (!payingWithCredit) {
      setCreditAccStatus("idle");
      setCreditAccMsg("");
      return;
    }
    if (!operatorId || !currency) return;
    let alive = true;
    setCreditAccStatus("checking");
    checkCreditAccount(Number(operatorId), currency)
      .then((s) => {
        if (alive) setCreditAccStatus(s as CreditAccStatus);
      })
      .catch(() => {
        if (alive) {
          setCreditAccStatus("error");
          setCreditAccMsg("No se pudo verificar la cuenta.");
        }
      });
    return () => {
      alive = false;
    };
  }, [payingWithCredit, operatorId, currency, checkCreditAccount]);

  /* ========= Validaciones ========= */
  const validateConversion = (): { ok: boolean; msg?: string } => {
    if (!useConversion) return { ok: true };
    const bAmt = Number(baseAmount);
    const cAmt = Number(counterAmount);
    if (!Number.isFinite(bAmt) || bAmt <= 0)
      return { ok: false, msg: "Ingresá un Valor base válido (> 0)." };
    if (!baseCurrency)
      return { ok: false, msg: "Elegí la moneda del Valor base." };
    if (!Number.isFinite(cAmt) || cAmt <= 0)
      return { ok: false, msg: "Ingresá un Contravalor válido (> 0)." };
    if (!counterCurrency)
      return { ok: false, msg: "Elegí la moneda del Contravalor." };
    return { ok: true };
  };

  const assertSameOperator = (): boolean => {
    if (selectedServices.length === 0) return true;
    if (
      operatorIdFromSelection != null &&
      Number(operatorId) !== operatorIdFromSelection
    ) {
      toast.error(
        "El operador elegido no coincide con los servicios seleccionados.",
      );
      return false;
    }
    return true;
  };

  const assertAccountMatchesCurrency = (): boolean => {
    if (!requiresAccount || !account) return true;
    const accCur = guessAccountCurrency(account);
    if (!accCur) {
      toast.warn(
        "No pude detectar la moneda de la cuenta. Revisá que coincida con la moneda de los servicios.",
      );
      return true; // warning, no bloquea
    }
    // chequeamos contra la moneda del pago
    if (currency && accCur !== currency.toUpperCase()) {
      toast.error(
        `La cuenta es ${accCur} y la moneda del pago es ${currency}. Deben coincidir.`,
      );
      return false;
    }
    return true;
  };

  // Crear cuenta de CRÉDITO (acción explícita)
  const handleCreateCreditAccount = useCallback(async () => {
    if (!token || !operatorId || !currency) return;

    setCreditAccStatus("creating");
    setCreditAccMsg("");

    try {
      const C = currency.toUpperCase();

      // Tu API de creación es singular: /api/credit/account (POST)
      const payload = {
        operator_id: Number(operatorId),
        currency: C,
        enabled: true,
      };

      const res = await authFetch(
        `/api/credit/account`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        token,
      );

      if (!res.ok) {
        const err = await safeJson<ApiError>(res);
        const msg = getApiErrorMessage(
          err,
          `No se pudo crear la cuenta en ${C}.`,
        );
        throw new Error(msg);
      }

      // Revalidar inmediatamente
      const status = await checkCreditAccount(Number(operatorId), C);
      if (status === "exists") {
        setCreditAccStatus("exists");
        toast.success(`Cuenta de crédito en ${C} creada.`);
      } else if (status === "missing") {
        setCreditAccStatus("missing");
        toast.warn(
          `La API confirmó la creación, pero no la encontramos aún en ${C}. Probá nuevamente.`,
        );
      } else {
        setCreditAccStatus("error");
        setCreditAccMsg("La verificación posterior a la creación falló.");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al crear la cuenta.";
      setCreditAccStatus("error");
      setCreditAccMsg(msg);
      toast.error(msg);
    }
  }, [token, operatorId, currency, checkCreditAccount]);

  // Crear cuenta para excedente (sin afectar estado UI de crédito)
  const createCreditAccountForExcess = useCallback(
    async (opId: number, cur: string): Promise<boolean> => {
      if (!token || !opId || !cur) return false;
      try {
        const payload = {
          operator_id: Number(opId),
          currency: cur.toUpperCase(),
          enabled: true,
        };
        const res = await authFetch(
          `/api/credit/account`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          token,
        );
        if (!res.ok) {
          const err = await safeJson<ApiError>(res);
          const msg = getApiErrorMessage(err, "No se pudo crear la cuenta.");
          toast.error(msg);
          return false;
        }
        const status = await checkCreditAccount(opId, cur);
        if (status === "exists") {
          toast.success(`Cuenta de crédito en ${cur} creada.`);
          return true;
        }
        toast.warn(
          `La cuenta fue creada, pero no la detectamos aún en ${cur}.`,
        );
        return false;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Error al crear la cuenta.";
        toast.error(msg);
        return false;
      }
    },
    [token, checkCreditAccount],
  );

  const precheckExcessCreditAccount = useCallback(
    async (opId: number | null, cur: string | null): Promise<boolean> => {
      if (!opId || !cur) return true;
      const status = await checkCreditAccount(opId, cur);
      if (status === "exists") return true;

      if (excessMissingAccountAction === "block") {
        toast.error(
          "No hay cuenta corriente del operador en la moneda del pago. Creala o elegí otra opción.",
        );
        return false;
      }

      if (excessMissingAccountAction === "create") {
        const ok = await createCreditAccountForExcess(opId, cur);
        return ok;
      }

      toast.warn(
        "No hay cuenta corriente del operador en la moneda del pago. El excedente se guardará como saldo a favor.",
      );
      return true;
    },
    [checkCreditAccount, excessMissingAccountAction, createCreditAccountForExcess],
  );

  // Si el método requiere cuenta bancaria/financiera, filtrar por la moneda del pago
  const filteredAccounts = useMemo(() => {
    if (!requiresAccount) return accounts;
    const cur = (currency || "").toUpperCase();
    return accounts.filter((a) => {
      const objCur =
        (a.currency || a.currency_code || a.iso || "")
          ?.toString()
          .toUpperCase() ||
        guessAccountCurrency(a.display_name || a.name) ||
        "";
      return objCur === cur;
    });
  }, [accounts, requiresAccount, currency, guessAccountCurrency]);

  /* ========= Submit ========= */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (action === "attach") {
      if (!selectedPayment) {
        toast.error("Elegí un pago existente.");
        return;
      }
      if (selectedServices.length === 0) {
        toast.error("Seleccioná al menos un servicio de la reserva.");
        return;
      }

      if (
        selectedPayment.operator_id &&
        operatorIdFromSelection != null &&
        selectedPayment.operator_id !== operatorIdFromSelection
      ) {
        toast.error(
          "El operador del pago no coincide con los servicios seleccionados.",
        );
        return;
      }

      if (allocationSummary.overAssigned) {
        toast.error("El total asignado supera el monto del pago.");
        return;
      }

      if (
        excessAction === "credit_entry" &&
        allocationSummary.excess > EXCESS_TOLERANCE
      ) {
        const opId =
          selectedPayment?.operator_id ??
          operatorIdFromSelection ??
          (operatorId ? Number(operatorId) : null);
        const cur =
          editorPaymentCurrency?.toUpperCase() || currency?.toUpperCase() || "";
        const ok = await precheckExcessCreditAccount(opId, cur || null);
        if (!ok) return;
      }

      setLoading(true);
      try {
        const res = await authFetch(
          `/api/investments/${selectedPayment.id_investment}`,
          {
            method: "PUT",
            body: JSON.stringify({
              allocations: allocationSummary.allocations,
              excess_action: excessAction,
              excess_missing_account_action: excessMissingAccountAction,
            }),
          },
          token,
        );
        if (!res.ok) {
          const err = await safeJson<ApiError>(res);
          const msg = getApiErrorMessage(
            err,
            "No se pudo asociar el pago al operador.",
          );
          throw new Error(msg);
        }

        toast.success("Pago asociado correctamente.");
        onCreated?.();
        setSelectedIds([]);
        setPaymentQuery("");
        setPaymentOptions([]);
        setSelectedPayment(null);
        setAllocationSummary({
          allocations: [],
          assignedTotal: 0,
          missingAmountCount: 0,
          missingFxCount: 0,
          overAssigned: false,
          excess: 0,
        });
        setExcessAction("carry");
        setExcessMissingAccountAction("carry");
        setAllocationResetKey((k) => k + 1);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Error al asociar el pago.";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selectedServices.length === 0) {
      toast.error("Seleccioná al menos un servicio de la reserva.");
      return;
    }
    if (!operatorId) {
      toast.error("Seleccioná un operador.");
      return;
    }
    if (!category || !isOperatorCategory(category)) {
      toast.error("Elegí una categoría válida para Operador.");
      return;
    }
    if (!assertSameOperator()) return;

    if (!payingWithCredit && !paymentMethod) {
      toast.error("Seleccioná el método de pago.");
      return;
    }
    if (!currency) {
      toast.error("Seleccioná una moneda.");
      return;
    }
    if (requiresAccount && !account) {
      toast.error("Seleccioná la cuenta para este método.");
      return;
    }

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("El monto debe ser un número positivo.");
      return;
    }
    if (allocationSummary.overAssigned) {
      toast.error("El total asignado supera el monto del pago.");
      return;
    }
    const conv = validateConversion();
    if (!conv.ok) {
      toast.error(conv.msg || "Revisá los datos de Valor/Contravalor");
      return;
    }

    if (!assertAccountMatchesCurrency()) return;

    if (
      !payingWithCredit &&
      excessAction === "credit_entry" &&
      allocationSummary.excess > EXCESS_TOLERANCE
    ) {
      const opId =
        operatorId != null
          ? Number(operatorId)
          : operatorIdFromSelection ?? null;
      const cur = currency?.toUpperCase() || "";
      const ok = await precheckExcessCreditAccount(opId, cur || null);
      if (!ok) return;
    }

    setLoading(true);

    // Bloqueo explícito: si se usa crédito operador, debe existir la cuenta en la misma moneda
    if (payingWithCredit) {
      switch (creditAccStatus) {
        case "checking":
        case "creating":
          toast.info("Esperá a que validemos/creemos la cuenta de crédito.");
          setLoading(false);
          return;
        case "exists":
          // OK, continuamos
          break;
        default: // "idle" | "missing" | "error"
          toast.error(
            `Necesitás una cuenta de crédito del Operador en ${currency} para registrar este pago.`,
          );
          setLoading(false);
          return;
      }
    }

    try {
      const ids = selectedServices
        .map((s) => s.agency_service_id ?? s.id_service)
        .join(", ");
      const desc =
        description.trim() ||
        `Pago a operador | Reserva N° ${
          booking.agency_booking_id ?? booking.id_booking
        } | Servicios ${ids}`;

      const payload: Record<string, unknown> = {
        category,
        description: desc,
        amount: amountNum,
        currency: currency.toUpperCase(),
        operator_id: Number(operatorId),
        paid_at: paidAt || undefined,
        booking_id: booking.id_booking,
        allocations: allocationSummary.allocations,
        excess_action: excessAction,
        excess_missing_account_action: excessMissingAccountAction,
        payment_method: payingWithCredit ? CREDIT_METHOD : paymentMethod,
        account: payingWithCredit
          ? undefined
          : requiresAccount
            ? account
            : undefined,
      };

      if (useConversion) {
        const bAmt = Number(baseAmount);
        const cAmt = Number(counterAmount);
        payload.base_amount =
          Number.isFinite(bAmt) && bAmt > 0 ? bAmt : undefined;
        payload.base_currency = baseCurrency
          ? baseCurrency.toUpperCase()
          : undefined;
        payload.counter_amount =
          Number.isFinite(cAmt) && cAmt > 0 ? cAmt : undefined;
        payload.counter_currency = counterCurrency
          ? counterCurrency.toUpperCase()
          : undefined;
      }

      const res = await authFetch(
        "/api/investments",
        { method: "POST", body: JSON.stringify(payload) },
        token,
      );

      if (!res.ok) {
        const err = await safeJson<ApiError>(res);
        const msg = getApiErrorMessage(
          err,
          "No se pudo crear el pago al operador.",
        );
        throw new Error(msg);
      }

      await safeJson<InvestmentLite>(res);
      toast.success("Pago al operador cargado en Investments.");

      onCreated?.();

      // Reset corto
      setSelectedIds([]);
      setAmount("");
      setCurrency(lockedSvcCurrency || "");
      setOperatorId("");
      setPaidAt("");
      setDescription("");
      setPaymentMethod("");
      setAccount("");
      setUseConversion(false);
      setBaseAmount("");
      setBaseCurrency("");
      setCounterAmount("");
      setCounterCurrency("");
      setAllocationSummary({
        allocations: [],
        assignedTotal: 0,
        missingAmountCount: 0,
        missingFxCount: 0,
        overAssigned: false,
        excess: 0,
      });
      setExcessAction("carry");
      setExcessMissingAccountAction("carry");
      setAllocationResetKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al cargar el pago.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ========= UI helpers ========= */
  const showHeaderPills = () => {
    const pills: React.ReactNode[] = [];

    pills.push(
      <span key="cat" className={`${pillBase} ${pillNeutral}`}>
        {category || "Categoría"}
      </span>,
    );

    if (operatorId) {
      pills.push(
        <span key="op" className={`${pillBase} ${pillNeutral}`}>
          Operador N° {getOperatorDisplayId(operatorId)}
        </span>,
      );
    }

    if (selectedServices.length > 0) {
      pills.push(
        <span key="svc" className={`${pillBase} ${pillOk}`}>
          Svcs: {selectedServices.length}
        </span>,
      );
    }

    if (lockedSvcCurrency || currency) {
      const cur = lockedSvcCurrency || currency;
      pills.push(
        <span
          key="cur"
          className={`${pillBase} ${lockedSvcCurrency ? pillOk : pillNeutral}`}
          title={
            lockedSvcCurrency
              ? "Moneda sugerida por servicios"
              : "Moneda del pago"
          }
        >
          {cur}
          {lockedSvcCurrency ? " (srv)" : ""}
        </span>,
      );
    }

    if (payingWithCredit) {
      pills.push(
        <span key="cred" className={`${pillBase} ${pillOk}`}>
          Crédito operador
        </span>,
      );
    }

    return pills;
  };

  /* ========= Render ========= */
  return (
    <motion.div
      layout
      initial={{ maxHeight: 96, opacity: 1 }}
      animate={{
        maxHeight: visible ? 2000 : 96,
        opacity: 1,
        transition: { duration: 0.35, ease: "easeInOut" },
      }}
      className="mb-6 overflow-auto rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md shadow-sky-950/10 dark:text-white"
    >
      {/* HEADER */}
      <div
        className={`sticky top-0 z-10 ${visible ? "rounded-t-3xl border-b" : ""} border-white/10 px-4 py-3 backdrop-blur-sm`}
      >
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={visible}
          aria-controls="operator-payment-form-body"
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
                {visible
                  ? action === "attach"
                    ? "Asociar pago a Operador"
                    : "Pago a Operador"
                  : action === "attach"
                    ? "Asociar Pago a Operador"
                    : "Cargar Pago a Operador"}
              </p>
              <p className="text-xs opacity-70">
                Reserva N° {booking.agency_booking_id ?? booking.id_booking}
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
          >
            <motion.form
              id="operator-payment-form-body"
              onSubmit={handleSubmit}
              className="space-y-5 px-4 pb-6 pt-4 md:px-6"
            >
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: "create", label: "Crear pago" },
                  { key: "attach", label: "Asociar pago existente" },
                ].map((opt) => {
                  const active = action === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAction(opt.key as "create" | "attach")}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                        active
                          ? "bg-sky-500/15 text-sky-700 dark:text-sky-200"
                          : "text-sky-950/80 hover:bg-white/60 dark:text-white/80"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs opacity-70">
                {action === "attach"
                  ? "Elegí un pago ya creado y vinculalo a servicios de esta reserva."
                  : "Creá un pago nuevo vinculado a servicios de esta reserva."}
              </p>

              {/* CONTEXTO */}
              <Section
                title="Contexto"
                desc="Elegí los servicios (mismo operador)."
              >
                <div className="md:col-span-2">
                  {servicesFromBooking.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm opacity-80">
                      Esta reserva no tiene servicios cargados.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {servicesFromBooking.map((svc) => {
                        const checked = selectedIds.includes(svc.id_service);
                        const disabled =
                          selectedServices.length > 0 &&
                          (selectedServices[0].id_operator ?? 0) !==
                            (svc.id_operator ?? 0) &&
                          !checked;

                        const opName =
                          operators.find(
                            (o) => o.id_operator === svc.id_operator,
                          )?.name || "Operador";

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
                                N° {svc.agency_service_id ?? svc.id_service} ·{" "}
                                {svc.type}
                                {svc.destination ? ` · ${svc.destination}` : ""}
                              </div>
                              <div className="text-xs text-sky-950/70 dark:text-white/70">
                                Operador: <b>{opName}</b> • Moneda:{" "}
                                <b>{(svc.currency || "ARS").toUpperCase()}</b> •
                                Costo:{" "}
                                {formatMoney(
                                  svc.cost_price || 0,
                                  (svc.currency || "ARS").toUpperCase(),
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Píldoras de contexto */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`${pillBase} ${pillNeutral}`}>
                      Seleccionados: {selectedServices.length}
                    </span>
                    <span
                      className={`${pillBase} ${selectedCurrencies.length ? pillOk : pillNeutral}`}
                    >
                      Monedas:{" "}
                      {selectedCurrencies.length
                        ? selectedCurrencies.join(", ")
                        : "—"}
                    </span>
                    {operatorIdFromSelection != null && (
                      <span className={`${pillBase} ${pillNeutral}`}>
                        Operador sugerido: N° {operatorIdFromSelection}
                      </span>
                    )}
                  </div>
                </div>

                {selectedServices.length > 0 &&
                  (action === "create" || selectedPayment) && (
                  <div className="md:col-span-2">
                    <ServiceAllocationsEditor
                      services={selectedServices}
                      paymentCurrency={editorPaymentCurrency}
                      paymentAmount={editorPaymentAmount}
                      resetKey={allocationResetKey}
                      excessAction={excessAction}
                      onExcessActionChange={setExcessAction}
                      excessMissingAccountAction={excessMissingAccountAction}
                      onExcessMissingAccountActionChange={
                        setExcessMissingAccountAction
                      }
                      onSummaryChange={setAllocationSummary}
                    />
                  </div>
                )}
              </Section>

              {action === "attach" && (
                <Section
                  title="Pago existente"
                  desc="Buscá el pago que querés asociar."
                >
                  <Field
                    id="payment_search"
                    label="Buscar pago"
                    hint="Por número, descripción u operador…"
                  >
                    <input
                      id="payment_search"
                      value={paymentQuery}
                      onChange={(e) => setPaymentQuery(e.target.value)}
                      placeholder="Escribí al menos 2 caracteres"
                      className={inputBase}
                      autoComplete="off"
                    />
                  </Field>

                  <div className="md:col-span-2">
                    {loadingPayments ? (
                      <div className="py-2">
                        <Spinner />
                      </div>
                    ) : paymentOptions.length > 0 ? (
                      <div className="max-h-56 overflow-auto rounded-2xl border border-white/10">
                        {paymentOptions.map((opt) => {
                          const active =
                            selectedPayment?.id_investment ===
                            opt.id_investment;
                          const displayId =
                            opt.agency_investment_id ?? opt.id_investment;
                          return (
                            <button
                              key={opt.id_investment}
                              type="button"
                              className={`w-full px-3 py-2 text-left transition hover:bg-white/5 ${
                                active ? "bg-white/10" : ""
                              }`}
                              onClick={() => setSelectedPayment(opt)}
                            >
                              <div className="text-sm font-medium">
                                N° {displayId} ·{" "}
                                {opt.operator_name || "Operador"} ·{" "}
                                {formatMoney(opt.amount, opt.currency)}
                              </div>
                              <div className="text-xs text-sky-950/70 dark:text-white/70">
                                {opt.description}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : paymentQuery && paymentQuery.length >= 2 ? (
                      <p className="text-sm text-sky-950/70 dark:text-white/70">
                        Sin resultados.
                      </p>
                    ) : null}
                  </div>

                  {selectedPayment && (
                    <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-xs md:col-span-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          Pago N°{" "}
                          {selectedPayment.agency_investment_id ??
                            selectedPayment.id_investment}
                        </span>
                        <span className="opacity-70">
                          {selectedPayment.operator_name || "Operador"}
                        </span>
                        <span className="opacity-70">
                          {formatMoney(
                            selectedPayment.amount,
                            selectedPayment.currency,
                          )}
                        </span>
                      </div>
                      {selectedPayment.serviceIds &&
                        selectedPayment.serviceIds.length > 0 && (
                          <p className="mt-1 text-amber-300">
                            Este pago ya tiene servicios asociados. Al guardar
                            se reemplazarán.
                          </p>
                        )}
                    </div>
                  )}
                </Section>
              )}

              {/* PAGO: categoría / operador / crédito */}
              {action === "create" && (
                <Section
                  title="Pago"
                  desc="Definí categoría y operador."
                >
                  <Field id="category" label="Categoría" required>
                    {loadingPicks ? (
                      <div className="flex h-[42px] items-center">
                        <Spinner />
                      </div>
                    ) : (
                      <select
                        id="category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={`${inputBase} cursor-pointer appearance-none`}
                        required
                        disabled={operatorCategories.length === 0}
                      >
                        <option value="" disabled>
                          {operatorCategories.length
                            ? "Seleccionar…"
                            : "Sin categorías de Operador"}
                        </option>
                        {operatorCategories.map((c) => (
                          <option key={c.id_category} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>

                  <Field id="operator" label="Operador" required>
                    <select
                      id="operator"
                      value={operatorId}
                      onChange={(e) =>
                        setOperatorId(
                          e.target.value ? Number(e.target.value) : "",
                        )
                      }
                      className={`${inputBase} cursor-pointer appearance-none`}
                      required
                    >
                      <option value="" disabled>
                        Seleccionar operador…
                      </option>
                      {operators.map((o) => (
                        <option key={o.id_operator} value={o.id_operator}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    {selectedServices.length > 0 &&
                      operatorIdFromSelection == null && (
                        <p className="ml-1 mt-1 text-xs opacity-70">
                          Seleccionaste servicios de operadores distintos. Elegí
                          uno manualmente.
                        </p>
                      )}
                  </Field>

                  <div />
                </Section>
              )}

              {/* IMPORTE / MONEDA */}
              {action === "create" && (
                <Section
                  title="Importe y moneda"
                  desc="Cuánto le pagás al operador y en qué divisa."
                >
                  <Field id="amount" label="Monto" required>
                    <input
                      id="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      className={inputBase}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                    {previewAmount && (
                      <p className="ml-1 mt-1 text-xs opacity-80">
                        {previewAmount}
                      </p>
                    )}
                    {selectedServices.length > 0 && allSameCurrency && (
                      <button
                        type="button"
                        onClick={useSuggested}
                        className="mt-2 text-xs underline underline-offset-2"
                      >
                        Usar suma de costos:{" "}
                        {formatMoney(
                          suggestedAmount,
                          (
                            lockedSvcCurrency ||
                            currency ||
                            "ARS"
                          ).toUpperCase(),
                        )}
                      </button>
                    )}
                  </Field>

                  <Field id="currency" label="Moneda" required>
                    {loadingPicks ? (
                      <div className="flex h-[42px] items-center">
                        <Spinner />
                      </div>
                    ) : (
                      <select
                        id="currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className={`${inputBase} cursor-pointer appearance-none`}
                        required
                        disabled={currencyOptions.length === 0}
                      >
                        <option value="" disabled>
                          {currencyOptions.length
                            ? "Seleccionar moneda"
                            : "Sin monedas habilitadas"}
                        </option>
                        {currencyOptions.map((code) => (
                          <option key={code} value={code}>
                            {currencyDict[code]
                              ? `${code} — ${currencyDict[code]}`
                              : code}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                </Section>
              )}

              {/* MÉTODO / CUENTA */}
              {action === "create" && (
                <Section
                  title="Forma de pago"
                  desc="Elegí método y, si corresponde, la cuenta."
                >
                  <Field
                    id="payment_method"
                    label="Método de pago"
                    required
                  >
                    {loadingPicks ? (
                      <div className="flex h-[42px] items-center">
                        <Spinner />
                      </div>
                    ) : (
                      <select
                        id="payment_method"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className={`${inputBase} cursor-pointer appearance-none`}
                        required
                        disabled={uiPaymentMethodOptions.length === 0}
                      >
                        <option value="" disabled>
                          {uiPaymentMethodOptions.length
                            ? "Seleccionar método"
                            : "Sin métodos habilitados"}
                        </option>
                        {uiPaymentMethodOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>

                  {requiresAccount ? (
                    <Field id="account" label="Cuenta" required>
                      <select
                        id="account"
                        value={account}
                        onChange={(e) => setAccount(e.target.value)}
                        className={`${inputBase} cursor-pointer appearance-none`}
                        required
                        disabled={accounts.length === 0}
                      >
                        <option value="" disabled>
                          {filteredAccounts.length || accounts.length
                            ? "Seleccionar cuenta"
                            : "Sin cuentas habilitadas"}
                        </option>
                        {(filteredAccounts.length
                          ? filteredAccounts
                          : accounts
                        ).map((a) => {
                          const label = a.display_name || a.name;
                          return (
                            <option key={a.id_account} value={label}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                      {account && (
                        <p className="ml-1 mt-1 text-xs opacity-70">
                          Moneda detectada:{" "}
                          <b>{guessAccountCurrency(account) || "—"}</b>
                        </p>
                      )}
                    </Field>
                  ) : (
                    <div />
                  )}
                </Section>
              )}

              {/* INFO CRÉDITO (si está activo) */}
              {action === "create" &&
                isOperatorCategory(category) &&
                payingWithCredit && (
                  <div
                    className="rounded-2xl border border-white/10 bg-white/10 p-3 text-xs md:col-span-2"
                    role="status"
                    aria-live="polite"
                  >
                    {!operatorId || !currency ? (
                      <p>
                        Elegí operador y moneda para validar la cuenta de
                        crédito.
                      </p>
                    ) : creditAccStatus === "checking" ? (
                      <div className="flex items-center gap-2">
                        <Spinner />
                        <span>
                          Verificando cuenta en {String(currency).toUpperCase()}
                          …
                        </span>
                      </div>
                    ) : creditAccStatus === "exists" ? (
                      <p className="text-emerald-400">
                        ✓ Existe una cuenta de crédito en{" "}
                        {String(currency).toUpperCase()} para este operador.
                      </p>
                    ) : creditAccStatus === "creating" ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-amber-300">
                          Creando cuenta de crédito en{" "}
                          {String(currency).toUpperCase()}…
                        </span>
                        <button
                          type="button"
                          className="rounded-full bg-sky-100 px-3 py-1 text-sky-950 shadow-sm dark:bg-white/10 dark:text-white"
                          disabled
                        >
                          <Spinner />
                        </button>
                      </div>
                    ) : creditAccStatus === "missing" ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-amber-300">
                          No existe cuenta de crédito en{" "}
                          {String(currency).toUpperCase()} para este operador.
                        </span>
                        <button
                          type="button"
                          onClick={handleCreateCreditAccount}
                          className="rounded-full bg-sky-100 px-3 py-1 text-sky-950 shadow-sm dark:bg-white/10 dark:text-white"
                        >
                          {`Crear cuenta ${String(currency).toUpperCase()}`}
                        </button>
                      </div>
                    ) : creditAccStatus === "error" ? (
                      <p className="text-rose-400">
                        No se pudo verificar: {creditAccMsg}
                      </p>
                    ) : null}
                  </div>
                )}

              {/* CONVERSIÓN */}
              {action === "create" && (
                <Section
                  title="Conversión (opcional)"
                  desc="Registra valor/contravalor (sin tipo de cambio) si el acuerdo está en otra divisa."
                >
                  <Field id="base" label="Valor base">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        className={inputBase}
                        placeholder="0.00"
                        value={baseAmount}
                        onChange={(e) => {
                          setUseConversion(true);
                          setBaseAmount(e.target.value);
                        }}
                      />
                      <select
                        className={`${inputBase} cursor-pointer appearance-none`}
                        value={baseCurrency}
                        onChange={(e) => {
                          setUseConversion(true);
                          setBaseCurrency(e.target.value);
                        }}
                        disabled={currencyOptions.length === 0}
                      >
                        <option value="" disabled>
                          {currencyOptions.length ? "Moneda" : "Sin monedas"}
                        </option>
                        {currencyOptions.map((code) => (
                          <option key={`bc-${code}`} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </div>
                    {useConversion && previewBase && (
                      <div className="ml-1 mt-1 text-xs opacity-70">
                        {previewBase}
                      </div>
                    )}
                  </Field>

                  <Field id="counter" label="Contravalor">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        className={inputBase}
                        placeholder="0.00"
                        value={counterAmount}
                        onChange={(e) => {
                          setUseConversion(true);
                          setCounterAmount(e.target.value);
                        }}
                      />
                      <select
                        className={`${inputBase} cursor-pointer appearance-none`}
                        value={counterCurrency}
                        onChange={(e) => {
                          setUseConversion(true);
                          setCounterCurrency(e.target.value);
                        }}
                        disabled={currencyOptions.length === 0}
                      >
                        <option value="" disabled>
                          {currencyOptions.length ? "Moneda" : "Sin monedas"}
                        </option>
                        {currencyOptions.map((code) => (
                          <option key={`cc-${code}`} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </div>
                    {useConversion && previewCounter && (
                      <div className="ml-1 mt-1 text-xs opacity-70">
                        {previewCounter}
                      </div>
                    )}
                  </Field>

                  <div className="text-xs opacity-70 md:col-span-2">
                    Se guarda el valor y contravalor <b>sin tipo de cambio</b>.
                    Útil si pagás en una moneda pero el acuerdo está en otra.
                  </div>
                </Section>
              )}

              {/* FECHA + DESCRIPCIÓN */}
              {action === "create" && (
                <Section title="Fecha y detalle">
                  <Field id="paid_at" label="Fecha de pago">
                    <input
                      id="paid_at"
                      type="date"
                      value={paidAt}
                      onChange={(e) => setPaidAt(e.target.value)}
                      className={`${inputBase} cursor-pointer`}
                    />
                  </Field>

                  <Field id="desc" label="Descripción" required>
                    <input
                      id="desc"
                      className={inputBase}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Concepto / detalle del pago…"
                      required
                    />
                  </Field>
                </Section>
              )}

              {/* ACTION BAR */}
              <div className="sticky bottom-2 z-10 flex justify-end gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className={`rounded-full px-6 py-2 shadow-sm shadow-sky-950/20 transition active:scale-[0.98] ${
                    loading
                      ? "cursor-not-allowed bg-sky-950/20 text-white/60 dark:bg-white/5 dark:text-white/40"
                      : "bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
                  }`}
                  aria-label="Cargar pago al operador"
                >
                  {loading ? (
                    <Spinner />
                  ) : action === "attach" ? (
                    "Asociar pago"
                  ) : (
                    "Cargar pago"
                  )}
                </button>

                {action === "create" && (
                  <button
                    type="button"
                    onClick={useSuggested}
                    disabled={selectedServices.length === 0}
                    className="rounded-full bg-sky-950/10 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition active:scale-[0.98] disabled:opacity-50 dark:bg-white/10 dark:text-white"
                    title="Usar sugeridos"
                  >
                    Usar sugeridos
                  </button>
                )}
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
