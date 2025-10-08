// src/app/investments/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import Spinner from "@/components/Spinner";
import { motion } from "framer-motion";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";
import { loadFinancePicks } from "@/utils/loadFinancePicks";

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

/* ================= Tipos ================= */
type Investment = {
  id_investment: number;
  id_agency: number;
  category: string;
  description: string;
  amount: number;
  currency: string;
  created_at: string;
  paid_at?: string | null;
  user_id?: number | null;
  operator_id?: number | null;
  user?: { id_user: number; first_name: string; last_name: string } | null;
  operator?: { id_operator: number; name: string } | null;
  createdBy?: { id_user: number; first_name: string; last_name: string } | null;
  booking_id?: number | null;

  payment_method?: string | null;
  account?: string | null;

  base_amount?: number | null;
  base_currency?: string | null;
  counter_amount?: number | null;
  counter_currency?: string | null;
};

type User = { id_user: number; first_name: string; last_name: string };
type Operator = { id_operator: number; name: string };

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

/* ==== Componente ==== */
export default function Page() {
  const { token } = useAuth() as { token?: string | null };

  // ------- UI / form state -------
  const [isFormOpen, setIsFormOpen] = useState(true);
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

  // filtros
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [operatorFilter, setOperatorFilter] = useState<number>(0);
  const debouncedQ = useDebounced(q, 400);

  // Filtro local: Operador / Otros / Todos
  const [operadorMode, setOperadorMode] = useState<"all" | "only" | "others">(
    "all",
  );

  // form (sin defaults duros)
  const [form, setForm] = useState<{
    category: string;
    description: string;
    amount: string;
    currency: string;
    paid_at: string; // YYYY-MM-DD
    user_id: number | null;
    operator_id: number | null;
    paid_today: boolean;

    payment_method: string;
    account: string;

    use_conversion: boolean;
    base_amount: string;
    base_currency: string;
    counter_amount: string;
    counter_currency: string;
  }>({
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
  });

  // edición
  const [editingId, setEditingId] = useState<number | null>(null);

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
    });
    setEditingId(null);
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
    });
    setEditingId(inv.id_investment);
    setIsFormOpen(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function deleteCurrent() {
    if (!editingId || !token) return;
    try {
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

  /* ========= Finance config ========= */
  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();

    (async () => {
      try {
        // Traemos cuentas/métodos/monedas con el util y categorías por endpoint aparte
        const [picks, catsRes] = await Promise.all([
          loadFinancePicks(token),
          authFetch(
            "/api/finance/categories",
            { cache: "no-store", signal: ac.signal },
            token,
          ),
        ]);

        // Parse defensivo de categorías (puede venir como {categories}|{items}|array plano)
        // Parse defensivo de categorías (puede venir como {categories}|{items}|array plano)
        let categories: FinanceCategory[] | undefined = undefined;
        if (catsRes.ok) {
          const raw = (await safeJson<unknown>(catsRes)) ?? null; // antes: <any>
          const cats = parseCategories(raw);
          if (cats.length) categories = cats;
        }

        setFinance({
          accounts: picks.accounts, // ya vienen normalizados
          paymentMethods: picks.paymentMethods,
          currencies: picks.currencies,
          categories, // puede ser undefined si no hay
        });
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") setFinance(null);
      }
    })();

    return () => ac.abort();
  }, [token]);

  /* ========= Perfil + users ========= */
  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();

    (async () => {
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
      } catch {}
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
      } catch {}
    })();

    return () => ac.abort();
  }, [token]);

  /* ========= Operadores ========= */
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

  const requiresAccountMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const m of finance?.paymentMethods || []) {
      if (!m.enabled) continue;
      map.set(norm(m.name), !!m.requires_account);
    }
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

  const showAccount = useMemo(() => {
    if (!form.payment_method) return false;
    return !!requiresAccountMap.get(norm(form.payment_method));
  }, [form.payment_method, requiresAccountMap]);

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

  /* ========= Crear / Actualizar ========= */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const categoryLower = norm(form.category);
    const amountNum = Number(form.amount);

    if (!form.category || !form.description || !form.currency) {
      toast.error("Completá categoría, descripción y moneda");
      return;
    }
    if (categoryLower === "operador") {
      toast.error("Los pagos a OPERADORES se cargan desde Reservas.");
      return;
    }
    if (!form.payment_method) {
      toast.error("Seleccioná el método de pago");
      return;
    }
    if (showAccount && !form.account) {
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
      currency: form.currency,
      paid_at,
      user_id: form.user_id ?? undefined,
      operator_id: form.operator_id ?? undefined,
      payment_method: form.payment_method,
      account: showAccount ? form.account : undefined,
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
        const created = await safeJson<Investment>(res);
        if (created) {
          setItems((prev) => [created, ...prev]);
        } else {
          await fetchList();
        }
        toast.success("Gasto cargado");
        resetForm();
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
        resetForm();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  /* ========= Helpers UI ========= */
  const isOperador = norm(form.category) === "operador";
  const isSueldo = norm(form.category) === "sueldo";
  const isComision = norm(form.category) === "comision";

  const input =
    "w-full appearance-none rounded-2xl bg-white/50 border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white";

  const formatDate = (s?: string | null) =>
    s ? new Date(s).toLocaleDateString("es-AR", { timeZone: "UTC" }) : "-";

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
        {/* Aviso: operadores */}
        <div className="mb-4 rounded-2xl border border-yellow-300/30 bg-yellow-100/30 p-3 text-sm text-yellow-900 dark:border-yellow-300/20 dark:bg-yellow-300/10 dark:text-yellow-200">
          <b>Importante:</b> acá <u>no</u> se cargan pagos a <b>OPERADORES</b>.
          Esos egresos se gestionan desde <b>Reservas</b>. Los verás listados
          pero en solo lectura.
        </div>

        {/* FORM */}
        <motion.div
          layout
          initial={{ maxHeight: 100, opacity: 1 }}
          animate={{
            maxHeight: isFormOpen ? 1000 : 100,
            opacity: 1,
            transition: { duration: 0.4, ease: "easeInOut" },
          }}
          className="mb-6 space-y-3 overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur"
        >
          <div
            className="flex cursor-pointer items-center justify-between"
            onClick={() => setIsFormOpen((v) => !v)}
            role="button"
            aria-label="Alternar formulario de gastos"
          >
            <p className="text-lg font-medium">
              {editingId ? "Editar gasto" : "Cargar gasto"}
            </p>
            <button
              type="button"
              className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
              aria-label={isFormOpen ? "Cerrar formulario" : "Abrir formulario"}
            >
              {isFormOpen ? (
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
                    d="M5 12h14"
                  />
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

          {isFormOpen && (
            <form
              onSubmit={onSubmit}
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              {/* Categoría */}
              <div>
                <label className="ml-2 block">Categoría</label>
                <select
                  className={`${input} cursor-pointer`}
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      category: e.target.value,
                      user_id: null,
                      operator_id: null,
                    }))
                  }
                  required
                  disabled={categoryOptions.length === 0}
                >
                  <option value="" disabled>
                    {categoryOptions.length
                      ? "Seleccionar…"
                      : "Sin categorías habilitadas"}
                  </option>
                  {categoryOptions
                    .filter((c) => norm(c) !== "operador")
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
                {finance?.categories &&
                  finance.categories.some(
                    (c) => norm(c.name) === "operador",
                  ) && (
                    <p className="ml-2 mt-1 text-xs opacity-70">
                      La categoría <b>Operador</b> se gestiona desde Reservas.
                    </p>
                  )}
                {isOperador && (
                  <p className="ml-2 mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                    No se pueden cargar pagos a <b>OPERADORES</b> desde esta
                    página.
                  </p>
                )}
              </div>

              {/* Fecha */}
              <div>
                <label className="ml-2 block">Fecha de pago (opcional)</label>
                <input
                  type="date"
                  className={`${input} cursor-pointer`}
                  value={form.paid_at}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, paid_at: e.target.value }))
                  }
                />
              </div>

              {/* Descripción */}
              <div className="md:col-span-2">
                <label className="ml-2 block">Descripción</label>
                <input
                  className={input}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Concepto / detalle del gasto…"
                  required
                />
              </div>

              {/* Monto */}
              <div>
                <label className="ml-2 block">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className={input}
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0.00"
                  required
                />
                {form.amount && (
                  <div className="ml-2 mt-1 text-sm opacity-80">
                    {previewAmount}
                  </div>
                )}
              </div>

              {/* Moneda (solo config) */}
              <div>
                <label className="ml-2 block">Moneda</label>
                <select
                  className={`${input} cursor-pointer`}
                  value={form.currency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, currency: e.target.value }))
                  }
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
              </div>

              {/* Método de pago (solo config) */}
              <div>
                <label className="ml-2 block">Método de pago</label>
                <select
                  className={`${input} cursor-pointer`}
                  value={form.payment_method}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, payment_method: e.target.value }))
                  }
                  required
                  disabled={paymentMethodOptions.length === 0}
                >
                  <option value="" disabled>
                    {paymentMethodOptions.length
                      ? "Seleccionar método"
                      : "Sin métodos habilitados"}
                  </option>
                  {paymentMethodOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cuenta (si el método la requiere; solo config) */}
              {showAccount && (
                <div>
                  <label className="ml-2 block">Cuenta</label>
                  <select
                    className={`${input} cursor-pointer`}
                    value={form.account}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, account: e.target.value }))
                    }
                    required={showAccount}
                    disabled={accountOptions.length === 0}
                  >
                    <option value="" disabled>
                      {accountOptions.length
                        ? "Seleccionar cuenta"
                        : "Sin cuentas habilitadas"}
                    </option>
                    {accountOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conversión (Valor / Contravalor) */}
              <div className="rounded-2xl border border-white/10 p-3 md:col-span-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.use_conversion}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        use_conversion: e.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm">Registrar valor / contravalor</span>
                </label>

                {form.use_conversion && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-sm font-medium">Valor base</p>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          className={`col-span-2 ${input}`}
                          placeholder="0.00"
                          value={form.base_amount}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              base_amount: e.target.value,
                            }))
                          }
                        />
                        <select
                          className={`${input} cursor-pointer`}
                          value={form.base_currency}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              base_currency: e.target.value,
                            }))
                          }
                          disabled={currencyOptions.length === 0}
                        >
                          <option value="" disabled>
                            {currencyOptions.length ? "Moneda" : "Sin monedas"}
                          </option>
                          {currencyOptions.map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </select>
                      </div>
                      {previewBase && (
                        <div className="ml-1 mt-1 text-xs opacity-70">
                          {previewBase}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-sm font-medium">Contravalor</p>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          className={`col-span-2 ${input}`}
                          placeholder="0.00"
                          value={form.counter_amount}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              counter_amount: e.target.value,
                            }))
                          }
                        />
                        <select
                          className={`${input} cursor-pointer`}
                          value={form.counter_currency}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              counter_currency: e.target.value,
                            }))
                          }
                          disabled={currencyOptions.length === 0}
                        >
                          <option value="" disabled>
                            {currencyOptions.length ? "Moneda" : "Sin monedas"}
                          </option>
                          {currencyOptions.map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </select>
                      </div>
                      {previewCounter && (
                        <div className="ml-1 mt-1 text-xs opacity-70">
                          {previewCounter}
                        </div>
                      )}
                    </div>

                    <div className="text-xs opacity-70 md:col-span-2">
                      Se guarda el valor y contravalor <b>sin tipo de cambio</b>
                      . Útil si pagás en una moneda pero el acuerdo está en
                      otra.
                    </div>
                  </div>
                )}
              </div>

              {(isSueldo || isComision) && (
                <div className="md:col-span-2">
                  <label className="ml-2 block">
                    {isSueldo ? "Empleado" : "Vendedor"}
                  </label>
                  <select
                    className={`${input} cursor-pointer`}
                    value={form.user_id ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        user_id: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    required
                    disabled={users.length === 0}
                  >
                    <option value="" disabled>
                      {users.length ? "Seleccionar usuario…" : "Sin usuarios"}
                    </option>
                    {users.map((u) => (
                      <option key={u.id_user} value={u.id_user}>
                        {u.first_name} {u.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Botones */}
              <div className="flex flex-wrap gap-3 md:col-span-2">
                <button
                  type="submit"
                  disabled={loading}
                  className={`mt-2 rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white ${
                    loading ? "opacity-60" : ""
                  }`}
                >
                  {loading ? (
                    <Spinner />
                  ) : editingId ? (
                    "Actualizar gasto"
                  ) : (
                    "Agregar gasto"
                  )}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("¿Eliminar este gasto?")) deleteCurrent();
                    }}
                    className="mt-2 rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                    title="Eliminar gasto"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.4}
                      stroke="currentColor"
                      className="size-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </form>
          )}
        </motion.div>

        {/* FILTROS */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex w-full appearance-none items-center gap-2 rounded-2xl border border-white/10 bg-white/10 text-sky-950 shadow-md outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white">
            <input
              className="w-full bg-transparent p-2 px-4 outline-none"
              placeholder="Buscar por texto, usuario u operador…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") fetchList();
              }}
              aria-label="Buscar gastos"
            />
            <button
              type="button"
              onClick={fetchList}
              className="w-fit cursor-pointer appearance-none px-3 outline-none"
              title="Buscar"
              aria-label="Ejecutar búsqueda"
            >
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
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </button>
          </div>

          {/* Categoría (config) */}
          <select
            className="cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={categoryOptions.length === 0}
            aria-label="Filtrar por categoría"
          >
            <option value="">
              {categoryOptions.length ? "Categoría (todas)" : "Sin categorías"}
            </option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Moneda (config) */}
          <select
            className="cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={currencyOptions.length === 0}
            aria-label="Filtrar por moneda"
          >
            <option value="">
              {currencyOptions.length ? "Moneda (todas)" : "Sin monedas"}
            </option>
            {currencyOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>

          {/* Método (config) */}
          <select
            className="cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
            value={paymentMethodFilter}
            onChange={(e) => setPaymentMethodFilter(e.target.value)}
            disabled={paymentMethodOptions.length === 0}
            aria-label="Filtrar por método de pago"
          >
            <option value="">
              {paymentMethodOptions.length ? "Método (todos)" : "Sin métodos"}
            </option>
            {paymentMethodOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Cuenta (config) */}
          <select
            className="cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            disabled={accountOptions.length === 0}
            aria-label="Filtrar por cuenta"
          >
            <option value="">
              {accountOptions.length ? "Cuenta (todas)" : "Sin cuentas"}
            </option>
            {accountOptions.map((acc) => (
              <option key={acc} value={acc}>
                {acc}
              </option>
            ))}
          </select>

          {/* Operador (local, para discriminar) */}
          <select
            className="cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md outline-none backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(Number(e.target.value))}
            disabled={operators.length === 0}
            aria-label="Filtrar por operador"
          >
            <option value={0}>
              {operators.length ? "Operador (todos)" : "Sin operadores"}
            </option>
            {operators.map((o) => (
              <option key={o.id_operator} value={o.id_operator}>
                {o.name}
              </option>
            ))}
          </select>

          {/* Filtro local: Operador / Otros / Todos */}
          <div className="flex items-center rounded-2xl border border-white/10 bg-white/10 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10">
            {[
              { key: "all", label: "Todos", badge: counters.total },
              { key: "only", label: "Operador", badge: counters.op },
              { key: "others", label: "Otros", badge: counters.others },
            ].map((opt) => {
              const active = operadorMode === (opt.key as typeof operadorMode);
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() =>
                    setOperadorMode(opt.key as "all" | "only" | "others")
                  }
                  className={[
                    "flex items-center gap-2 rounded-2xl px-4 py-2 text-sm transition-colors",
                    active
                      ? "bg-sky-100 text-sky-950 dark:bg-white/10 dark:text-white"
                      : "text-sky-950/80 hover:bg-white/10 dark:text-white/80",
                  ].join(" ")}
                  title={`Mostrar ${opt.label.toLowerCase()}`}
                >
                  <span>{opt.label}</span>
                  <span className="rounded-full border border-white/10 bg-white/20 px-2 text-xs">
                    {opt.badge}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="h-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
            title="Limpiar filtros"
          >
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
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          </button>
        </div>

        {/* RESUMEN */}
        {Object.keys(totalsByCurrencyAll).length > 0 && (
          <div className="mb-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="opacity-70">
                Resumen (filtrado • {counters.filtered}/{counters.total}):
              </span>
              {Object.entries(totalsByCurrencyFiltered).map(([cur, total]) => (
                <span
                  key={`f-${cur}`}
                  className="rounded-xl border border-white/10 bg-white/10 px-3 py-1"
                >
                  {cur}:{" "}
                  {new Intl.NumberFormat("es-AR", {
                    style: "currency",
                    currency: cur,
                  }).format(total)}
                </span>
              ))}
              {Object.keys(totalsByCurrencyFiltered).length === 0 && (
                <span className="opacity-60">
                  Sin totales para el filtro actual
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 opacity-80">
              <span className="opacity-70">
                Resumen general (lista cargada):
              </span>
              {Object.entries(totalsByCurrencyAll).map(([cur, total]) => (
                <span
                  key={`a-${cur}`}
                  className="rounded-xl border border-white/10 bg-white/10 px-3 py-1"
                >
                  {cur}:{" "}
                  {new Intl.NumberFormat("es-AR", {
                    style: "currency",
                    currency: cur,
                  }).format(total)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* LISTA */}
        {loadingList ? (
          <div className="flex min-h-[40vh] items-center">
            <Spinner />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-center text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white">
            No hay gastos para el filtro seleccionado.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((it) => {
              const isOperadorItem = norm(it.category) === "operador";
              return (
                <div
                  key={it.id_investment}
                  className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">{it.category}</div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm opacity-70">
                        #{it.id_investment}
                      </div>
                      <button
                        type="button"
                        onClick={() => !isOperadorItem && beginEdit(it)}
                        disabled={isOperadorItem}
                        className={[
                          "text-sky-950/50 transition-colors hover:text-sky-950 dark:text-white/50 dark:hover:text-white",
                          isOperadorItem ? "cursor-not-allowed opacity-40" : "",
                        ].join(" ")}
                        title={
                          isOperadorItem
                            ? "Los egresos de OPERADOR se gestionan desde Reservas (solo lectura aquí)"
                            : "Editar gasto"
                        }
                        aria-label={
                          isOperadorItem
                            ? "Solo lectura"
                            : "Editar gasto seleccionado"
                        }
                      >
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
                            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="mt-1 text-lg opacity-90">
                    {it.description}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                    <span>
                      <b>Monto:</b>{" "}
                      {new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: it.currency,
                      }).format(it.amount)}
                    </span>
                    <span>
                      <b>Creado:</b> {formatDate(it.created_at)}
                    </span>
                    {it.paid_at && (
                      <span>
                        <b>Pagado:</b> {formatDate(it.paid_at)}
                      </span>
                    )}
                    {it.payment_method && (
                      <span>
                        <b>Método:</b> {it.payment_method}
                      </span>
                    )}
                    {it.account && (
                      <span>
                        <b>Cuenta:</b> {it.account}
                      </span>
                    )}
                    {it.base_amount && it.base_currency && (
                      <span>
                        <b>Valor:</b>{" "}
                        {new Intl.NumberFormat("es-AR", {
                          style: "currency",
                          currency: it.base_currency,
                        }).format(it.base_amount)}
                      </span>
                    )}
                    {it.counter_amount && it.counter_currency && (
                      <span>
                        <b>Contravalor:</b>{" "}
                        {new Intl.NumberFormat("es-AR", {
                          style: "currency",
                          currency: it.counter_currency,
                        }).format(it.counter_amount)}
                      </span>
                    )}
                    {it.operator && (
                      <span>
                        <b>Operador:</b> {it.operator.name}
                      </span>
                    )}
                    {it.user && (
                      <span>
                        <b>Usuario:</b> {it.user.first_name} {it.user.last_name}
                      </span>
                    )}
                    {it.createdBy && (
                      <span className="opacity-80">
                        <b>Cargado por:</b> {it.createdBy.first_name}{" "}
                        {it.createdBy.last_name}
                      </span>
                    )}
                    {it.booking_id && (
                      <span className="flex w-fit items-center gap-2">
                        <b>Reserva N° </b> {it.booking_id}
                        <Link
                          href={`/bookings/services/${it.booking_id}`}
                          target="_blank"
                          className="rounded-full bg-sky-100 p-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
                          aria-label={`Abrir reserva ${it.booking_id} en nueva pestaña`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                            className="size-4"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                            />
                          </svg>
                        </Link>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {nextCursor && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
                >
                  {loadingMore ? <Spinner /> : "Ver más"}
                </button>
              </div>
            )}
          </div>
        )}

        <ToastContainer />
      </section>
    </ProtectedRoute>
  );
}
