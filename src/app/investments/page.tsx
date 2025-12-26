// src/app/investments/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { loadFinancePicks } from "@/utils/loadFinancePicks";
import InvestmentsForm from "./InvestmentsForm";
import InvestmentsList from "./InvestmentsList";
import type {
  Investment,
  InvestmentFormState,
  Operator,
  RecurringFormState,
  RecurringInvestment,
  User,
} from "./types";

/* ================= Helpers ================= */
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

/* ==== Role helpers (cookie-first) ==== */
type Role =
  | "desarrollador"
  | "gerente"
  | "equipo"
  | "vendedor"
  | "administrativo"
  | "marketing";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${encodeURIComponent(name)}=`));
  return row ? decodeURIComponent(row.split("=")[1] || "") : null;
}

function normalizeRole(raw: unknown): Role | "" {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "";
  if (["admin", "administrador", "administrativa"].includes(s))
    return "administrativo";
  if (["dev", "developer"].includes(s)) return "desarrollador";
  return (
    [
      "desarrollador",
      "gerente",
      "equipo",
      "vendedor",
      "administrativo",
      "marketing",
    ] as const
  ).includes(s as Role)
    ? (s as Role)
    : "";
}

function readRoleFromCookie(): Role | "" {
  return normalizeRole(getCookie("role"));
}

const CREDIT_METHOD = "Crédito operador";

/* ==== Type guards para evitar any en parseos ==== */
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

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

    if (id && name) out.push({ id_category: id, name, enabled });
  }
  return out;
}

type ListResponse = { items: Investment[]; nextCursor: number | null };
type ApiError = { error?: string; message?: string };

/* ===== Finance config ===== */
type FinanceAccount = { id_account: number; name: string; enabled: boolean };
type FinanceMethod = {
  id_method: number;
  name: string;
  enabled: boolean;
  requires_account?: boolean | null;
};
type FinanceCurrency = { code: string; name: string; enabled: boolean };
type FinanceCategory = { id_category: number; name: string; enabled: boolean };

type FinanceConfig = {
  accounts: FinanceAccount[];
  paymentMethods: FinanceMethod[];
  currencies: FinanceCurrency[];
  categories?: FinanceCategory[];
};

/* ==== Debounce simple ==== */
function useDebounced<T>(value: T, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/* ==== Componente ==== */
export default function Page() {
  const { token } = useAuth() as { token?: string | null };

  // ------- Role cookie-first -------
  const [role, setRole] = useState<Role | "">("");

  // ------- UI / form state -------
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // auxiliares (selects)
  const [users, setUsers] = useState<User[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [agencyId, setAgencyId] = useState<number | null>(null);

  // Finance config
  const [finance, setFinance] = useState<FinanceConfig | null>(null);

  // lista
  const [items, setItems] = useState<Investment[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // gastos automáticos
  const [recurring, setRecurring] = useState<RecurringInvestment[]>([]);
  const [loadingRecurring, setLoadingRecurring] = useState(false);
  const [savingRecurring, setSavingRecurring] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringEditingId, setRecurringEditingId] = useState<number | null>(
    null,
  );

  // filtros
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [operatorFilter, setOperatorFilter] = useState<number>(0);
  const debouncedQ = useDebounced(q, 400);

  const [viewMode, setViewMode] = useState<"cards" | "table" | "monthly">(
    "cards",
  );

  // Filtro local: Operador / Otros / Todos
  const [operadorMode, setOperadorMode] = useState<"all" | "only" | "others">(
    "all",
  );

  // form (sin defaults duros)
  const [form, setForm] = useState<InvestmentFormState>({
    category: "",
    description: "",
    amount: "",
    currency: "",
    paid_at: "",
    user_id: null,
    operator_id: null,
    paid_today: false,

    payment_method: "",
    account: "",

    use_conversion: false,
    base_amount: "",
    base_currency: "",
    counter_amount: "",
    counter_currency: "",

    use_credit: false,
  });

  const [recurringForm, setRecurringForm] = useState<RecurringFormState>({
    category: "",
    description: "",
    amount: "",
    currency: "",
    start_date: todayISO(),
    day_of_month: "1",
    interval_months: "1",
    user_id: null,
    operator_id: null,
    active: true,

    payment_method: "",
    account: "",

    use_conversion: false,
    base_amount: "",
    base_currency: "",
    counter_amount: "",
    counter_currency: "",

    use_credit: false,
  });

  // edición
  const [editingId, setEditingId] = useState<number | null>(null);

  // ==== Helpers de sincronización de cuenta corriente (fuera de onSubmit)
  const fetchLinkedCreditIds = useCallback(
    async (invId: number): Promise<number[]> => {
      if (!token) return [];
      const res = await authFetch(
        // sin doc_type, y con un take grande por las dudas
        `/api/credit/entry?investment_id=${invId}&take=500`,
        { cache: "no-store" },
        token,
      );
      if (!res.ok) return [];
      const data = (await safeJson<{ items: { id_entry: number }[] }>(res)) ?? {
        items: [],
      };
      return (data.items || []).map((i) => i.id_entry);
    },
    [token],
  );

  const deleteLinkedCreditEntries = useCallback(
    async (invId: number): Promise<number> => {
      if (!token) return 0;
      const ids = await fetchLinkedCreditIds(invId);
      let ok = 0;
      for (const id of ids) {
        const del = await authFetch(
          `/api/credit/entry/${id}?allowLinked=1`,
          { method: "DELETE" },
          token,
        );
        if (del.ok) ok++;
      }
      return ok;
    },
    [token, fetchLinkedCreditIds],
  );

  const createCreditEntryForInvestment = useCallback(
    async (inv: Investment) => {
      if (!token) return;
      if (norm(inv.category) !== "operador" || !inv.operator_id) return;

      const payload = {
        subject_type: "OPERATOR",
        operator_id: Number(inv.operator_id),
        currency: (inv.currency || "").toUpperCase(),
        amount: Math.abs(Number(inv.amount || 0)), // la API aplica el signo por doc_type
        concept: inv.description || `Gasto Operador #${inv.id_investment}`,
        doc_type: "investment",
        investment_id: inv.id_investment,
        value_date: inv.paid_at ? inv.paid_at.slice(0, 10) : undefined,
        reference: `INV-${inv.id_investment}`,
      };

      await authFetch(
        `/api/credit/entry`,
        { method: "POST", body: JSON.stringify(payload) },
        token,
      );
    },
    [token],
  );

  const syncCreditEntry = useCallback(
    async (inv: Investment, wantCredit: boolean) => {
      const removed = await deleteLinkedCreditEntries(inv.id_investment);
      if (removed > 0) {
        toast.info(
          `Se eliminaron ${removed} movimiento(s) vinculado(s) a la cuenta corriente.`,
        );
      }
      if (wantCredit) {
        await createCreditEntryForInvestment(inv);
        toast.success("Movimiento de cuenta corriente sincronizado.");
      }
    },
    [deleteLinkedCreditEntries, createCreditEntryForInvestment],
  );

  function resetForm() {
    setForm({
      category: "",
      description: "",
      amount: "",
      currency: "",
      paid_at: "",
      user_id: null,
      operator_id: null,
      paid_today: false,

      payment_method: "",
      account: "",

      use_conversion: false,
      base_amount: "",
      base_currency: "",
      counter_amount: "",
      counter_currency: "",

      use_credit: false,
    });
    setEditingId(null);
  }

  function resetRecurringForm() {
    setRecurringForm({
      category: "",
      description: "",
      amount: "",
      currency: "",
      start_date: todayISO(),
      day_of_month: "1",
      interval_months: "1",
      user_id: null,
      operator_id: null,
      active: true,

      payment_method: "",
      account: "",

      use_conversion: false,
      base_amount: "",
      base_currency: "",
      counter_amount: "",
      counter_currency: "",

      use_credit: false,
    });
    setRecurringEditingId(null);
  }

  function beginEdit(inv: Investment) {
    setForm({
      category: inv.category ?? "",
      description: inv.description ?? "",
      amount: String(inv.amount ?? ""),
      currency: (inv.currency ?? "").toUpperCase(),
      paid_at: inv.paid_at ? inv.paid_at.slice(0, 10) : "",
      user_id: inv.user_id ?? null,
      operator_id: inv.operator_id ?? null,
      paid_today: false,

      payment_method: inv.payment_method ?? "",
      account: inv.account ?? "",

      use_conversion:
        !!inv.base_amount ||
        !!inv.base_currency ||
        !!inv.counter_amount ||
        !!inv.counter_currency,
      base_amount: inv.base_amount != null ? String(inv.base_amount) : "",
      base_currency: (inv.base_currency ?? "").toUpperCase(),
      counter_amount:
        inv.counter_amount != null ? String(inv.counter_amount) : "",
      counter_currency: (inv.counter_currency ?? "").toUpperCase(),

      use_credit: false, // no agregar crédito automáticamente al editar salvo que el usuario tildé
    });
    setEditingId(inv.id_investment);
    setIsFormOpen(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function beginRecurringEdit(rule: RecurringInvestment) {
    setRecurringForm({
      category: rule.category ?? "",
      description: rule.description ?? "",
      amount: String(rule.amount ?? ""),
      currency: (rule.currency ?? "").toUpperCase(),
      start_date: rule.start_date ? rule.start_date.slice(0, 10) : todayISO(),
      day_of_month: String(rule.day_of_month ?? 1),
      interval_months: String(rule.interval_months ?? 1),
      user_id: rule.user_id ?? null,
      operator_id: rule.operator_id ?? null,
      active: rule.active ?? true,

      payment_method: rule.payment_method ?? "",
      account: rule.account ?? "",

      use_conversion:
        !!rule.base_amount ||
        !!rule.base_currency ||
        !!rule.counter_amount ||
        !!rule.counter_currency,
      base_amount: rule.base_amount != null ? String(rule.base_amount) : "",
      base_currency: (rule.base_currency ?? "").toUpperCase(),
      counter_amount:
        rule.counter_amount != null ? String(rule.counter_amount) : "",
      counter_currency: (rule.counter_currency ?? "").toUpperCase(),

      use_credit:
        norm(rule.category) === "operador" &&
        rule.payment_method === CREDIT_METHOD,
    });
    setRecurringEditingId(rule.id_recurring);
    setRecurringOpen(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function deleteCurrent() {
    if (!editingId || !token) return;
    try {
      // 1) borrar entries vinculados ANTES de eliminar el gasto
      const removed = await deleteLinkedCreditEntries(editingId);
      if (removed) {
        toast.info(
          `Se eliminaron ${removed} movimiento(s) de cuenta corriente asociado(s).`,
        );
      }

      // 2) ahora sí, eliminar el gasto
      const res = await authFetch(
        `/api/investments/${editingId}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        const body = (await safeJson<ApiError>(res)) ?? {};
        throw new Error(body.error || "No se pudo eliminar el gasto");
      }

      setItems((prev) => prev.filter((i) => i.id_investment !== editingId));
      toast.success("Gasto eliminado");
      resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  async function deleteRecurring(id: number) {
    if (!token) return;
    try {
      const res = await authFetch(
        `/api/investments/recurring/${id}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok && res.status !== 204) {
        const body = (await safeJson<ApiError>(res)) ?? {};
        throw new Error(body.error || "No se pudo eliminar el automático");
      }
      setRecurring((prev) => prev.filter((r) => r.id_recurring !== id));
      if (recurringEditingId === id) {
        resetRecurringForm();
      }
      toast.success("Gasto automático eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  async function toggleRecurringActive(rule: RecurringInvestment) {
    if (!token) return;
    setSavingRecurring(true);
    try {
      const payload = {
        category: rule.category,
        description: rule.description,
        amount: rule.amount,
        currency: rule.currency,
        start_date: rule.start_date?.slice(0, 10) || todayISO(),
        day_of_month: rule.day_of_month,
        interval_months: rule.interval_months,
        active: !rule.active,
        user_id: rule.user_id ?? undefined,
        operator_id: rule.operator_id ?? undefined,
        payment_method: rule.payment_method ?? "",
        account: rule.account ?? "",
        base_amount: rule.base_amount ?? undefined,
        base_currency: rule.base_currency ?? undefined,
        counter_amount: rule.counter_amount ?? undefined,
        counter_currency: rule.counter_currency ?? undefined,
      };

      const res = await authFetch(
        `/api/investments/recurring/${rule.id_recurring}`,
        { method: "PUT", body: JSON.stringify(payload) },
        token,
      );
      if (!res.ok) {
        const body = (await safeJson<ApiError>(res)) ?? {};
        throw new Error(body.error || "No se pudo actualizar el automático");
      }
      const updated = (await safeJson<RecurringInvestment>(res))!;
      setRecurring((prev) =>
        prev.map((it) =>
          it.id_recurring === updated.id_recurring ? updated : it,
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setSavingRecurring(false);
    }
  }

  /* ========= Finance + perfil + users + operators: pipeline secuencial ========= */
  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();

    (async () => {
      try {
        // 1) Picks (cuentas / métodos / monedas)
        let categories: FinanceCategory[] | undefined = undefined;
        const picks = await loadFinancePicks(token);
        if (ac.signal.aborted) return;

        // 2) Categorías
        try {
          const catsRes = await authFetch(
            "/api/finance/categories",
            { cache: "no-store", signal: ac.signal },
            token,
          );
          if (catsRes.ok) {
            const raw = (await safeJson<unknown>(catsRes)) ?? null;
            const cats = parseCategories(raw);
            if (cats.length) categories = cats;
          }
        } catch {
          // silencioso
        }

        setFinance({
          accounts: picks.accounts,
          paymentMethods: picks.paymentMethods,
          currencies: picks.currencies,
          categories,
        });
        if (ac.signal.aborted) return;

        // 3) Perfil (agencyId)
        try {
          const pr = await authFetch(
            "/api/user/profile",
            { cache: "no-store", signal: ac.signal },
            token,
          );
          if (pr.ok) {
            const p = await safeJson<{ id_agency?: number }>(pr);
            setAgencyId(p?.id_agency ?? null);
          }
        } catch {
          // silencioso
        }
        if (ac.signal.aborted) return;

        // 4) Users
        try {
          const u = await authFetch(
            "/api/users",
            { cache: "no-store", signal: ac.signal },
            token,
          );
          if (u.ok) {
            const list = (await safeJson<User[]>(u)) ?? [];
            setUsers(Array.isArray(list) ? list : []);
          }
        } catch {
          // silencioso
        }
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") setFinance(null);
      }
    })();

    return () => ac.abort();
  }, [token]);

  /* ========= Operadores por agencia ========= */
  useEffect(() => {
    if (!token || agencyId == null) return;
    const ac = new AbortController();

    (async () => {
      try {
        const o = await authFetch(
          `/api/operators?agencyId=${agencyId}`,
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (o.ok) {
          const list = (await safeJson<Operator[]>(o)) ?? [];
          setOperators(Array.isArray(list) ? list : []);
        } else {
          setOperators([]);
        }
      } catch {
        setOperators([]);
      }
    })();

    return () => ac.abort();
  }, [token, agencyId]);

  /* ========= Role: cookie → /api/role → /api/user/profile ========= */
  useEffect(() => {
    if (!token) return;

    const fromCookie = readRoleFromCookie();
    if (fromCookie) {
      setRole(fromCookie);
      return;
    }

    const ac = new AbortController();
    (async () => {
      try {
        let value: Role | "" = "";
        const r = await authFetch(
          "/api/role",
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (r.ok) {
          const data = await r.json();
          value = normalizeRole((data as { role?: unknown })?.role);
        } else if (r.status === 404) {
          const p = await authFetch(
            "/api/user/profile",
            { cache: "no-store", signal: ac.signal },
            token,
          );
          if (p.ok) {
            const j = await p.json();
            value = normalizeRole((j as { role?: unknown })?.role);
          }
        }
        setRole(value);
      } catch {
        // silencioso
      }
    })();

    const onFocus = () => {
      const cookieRole = readRoleFromCookie();
      if ((cookieRole || "") !== (role || "")) setRole(cookieRole);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      ac.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [token, role]);

  /* ========= Lista con abort/race-safe ========= */
  const listAbortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  const buildQuery = useCallback(
    (cursor?: number | null) => {
      const qs = new URLSearchParams();
      if (debouncedQ.trim()) qs.append("q", debouncedQ.trim());
      if (category) qs.append("category", category);
      if (currency) qs.append("currency", currency);
      if (paymentMethodFilter) qs.append("payment_method", paymentMethodFilter);
      if (accountFilter) qs.append("account", accountFilter);
      qs.append("take", "24");
      if (cursor != null) qs.append("cursor", String(cursor));
      return qs.toString();
    },
    [debouncedQ, category, currency, paymentMethodFilter, accountFilter],
  );

  const fetchRecurring = useCallback(async () => {
    if (!token) return;
    setLoadingRecurring(true);
    try {
      const res = await authFetch(
        "/api/investments/recurring",
        { cache: "no-store" },
        token,
      );
      if (!res.ok) throw new Error("No se pudo obtener los automáticos");
      const data = (await safeJson<RecurringInvestment[]>(res)) ?? [];
      setRecurring(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setRecurring([]);
    } finally {
      setLoadingRecurring(false);
    }
  }, [token]);

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);

    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const myId = ++reqIdRef.current;

    try {
      const res = await authFetch(
        `/api/investments?${buildQuery()}`,
        { cache: "no-store", signal: controller.signal },
        token,
      );
      if (!res.ok) throw new Error("No se pudo obtener la lista");
      const data = (await safeJson<ListResponse>(res)) ?? {
        items: [],
        nextCursor: null,
      };
      if (myId !== reqIdRef.current) return;
      setItems(data.items);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      console.error(e);
      toast.error("Error cargando gastos");
      setItems([]);
      setNextCursor(null);
    } finally {
      if (!controller.signal.aborted) setLoadingList(false);
    }
  }, [buildQuery, token]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchRecurring();
  }, [fetchRecurring]);

  const loadMore = useCallback(async () => {
    if (!token || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await authFetch(
        `/api/investments?${buildQuery(nextCursor)}`,
        { cache: "no-store" },
        token,
      );
      if (!res.ok) throw new Error("No se pudieron cargar más");
      const data = (await safeJson<ListResponse>(res)) ?? {
        items: [],
        nextCursor: null,
      };
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      console.error(e);
      toast.error("No se pudieron cargar más registros");
    } finally {
      setLoadingMore(false);
    }
  }, [token, nextCursor, loadingMore, buildQuery]);

  /* ========= Opciones desde Finance (sin fallbacks) ========= */
  const categoryOptions = useMemo(() => {
    const raw =
      finance?.categories?.filter((c) => c.enabled).map((c) => c.name) ?? [];
    return uniqSorted(raw);
  }, [finance?.categories]);

  const paymentMethodOptions = useMemo(
    () =>
      uniqSorted(
        finance?.paymentMethods?.filter((m) => m.enabled).map((m) => m.name) ??
          [],
      ),
    [finance?.paymentMethods],
  );

  // Si está activo "usar crédito" en categoría Operador, inyectamos el método virtual
  const uiPaymentMethodOptions = useMemo(() => {
    const needCredit = norm(form.category) === "operador" && form.use_credit;
    return needCredit
      ? uniqSorted([...paymentMethodOptions, CREDIT_METHOD])
      : paymentMethodOptions;
  }, [paymentMethodOptions, form.use_credit, form.category]);

  const recurringPaymentMethodOptions = useMemo(() => {
    const needCredit =
      norm(recurringForm.category) === "operador" && recurringForm.use_credit;
    return needCredit
      ? uniqSorted([...paymentMethodOptions, CREDIT_METHOD])
      : paymentMethodOptions;
  }, [paymentMethodOptions, recurringForm.use_credit, recurringForm.category]);

  const requiresAccountMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const m of finance?.paymentMethods || []) {
      if (!m.enabled) continue;
      map.set(norm(m.name), !!m.requires_account);
    }
    // 👇 El método de crédito NUNCA requiere cuenta
    map.set(norm(CREDIT_METHOD), false);
    return map;
  }, [finance?.paymentMethods]);

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

  const currencyDict = useMemo(() => {
    const d: Record<string, string> = {};
    for (const c of finance?.currencies || []) {
      if (c.enabled) d[c.code.toUpperCase()] = c.name;
    }
    return d;
  }, [finance?.currencies]);

  const dayOptions = useMemo(
    () => Array.from({ length: 31 }, (_, i) => i + 1),
    [],
  );

  const intervalOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1),
    [],
  );

  const showAccount = useMemo(() => {
    if (!form.payment_method) return false;
    return !!requiresAccountMap.get(norm(form.payment_method));
  }, [form.payment_method, requiresAccountMap]);

  const showRecurringAccount = useMemo(() => {
    if (!recurringForm.payment_method) return false;
    return !!requiresAccountMap.get(norm(recurringForm.payment_method));
  }, [recurringForm.payment_method, requiresAccountMap]);

  /* ========= Validación de conversión ========= */
  const validateConversion = (): { ok: boolean; msg?: string } => {
    if (!form.use_conversion) return { ok: true };
    const bAmt = Number(form.base_amount);
    const cAmt = Number(form.counter_amount);
    if (!Number.isFinite(bAmt) || bAmt <= 0)
      return { ok: false, msg: "Ingresá un Valor base válido (> 0)." };
    if (!form.base_currency)
      return { ok: false, msg: "Elegí la moneda del Valor base." };
    if (!Number.isFinite(cAmt) || cAmt <= 0)
      return { ok: false, msg: "Ingresá un Contravalor válido (> 0)." };
    if (!form.counter_currency)
      return { ok: false, msg: "Elegí la moneda del Contravalor." };
    return { ok: true };
  };

  const validateRecurringConversion = (): { ok: boolean; msg?: string } => {
    if (!recurringForm.use_conversion) return { ok: true };
    const bAmt = Number(recurringForm.base_amount);
    const cAmt = Number(recurringForm.counter_amount);
    if (!Number.isFinite(bAmt) || bAmt <= 0)
      return { ok: false, msg: "Ingresá un Valor base válido (> 0)." };
    if (!recurringForm.base_currency)
      return { ok: false, msg: "Elegí la moneda del Valor base." };
    if (!Number.isFinite(cAmt) || cAmt <= 0)
      return { ok: false, msg: "Ingresá un Contravalor válido (> 0)." };
    if (!recurringForm.counter_currency)
      return { ok: false, msg: "Elegí la moneda del Contravalor." };
    return { ok: true };
  };

  /* ========= Crear / Actualizar ========= */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const categoryLower = norm(form.category);
    const amountNum = Number(form.amount);

    if (!form.category || !form.description || !form.currency) {
      toast.error("Completá categoría, descripción y moneda");
      return;
    }
    if (categoryLower === "operador" && !form.operator_id) {
      toast.error("Para la categoría OPERADOR, seleccioná un operador");
      return;
    }
    const payingWithCredit =
      norm(form.category) === "operador" && form.use_credit;

    if (!form.payment_method && !payingWithCredit) {
      toast.error("Seleccioná el método de pago");
      return;
    }
    if (showAccount && !form.account && !payingWithCredit) {
      toast.error("Seleccioná la cuenta para este método");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("El monto debe ser un número positivo");
      return;
    }
    if (["sueldo", "comision"].includes(categoryLower) && !form.user_id) {
      toast.error("Para SUELDO/COMISION, seleccioná un usuario");
      return;
    }

    const conv = validateConversion();
    if (!conv.ok) {
      toast.error(conv.msg || "Revisá los datos de Valor/Contravalor");
      return;
    }

    const paid_at =
      form.paid_today && !form.paid_at
        ? new Date().toISOString().slice(0, 10)
        : form.paid_at || undefined;

    const payload: Record<string, unknown> = {
      category: form.category,
      description: form.description,
      amount: amountNum,
      currency: form.currency.toUpperCase(),
      paid_at,
      user_id: form.user_id ?? undefined,
      operator_id: form.operator_id ?? undefined,
      payment_method: payingWithCredit ? CREDIT_METHOD : form.payment_method,
      account: payingWithCredit
        ? undefined
        : showAccount
          ? form.account
          : undefined,
    };

    if (form.use_conversion) {
      const bAmt = Number(form.base_amount);
      const cAmt = Number(form.counter_amount);
      payload.base_amount =
        Number.isFinite(bAmt) && bAmt > 0 ? bAmt : undefined;
      payload.base_currency = form.base_currency || undefined;
      payload.counter_amount =
        Number.isFinite(cAmt) && cAmt > 0 ? cAmt : undefined;
      payload.counter_currency = form.counter_currency || undefined;
    }

    setLoading(true);
    try {
      let created: Investment | null = null;

      if (!editingId) {
        const res = await authFetch(
          "/api/investments",
          { method: "POST", body: JSON.stringify(payload) },
          token || undefined,
        );
        if (!res.ok) {
          const body = (await safeJson<ApiError>(res)) ?? {};
          throw new Error(body.error || "No se pudo crear el gasto");
        }
        created = await safeJson<Investment>(res);
        if (created) {
          setItems((prev) => [created as Investment, ...prev]);
        } else {
          await fetchList();
        }
        toast.success("Gasto cargado");
      } else {
        const res = await authFetch(
          `/api/investments/${editingId}`,
          { method: "PUT", body: JSON.stringify(payload) },
          token || undefined,
        );
        if (!res.ok) {
          const body = (await safeJson<ApiError>(res)) ?? {};
          throw new Error(body.error || "No se pudo actualizar el gasto");
        }
        const updated = (await safeJson<Investment>(res))!;
        setItems((prev) =>
          prev.map((it) =>
            it.id_investment === updated.id_investment ? updated : it,
          ),
        );
        toast.success("Gasto actualizado");

        // 👇 Ya no llamamos a syncCreditEntry en edición (lo maneja el backend)
        resetForm();
      }

      // ==== SYNC con cuenta corriente del Operador (sin helpers duplicados, sin doble POST)
      try {
        if (created) {
          const wantCredit =
            norm(created.category) === "operador" &&
            !!created.operator_id &&
            form.use_credit;
          await syncCreditEntry(created, wantCredit);
        }
      } catch {
        toast.error("No se pudo sincronizar la cuenta corriente del Operador.");
      }

      resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const categoryLower = norm(recurringForm.category);
    const amountNum = Number(recurringForm.amount);
    const dayNum = Number(recurringForm.day_of_month);
    const intervalNum = Number(recurringForm.interval_months);

    if (!recurringForm.category || !recurringForm.description) {
      toast.error("Completá categoría y descripción");
      return;
    }
    if (!recurringForm.currency) {
      toast.error("Elegí la moneda");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("El monto debe ser un número positivo");
      return;
    }
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
      toast.error("El día del mes debe estar entre 1 y 31");
      return;
    }
    if (!Number.isFinite(intervalNum) || intervalNum < 1 || intervalNum > 12) {
      toast.error("El intervalo debe ser entre 1 y 12 meses");
      return;
    }
    if (categoryLower === "operador" && !recurringForm.operator_id) {
      toast.error("Para la categoría OPERADOR, seleccioná un operador");
      return;
    }
    if (
      ["sueldo", "comision"].includes(categoryLower) &&
      !recurringForm.user_id
    ) {
      toast.error("Para SUELDO/COMISION, seleccioná un usuario");
      return;
    }

    const payingWithCredit =
      norm(recurringForm.category) === "operador" && recurringForm.use_credit;

    if (!recurringForm.payment_method && !payingWithCredit) {
      toast.error("Seleccioná el método de pago");
      return;
    }
    if (showRecurringAccount && !recurringForm.account && !payingWithCredit) {
      toast.error("Seleccioná la cuenta para este método");
      return;
    }

    const conv = validateRecurringConversion();
    if (!conv.ok) {
      toast.error(conv.msg || "Revisá los datos de Valor/Contravalor");
      return;
    }

    const payload: Record<string, unknown> = {
      category: recurringForm.category,
      description: recurringForm.description,
      amount: amountNum,
      currency: recurringForm.currency.toUpperCase(),
      start_date: recurringForm.start_date || todayISO(),
      day_of_month: dayNum,
      interval_months: intervalNum,
      active: recurringForm.active,
      user_id: recurringForm.user_id ?? undefined,
      operator_id: recurringForm.operator_id ?? undefined,
      payment_method: payingWithCredit
        ? CREDIT_METHOD
        : recurringForm.payment_method,
      account: payingWithCredit
        ? undefined
        : showRecurringAccount
          ? recurringForm.account
          : undefined,
    };

    if (recurringForm.use_conversion) {
      const bAmt = Number(recurringForm.base_amount);
      const cAmt = Number(recurringForm.counter_amount);
      payload.base_amount =
        Number.isFinite(bAmt) && bAmt > 0 ? bAmt : undefined;
      payload.base_currency = recurringForm.base_currency || undefined;
      payload.counter_amount =
        Number.isFinite(cAmt) && cAmt > 0 ? cAmt : undefined;
      payload.counter_currency = recurringForm.counter_currency || undefined;
    }

    setSavingRecurring(true);
    try {
      if (!recurringEditingId) {
        const res = await authFetch(
          "/api/investments/recurring",
          { method: "POST", body: JSON.stringify(payload) },
          token,
        );
        if (!res.ok) {
          const body = (await safeJson<ApiError>(res)) ?? {};
          throw new Error(body.error || "No se pudo crear el gasto automático");
        }
        const created = await safeJson<RecurringInvestment>(res);
        if (created) {
          setRecurring((prev) => [created, ...prev]);
        } else {
          await fetchRecurring();
        }
        toast.success("Gasto automático guardado");
      } else {
        const res = await authFetch(
          `/api/investments/recurring/${recurringEditingId}`,
          { method: "PUT", body: JSON.stringify(payload) },
          token,
        );
        if (!res.ok) {
          const body = (await safeJson<ApiError>(res)) ?? {};
          throw new Error(body.error || "No se pudo actualizar el automático");
        }
        const updated = (await safeJson<RecurringInvestment>(res))!;
        setRecurring((prev) =>
          prev.map((it) =>
            it.id_recurring === updated.id_recurring ? updated : it,
          ),
        );
        toast.success("Gasto automático actualizado");
      }

      resetRecurringForm();
      setRecurringOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingRecurring(false);
    }
  };

  /* ========= Helpers UI ========= */
  const isOperador = norm(form.category) === "operador";
  const isSueldo = norm(form.category) === "sueldo";
  const isComision = norm(form.category) === "comision";
  const isRecurringOperador = norm(recurringForm.category) === "operador";
  const isRecurringSueldo = norm(recurringForm.category) === "sueldo";
  const isRecurringComision = norm(recurringForm.category) === "comision";

  const pillBase =
    "rounded-full px-3 py-1 text-xs font-medium transition-colors";
  const pillNeutral = "bg-white/30 dark:bg-white/10";
  const pillOk = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  const input =
    "w-full rounded-2xl border border-white/10 bg-white/50 p-2 px-3 shadow-sm shadow-sky-950/10 outline-none placeholder:font-light dark:bg-white/10 dark:text-white";
  const filterControl =
    "cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/60 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/10 outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-200/40 dark:bg-white/10 dark:text-white";
  const filterPanel =
    "rounded-3xl border border-white/10 bg-white/10 p-3 shadow-md shadow-sky-950/10 backdrop-blur dark:bg-white/10";

  const formatDate = (s?: string | null) =>
    s ? new Date(s).toLocaleDateString("es-AR", { timeZone: "UTC" }) : "-";

  const getItemDate = useCallback(
    (it: Investment) => new Date(it.paid_at ?? it.created_at),
    [],
  );

  const formatMonthLabel = useCallback((d: Date) => {
    const label = d.toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric",
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, []);

  const previewAmount = useMemo(() => {
    const n = Number(form.amount);
    if (!Number.isFinite(n)) return "";
    if (!form.currency)
      return n.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: form.currency,
        minimumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${form.currency}`;
    }
  }, [form.amount, form.currency]);

  const previewBase = useMemo(() => {
    const n = Number(form.base_amount);
    if (
      !form.use_conversion ||
      !Number.isFinite(n) ||
      n <= 0 ||
      !form.base_currency
    )
      return "";
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: form.base_currency,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${form.base_currency}`;
    }
  }, [form.use_conversion, form.base_amount, form.base_currency]);

  const previewCounter = useMemo(() => {
    const n = Number(form.counter_amount);
    if (
      !form.use_conversion ||
      !Number.isFinite(n) ||
      n <= 0 ||
      !form.counter_currency
    )
      return "";
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: form.counter_currency,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${form.counter_currency}`;
    }
  }, [form.use_conversion, form.counter_amount, form.counter_currency]);

  const headerPills = useMemo(() => {
    const pills: JSX.Element[] = [];
    if (editingId) {
      pills.push(
        <span key="edit" className={`${pillBase} ${pillOk}`}>
          Editando #{editingId}
        </span>,
      );
    }
    if (form.category) {
      pills.push(
        <span key="cat" className={`${pillBase} ${pillNeutral}`}>
          {form.category}
        </span>,
      );
    }
    if (form.currency) {
      pills.push(
        <span key="cur" className={`${pillBase} ${pillNeutral}`}>
          {form.currency.toUpperCase()}
        </span>,
      );
    }
    if (form.amount) {
      pills.push(
        <span key="amt" className={`${pillBase} ${pillOk}`}>
          {previewAmount || form.amount}
        </span>,
      );
    }
    if (form.payment_method) {
      pills.push(
        <span key="pm" className={`${pillBase} ${pillNeutral}`}>
          {form.payment_method}
        </span>,
      );
    }
    return pills;
  }, [
    editingId,
    form.amount,
    form.category,
    form.currency,
    form.payment_method,
    pillBase,
    pillNeutral,
    pillOk,
    previewAmount,
  ]);

  const previewRecurringAmount = useMemo(() => {
    const n = Number(recurringForm.amount);
    if (!Number.isFinite(n)) return "";
    if (!recurringForm.currency)
      return n.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: recurringForm.currency,
        minimumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${recurringForm.currency}`;
    }
  }, [recurringForm.amount, recurringForm.currency]);

  const previewRecurringBase = useMemo(() => {
    const n = Number(recurringForm.base_amount);
    if (
      !recurringForm.use_conversion ||
      !Number.isFinite(n) ||
      n <= 0 ||
      !recurringForm.base_currency
    )
      return "";
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: recurringForm.base_currency,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${recurringForm.base_currency}`;
    }
  }, [
    recurringForm.use_conversion,
    recurringForm.base_amount,
    recurringForm.base_currency,
  ]);

  const previewRecurringCounter = useMemo(() => {
    const n = Number(recurringForm.counter_amount);
    if (
      !recurringForm.use_conversion ||
      !Number.isFinite(n) ||
      n <= 0 ||
      !recurringForm.counter_currency
    )
      return "";
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: recurringForm.counter_currency,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${recurringForm.counter_currency}`;
    }
  }, [
    recurringForm.use_conversion,
    recurringForm.counter_amount,
    recurringForm.counter_currency,
  ]);

  // Sugerencias SOLO con opciones cargadas
  useEffect(() => {
    if (!form.use_conversion) return;
    setForm((f) => {
      const next = { ...f };
      if (!next.base_amount) next.base_amount = f.amount || "";
      if (!next.base_currency && f.currency) next.base_currency = f.currency;
      if (!next.counter_currency) {
        const other =
          currencyOptions.find(
            (c) => c !== (next.base_currency || f.currency),
          ) || "";
        next.counter_currency = other;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.use_conversion]);

  useEffect(() => {
    if (!form.use_conversion) return;
    setForm((f) => {
      const next = { ...f };
      if (!next.base_currency && f.currency) next.base_currency = f.currency;
      if (!next.base_amount) next.base_amount = f.amount || "";
      if (!next.counter_currency && currencyOptions.length > 0) {
        const other =
          currencyOptions.find(
            (c) => c !== (next.base_currency || f.currency),
          ) || "";
        next.counter_currency = other;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.currency, form.amount]);

  useEffect(() => {
    if (!recurringForm.use_conversion) return;
    setRecurringForm((f) => {
      const next = { ...f };
      if (!next.base_amount) next.base_amount = f.amount || "";
      if (!next.base_currency && f.currency) next.base_currency = f.currency;
      if (!next.counter_currency) {
        const other =
          currencyOptions.find(
            (c) => c !== (next.base_currency || f.currency),
          ) || "";
        next.counter_currency = other;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringForm.use_conversion, currencyOptions]);

  useEffect(() => {
    if (!recurringForm.use_conversion) return;
    setRecurringForm((f) => {
      const next = { ...f };
      if (!next.base_currency && f.currency) next.base_currency = f.currency;
      if (!next.base_amount) next.base_amount = f.amount || "";
      if (!next.counter_currency && currencyOptions.length > 0) {
        const other =
          currencyOptions.find(
            (c) => c !== (next.base_currency || f.currency),
          ) || "";
        next.counter_currency = other;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringForm.currency, recurringForm.amount, currencyOptions]);

  // Fijar/limpiar método según crédito y categoría
  useEffect(() => {
    setForm((f) => {
      const isOperador = norm(f.category) === "operador";

      // Caso 1: operador + crédito → fijar método y limpiar cuenta
      if (isOperador && f.use_credit) {
        if (f.payment_method !== CREDIT_METHOD || f.account) {
          return { ...f, payment_method: CREDIT_METHOD, account: "" };
        }
        return f;
      }

      // Caso 2: dejó de ser operador → apagar crédito y limpiar método si era el virtual
      if (!isOperador && (f.use_credit || f.payment_method === CREDIT_METHOD)) {
        return { ...f, use_credit: false, payment_method: "", account: "" };
      }

      // Caso 3: operador pero crédito apagado y el método quedó en el virtual → limpiar
      if (!f.use_credit && f.payment_method === CREDIT_METHOD) {
        return { ...f, payment_method: "", account: "" };
      }

      return f;
    });
  }, [form.category, form.use_credit]);

  useEffect(() => {
    setRecurringForm((f) => {
      const isOperador = norm(f.category) === "operador";

      if (isOperador && f.use_credit) {
        if (f.payment_method !== CREDIT_METHOD || f.account) {
          return { ...f, payment_method: CREDIT_METHOD, account: "" };
        }
        return f;
      }

      if (!isOperador && (f.use_credit || f.payment_method === CREDIT_METHOD)) {
        return { ...f, use_credit: false, payment_method: "", account: "" };
      }

      if (!f.use_credit && f.payment_method === CREDIT_METHOD) {
        return { ...f, payment_method: "", account: "" };
      }

      return f;
    });
  }, [recurringForm.category, recurringForm.use_credit]);

  const nextRecurringRun = useCallback((rule: RecurringInvestment) => {
    const day = Math.min(Math.max(rule.day_of_month || 1, 1), 31);
    const interval = Math.max(rule.interval_months || 1, 1);
    const startRaw = new Date(rule.start_date);
    const start = new Date(
      startRaw.getFullYear(),
      startRaw.getMonth(),
      startRaw.getDate(),
      0,
      0,
      0,
      0,
    );
    const last = rule.last_run ? new Date(rule.last_run) : null;

    const buildDue = (year: number, month: number) => {
      const lastDay = new Date(year, month + 1, 0).getDate();
      const d = Math.min(day, lastDay);
      return new Date(year, month, d, 0, 0, 0, 0);
    };

    const addMonths = (date: Date, months: number) => {
      const total = date.getMonth() + months;
      const year = date.getFullYear() + Math.floor(total / 12);
      const month = total % 12;
      return buildDue(year, month);
    };

    if (last) {
      const base = new Date(
        last.getFullYear(),
        last.getMonth(),
        last.getDate(),
        0,
        0,
        0,
        0,
      );
      return addMonths(base, interval);
    }

    let due = buildDue(start.getFullYear(), start.getMonth());
    if (due < start) {
      due = addMonths(due, interval);
    }
    return due;
  }, []);

  /* ====== Filtro local y resúmenes ====== */
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const isOp = norm(it.category) === "operador";
      if (operadorMode === "only" && !isOp) return false;
      if (operadorMode === "others" && isOp) return false;
      if (
        operatorFilter &&
        (!it.operator || it.operator.id_operator !== operatorFilter)
      ) {
        return false;
      }
      return true;
    });
  }, [items, operadorMode, operatorFilter]);

  const totalsByCurrencyAll = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, it) => {
      acc[it.currency] = (acc[it.currency] || 0) + Number(it.amount || 0);
      return acc;
    }, {});
  }, [items]);

  const totalsByCurrencyFiltered = useMemo(() => {
    return filteredItems.reduce<Record<string, number>>((acc, it) => {
      acc[it.currency] = (acc[it.currency] || 0) + Number(it.amount || 0);
      return acc;
    }, {});
  }, [filteredItems]);

  const counters = useMemo(() => {
    let op = 0;
    let others = 0;
    for (const it of items) {
      if (norm(it.category) === "operador") op++;
      else others++;
    }
    return { op, others, total: items.length, filtered: filteredItems.length };
  }, [items, filteredItems]);

  const groupedByMonth = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        items: Investment[];
        totals: Record<string, number>;
      }
    >();

    for (const it of filteredItems) {
      const d = getItemDate(it);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          label: formatMonthLabel(d),
          items: [it],
          totals: { [it.currency]: Number(it.amount || 0) },
        });
      } else {
        existing.items.push(it);
        existing.totals[it.currency] =
          (existing.totals[it.currency] || 0) + Number(it.amount || 0);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [filteredItems, getItemDate, formatMonthLabel]);

  const resetFilters = () => {
    setQ("");
    setCategory("");
    setCurrency("");
    setPaymentMethodFilter("");
    setAccountFilter("");
    setOperatorFilter(0);
    setOperadorMode("all");
  };

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        {/* Info: ahora se permiten pagos a Operadores + crédito */}
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm text-sky-950 shadow-md shadow-sky-950/10 dark:text-white">
          <div className="flex items-start gap-3">
            <span className="mt-1 size-2 rounded-full bg-amber-400" />
            <p>
              <b>Novedad:</b> ahora podés registrar <b>pagos a Operadores</b>{" "}
              directamente desde <b>Gastos</b> y, si querés, impactarlos en la{" "}
              <b>cuenta de crédito</b> del Operador.
            </p>
          </div>
        </div>

        {/* FORM */}
        <InvestmentsForm
          isFormOpen={isFormOpen}
          setIsFormOpen={setIsFormOpen}
          editingId={editingId}
          headerPills={headerPills}
          onSubmit={onSubmit}
          loading={loading}
          deleteCurrent={deleteCurrent}
          form={form}
          setForm={setForm}
          categoryOptions={categoryOptions}
          currencyOptions={currencyOptions}
          currencyDict={currencyDict}
          uiPaymentMethodOptions={uiPaymentMethodOptions}
          accountOptions={accountOptions}
          showAccount={showAccount}
          previewAmount={previewAmount}
          previewBase={previewBase}
          previewCounter={previewCounter}
          isOperador={isOperador}
          isSueldo={isSueldo}
          isComision={isComision}
          users={users}
          operators={operators}
          inputClass={input}
          recurringOpen={recurringOpen}
          setRecurringOpen={setRecurringOpen}
          recurringEditingId={recurringEditingId}
          recurringForm={recurringForm}
          setRecurringForm={setRecurringForm}
          onSubmitRecurring={onSubmitRecurring}
          savingRecurring={savingRecurring}
          loadingRecurring={loadingRecurring}
          recurring={recurring}
          fetchRecurring={fetchRecurring}
          resetRecurringForm={resetRecurringForm}
          beginRecurringEdit={beginRecurringEdit}
          toggleRecurringActive={toggleRecurringActive}
          deleteRecurring={deleteRecurring}
          showRecurringAccount={showRecurringAccount}
          recurringPaymentMethodOptions={recurringPaymentMethodOptions}
          dayOptions={dayOptions}
          intervalOptions={intervalOptions}
          previewRecurringAmount={previewRecurringAmount}
          previewRecurringBase={previewRecurringBase}
          previewRecurringCounter={previewRecurringCounter}
          isRecurringOperador={isRecurringOperador}
          isRecurringSueldo={isRecurringSueldo}
          isRecurringComision={isRecurringComision}
          nextRecurringRun={nextRecurringRun}
        />

        <InvestmentsList
          filterPanelClass={filterPanel}
          filterControlClass={filterControl}
          q={q}
          setQ={setQ}
          fetchList={fetchList}
          category={category}
          setCategory={setCategory}
          currency={currency}
          setCurrency={setCurrency}
          paymentMethodFilter={paymentMethodFilter}
          setPaymentMethodFilter={setPaymentMethodFilter}
          accountFilter={accountFilter}
          setAccountFilter={setAccountFilter}
          operatorFilter={operatorFilter}
          setOperatorFilter={setOperatorFilter}
          categoryOptions={categoryOptions}
          currencyOptions={currencyOptions}
          paymentMethodOptions={paymentMethodOptions}
          accountOptions={accountOptions}
          operators={operators}
          operadorMode={operadorMode}
          setOperadorMode={setOperadorMode}
          counters={counters}
          resetFilters={resetFilters}
          viewMode={viewMode}
          setViewMode={setViewMode}
          totalsByCurrencyAll={totalsByCurrencyAll}
          totalsByCurrencyFiltered={totalsByCurrencyFiltered}
          loadingList={loadingList}
          filteredItems={filteredItems}
          groupedByMonth={groupedByMonth}
          nextCursor={nextCursor}
          loadingMore={loadingMore}
          loadMore={loadMore}
          formatDate={formatDate}
          onEdit={beginEdit}
        />

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
