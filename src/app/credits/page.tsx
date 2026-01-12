// src/app/credits/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { toast, ToastContainer } from "react-toastify";
import CreateAccountForm, {
  type CreateCreditAccountPayload,
} from "@/components/credits/CreateAccountForm";
import type { Operator } from "@/types";
import { AnimatePresence, motion } from "framer-motion";
import "react-toastify/dist/ReactToastify.css";

/* =========================================================
 * Helpers
 * ========================================================= */
async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
const isSilentStatus = (res: Response) =>
  res.status === 404 || res.status === 204;

const formatDateSafe = (isoLike?: string) => {
  if (!isoLike) return "-";
  const d = new Date(isoLike);
  const t = d.getTime();
  if (!Number.isFinite(t)) return "-";
  try {
    return d.toLocaleDateString("es-AR", { timeZone: "UTC" });
  } catch {
    return "-";
  }
};

const normDoc = (s?: string | null) => (s || "").trim().toLowerCase();

/**
 * Reglas de signo por tipo de documento:
 * - investment -> negativo
 * - receipt    -> positivo
 * - (otros)    -> tal cual (por ahora positivo, se define más adelante)
 */
function signedByDocType(amount: unknown, docType?: string | null): number {
  const a = Math.abs(Number(amount) || 0);
  const dt = normDoc(docType);

  if (dt === "investment") return -a;
  if (dt === "receipt") return +a;

  // NUEVO
  if (dt === "adjust_down") return -a;
  if (dt === "adjust_up") return +a;

  return a;
}

/* ===== Cookies utils (igual lógica que Services) ===== */
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
  const raw = getCookie("role");
  return normalizeRole(raw);
}

/* =========================================================
 * Tipos API
 * ========================================================= */
type CreditEntry = {
  id_entry: number;
  account_id: number;
  id_agency: number;
  created_at: string;
  amount: number; // siempre viene positivo desde backend
  currency: string;
  concept?: string | null;
  doc_type?: string | null; // "investment" | "receipt" | ...
  booking_id?: number | null;
  receipt_id?: number | null;
  investment_id?: number | null;
  operator_due_id?: number | null;
  created_by?: number | null;
  createdBy?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
};

type CreditAccount = {
  id_credit_account: number;
  id_agency: number;

  client_id?: number | null;
  operator_id?: number | null;

  currency: string;
  balance: number | string; // Decimal serializado (hoy viene sin signo desde API)
  enabled: boolean;
  created_at: string;

  client?: { id_client: number; first_name: string; last_name: string } | null;
  operator?: { id_operator: number; name: string } | null;

  recentEntries?: CreditEntry[];
};

type AccountsList = { items: CreditAccount[]; nextCursor: number | null };

type ApiError = { error?: string; message?: string };

type ProfileLite = { id_agency?: number; role?: string };

type CurrencyPick = { code: string; name: string; enabled: boolean };
type FinancePicks = {
  currencies: CurrencyPick[];
};

/* =========================================================
 * UI primitives (pills / icons)
 * ========================================================= */
type Tone = "sky" | "emerald" | "rose" | "amber" | "violet" | "zinc";

function pillClasses(tone: Tone) {
  const base =
    "inline-flex items-center gap-2 rounded-xl border px-3 py-1 text-xs font-medium";
  const map: Record<Tone, string> = {
    sky: "border-sky-400/30 bg-sky-400/10 text-sky-900 dark:text-sky-200",
    emerald:
      "border-emerald-400/30 bg-emerald-400/10 text-emerald-900 dark:text-emerald-200",
    rose: "border-rose-400/30 bg-rose-400/10 text-rose-900 dark:text-rose-200",
    amber:
      "border-amber-400/30 bg-amber-400/10 text-amber-900 dark:text-amber-200",
    violet:
      "border-violet-400/30 bg-violet-400/10 text-violet-900 dark:text-violet-200",
    zinc: "border-white/10 bg-white/10 text-sky-950 dark:text-white",
  };
  return `${base} ${map[tone]}`;
}

function docTypeMeta(docType?: string | null): {
  tone: Tone;
  label: string;
  icon?: JSX.Element;
} {
  const dt = normDoc(docType);

  if (dt === "investment")
    return { tone: "rose", label: "Inversión", icon: <DownIcon /> };
  if (dt === "receipt")
    return { tone: "emerald", label: "Recibo", icon: <UpIcon /> };

  if (dt === "adjust_down")
    return { tone: "rose", label: "Ajuste -", icon: <DownIcon /> };
  if (dt === "adjust_up")
    return { tone: "emerald", label: "Ajuste +", icon: <UpIcon /> };

  return { tone: "zinc", label: docType || "—" };
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="size-5"
      animate={{ rotate: open ? 180 : 0 }}
      transition={{ duration: 0.2 }}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </motion.svg>
  );
}

function ResetIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path
        d="M3 12a9 9 0 1 0 3-6.708"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 3v6h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg
      className="size-4"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 4l-7 8h4v8h6v-8h4z" />
    </svg>
  );
}
function DownIcon() {
  return (
    <svg
      className="size-4"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 20l7-8h-4V4h-6v8H5z" />
    </svg>
  );
}

/* =========================================================
 * Página
 * ========================================================= */
export default function CreditsPage() {
  const { token, user } = useAuth() as {
    token?: string | null;
    user?: { role?: string | null } | null;
  };

  /* ---------- Role cookie-first ---------- */
  const [role, setRole] = useState<Role | "">("");
  useEffect(() => {
    if (!token) return;
    const cookieRole = readRoleFromCookie();
    if (cookieRole) {
      setRole(cookieRole);
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        const r = await authFetch(
          "/api/role",
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (r.ok) {
          const j = await r.json();
          setRole(normalizeRole((j as { role?: unknown })?.role));
          return;
        }
        const p = await authFetch(
          "/api/user/profile",
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (p.ok) {
          const j = await p.json();
          setRole(normalizeRole((j as { role?: unknown })?.role));
        }
      } catch {
        // silencioso
      }
    })();
    return () => ac.abort();
  }, [token]);

  useEffect(() => {
    const onFocus = () => {
      const cookieRole = readRoleFromCookie();
      if ((cookieRole || "") !== (role || "")) setRole(cookieRole);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [role]);

  /* ---------- Picks (monedas) para filtros ---------- */
  const [picks, setPicks] = useState<FinancePicks | null>(null);
  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await authFetch(
          "/api/finance/picks",
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (r.ok) {
          const j = (await safeJson<{ currencies?: CurrencyPick[] }>(r)) ?? {};
          setPicks({
            currencies: Array.isArray(j.currencies) ? j.currencies : [],
          });
        } else if (isSilentStatus(r)) {
          setPicks({ currencies: [] });
        } else {
          setPicks({ currencies: [] });
          const body = (await safeJson<ApiError>(r)) ?? {};
          toast.error(
            body.error || body.message || "No se pudieron cargar monedas",
          );
        }
      } catch {
        setPicks({ currencies: [] });
      }
    })();
    return () => ac.abort();
  }, [token]);

  /* ---------- Perfil (id_agency) ---------- */
  const [agencyId, setAgencyId] = useState<number | null>(null);
  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();
    (async () => {
      try {
        const p = await authFetch(
          "/api/user/profile",
          { cache: "no-store", signal: ac.signal },
          token,
        );
        if (p.ok) {
          const j = (await safeJson<ProfileLite>(p)) ?? {};
          setAgencyId(j?.id_agency ?? null);
        } else if (isSilentStatus(p)) {
          setAgencyId(null);
        }
      } catch {
        setAgencyId(null);
      }
    })();
    return () => ac.abort();
  }, [token]);

  /* ---------- Operadores (por agencia) para el form ---------- */
  const [operators, setOperators] = useState<Operator[]>([]);
  useEffect(() => {
    if (!token) return;

    // No llamar hasta tener agencyId
    if (agencyId == null) {
      setOperators([]);
      return;
    }

    const ac = new AbortController();
    (async () => {
      try {
        const url = `/api/operators?agencyId=${agencyId}`;
        const r = await authFetch(
          url,
          { cache: "no-store", signal: ac.signal },
          token,
        );

        if (!r.ok) {
          // Silenciar 400 típico “Debe proporcionar agencyId”
          const body =
            (await safeJson<{ error?: string; message?: string }>(r)) ?? {};
          const msg = body.error || body.message || "";
          if (!(r.status === 400 && msg.toLowerCase().includes("agencyid"))) {
            toast.error(msg || "No se pudieron cargar operadores");
          }
          setOperators([]);
          return;
        }

        const j = (await safeJson<Operator[]>(r)) ?? [];
        const list = Array.isArray(j) ? j : [];
        list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
        setOperators(list);
      } catch {
        setOperators([]);
      }
    })();

    return () => ac.abort();
  }, [token, agencyId]);

  /* ---------- Filtros ---------- */
  const [currency, setCurrency] = useState<string>("");
  const [onlyEnabled, setOnlyEnabled] = useState<boolean>(true);

  /* ---------- Lista / Paginación ---------- */
  const [items, setItems] = useState<CreditAccount[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const listAbortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  const buildQuery = useCallback(
    (next?: number | null) => {
      const qs = new URLSearchParams();
      if (currency) qs.append("currency", currency);
      if (onlyEnabled) qs.append("enabled", "true");
      qs.append("take", "24");
      if (next != null) qs.append("cursor", String(next));
      return qs.toString();
    },
    [currency, onlyEnabled],
  );

  const fetchList = useCallback(async () => {
    if (!token || agencyId == null) return;
    setLoading(true);

    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const myId = ++reqIdRef.current;

    try {
      const res = await authFetch(
        `/api/credit/account?${buildQuery()}`,
        { cache: "no-store", signal: controller.signal },
        token,
      );

      if (!res.ok) {
        if (isSilentStatus(res)) {
          if (myId === reqIdRef.current) {
            setItems([]);
            setCursor(null);
          }
        } else {
          if (myId === reqIdRef.current) {
            setItems([]);
            setCursor(null);
          }
          const body = (await safeJson<ApiError>(res)) ?? {};
          toast.error(
            body.error ||
              body.message ||
              "No se pudo obtener la lista de cuentas",
          );
        }
        return;
      }

      const json = (await safeJson<AccountsList>(res)) ?? {
        items: [],
        nextCursor: null,
      };
      if (myId !== reqIdRef.current) return;
      setItems(Array.isArray(json.items) ? json.items : []);
      setCursor(json.nextCursor ?? null);
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") {
        setItems([]);
        setCursor(null);
        toast.error("Error cargando cuentas");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [buildQuery, token, agencyId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const loadMore = useCallback(async () => {
    if (!token || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await authFetch(
        `/api/credit/account?${buildQuery(cursor)}`,
        { cache: "no-store" },
        token,
      );
      if (!res.ok) {
        if (!isSilentStatus(res)) {
          const body = (await safeJson<ApiError>(res)) ?? {};
          toast.error(
            body.error || body.message || "No se pudieron cargar más cuentas",
          );
        }
        setLoadingMore(false);
        return;
      }
      const json = (await safeJson<AccountsList>(res)) ?? {
        items: [],
        nextCursor: null,
      };
      setItems((prev) => [...prev, ...(json.items || [])]);
      setCursor(json.nextCursor ?? null);
    } catch {
      toast.error("No se pudieron cargar más cuentas");
    } finally {
      setLoadingMore(false);
    }
  }, [token, cursor, loadingMore, buildQuery]);

  /* ---------- Expand & lazy details (multi-open) ---------- */
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [details, setDetails] = useState<Record<number, CreditAccount>>({});
  const [detailsLoading, setDetailsLoading] = useState<Record<number, boolean>>(
    {},
  );

  const toggleExpand = useCallback(
    async (id: number) => {
      if (!token) return;

      // Si ya está cargado, solo toggle
      if (details[id]) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        return;
      }

      // Cargar detalles on-demand y abrir
      setDetailsLoading((m) => ({ ...m, [id]: true }));
      try {
        const r = await authFetch(
          `/api/credit/account/${id}`,
          { cache: "no-store" },
          token,
        );
        if (!r.ok) {
          if (isSilentStatus(r)) {
            toast.info("La cuenta no está disponible.");
          } else {
            const body = (await safeJson<ApiError>(r)) ?? {};
            toast.error(body.error || "No se pudo obtener la cuenta");
          }
          return;
        }
        const j = (await safeJson<CreditAccount>(r)) ?? null;
        if (j) {
          setDetails((d) => ({ ...d, [id]: j }));
          setExpandedIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }
      } finally {
        setDetailsLoading((m) => ({ ...m, [id]: false }));
      }
    },
    [token, details],
  );

  /* ---------- Edit: enabled ---------- */
  const [updating, setUpdating] = useState<Record<number, boolean>>({});

  const toggleEnabled = async (id: number, next: boolean) => {
    if (!token) return;
    setUpdating((m) => ({ ...m, [id]: true }));
    try {
      const r = await authFetch(
        `/api/credit/account/${id}`,
        { method: "PUT", body: JSON.stringify({ enabled: next }) },
        token,
      );
      if (!r.ok) {
        const body = (await safeJson<ApiError>(r)) ?? {};
        throw new Error(body.error || "No se pudo actualizar el estado");
      }
      const updated = (await safeJson<Partial<CreditAccount>>(r)) ?? {};
      setItems((prev) =>
        prev.map((a) =>
          a.id_credit_account === id ? { ...a, ...updated } : a,
        ),
      );
      setDetails((d) =>
        d[id] ? { ...d, [id]: { ...d[id]!, ...updated } as CreditAccount } : d,
      );
      toast.success(next ? "Cuenta habilitada" : "Cuenta deshabilitada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setUpdating((m) => ({ ...m, [id]: false }));
    }
  };

  /* ---------- Crear cuenta (form) ---------- */
  const [isFormVisible, setIsFormVisible] = useState(false);

  const onCreateAccount = useCallback(
    async (payload: CreateCreditAccountPayload) => {
      if (!token) {
        const err = "Sesión no válida";
        toast.error(err);
        throw new Error(err);
      }

      const { id_operator, status, ...rest } = payload;
      const bodyToSend: Omit<
        CreateCreditAccountPayload,
        "id_operator" | "status"
      > & {
        operator_id?: number | null;
        enabled?: boolean;
      } = {
        ...rest,
        operator_id: id_operator ?? null,
        enabled: status ? status === "ACTIVE" : undefined,
      };

      const res = await authFetch(
        "/api/credit/account",
        {
          method: "POST",
          body: JSON.stringify(bodyToSend),
        },
        token,
      );
      if (!res.ok) {
        const body = (await safeJson<ApiError>(res)) ?? {};
        const msg = body.error || body.message || "No se pudo crear la cuenta";
        toast.error(msg);
        throw new Error(msg);
      }
      toast.success("Cuenta creada correctamente");
      await fetchList();
    },
    [token, fetchList],
  );

  /* ---------- Monedas visibles (para filtro) ---------- */
  const currencyOptions = useMemo(
    () =>
      (picks?.currencies || [])
        .filter((c) => c.enabled)
        .map((c) => c.code.toUpperCase()),
    [picks?.currencies],
  );

  /* ---------- UI helpers ---------- */
  const formatAmount = (n: number, cur?: string) => {
    if (!Number.isFinite(n)) return "-";
    try {
      return new Intl.NumberFormat("es-AR", {
        style: cur ? "currency" : "decimal",
        currency: cur || "ARS",
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      return cur ? `${n.toFixed(2)} ${cur}` : n.toFixed(2);
    }
  };

  const resetFilters = () => {
    setCurrency("");
    setOnlyEnabled(true);
  };

  const canAdjust = useMemo(() => {
    const r = String(user?.role || role || "").toLowerCase();
    return ["gerente", "administrativo", "desarrollador"].includes(r);
  }, [user?.role, role]);

  const [adjustOpen, setAdjustOpen] = useState<Record<number, boolean>>({});
  const [adjustTarget, setAdjustTarget] = useState<Record<number, string>>({});
  const [adjustReason, setAdjustReason] = useState<Record<number, string>>({});
  const [adjusting, setAdjusting] = useState<Record<number, boolean>>({});

  function parseAmountInput(raw: string): number | null {
    if (!raw) return null;
    let s = raw.trim().replace(/\s+/g, "");
    if (!s) return null;

    const hasComma = s.includes(",");
    const hasDot = s.includes(".");

    if (hasComma && hasDot) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(/,/g, "");
      }
    } else if (hasComma) {
      s = s.replace(",", ".");
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <ProtectedRoute>
      {!token ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <section className="text-sky-950 dark:text-white">
          {/* Título + CTA */}
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Cuentas de Crédito</h1>
            <div className="flex items-center gap-3">
              <span className={pillClasses("zinc")}>
                Rol:{" "}
                <b className="ml-1">{(user?.role || role || "-") as string}</b>
              </span>
            </div>
          </div>

          {/* Formulario */}
          <CreateAccountForm
            token={token ?? null}
            isFormVisible={isFormVisible}
            setIsFormVisible={setIsFormVisible}
            onSubmit={onCreateAccount}
            operators={operators}
          />

          {/* FILTROS */}
          <div className="my-4 flex flex-wrap items-center gap-2">
            <select
              className="cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={!currencyOptions.length}
              aria-label="Filtrar por moneda"
            >
              <option value="">
                {currencyOptions.length ? "Moneda (todas)" : "Sin monedas"}
              </option>
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-2 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10">
              <input
                type="checkbox"
                checked={onlyEnabled}
                onChange={(e) => setOnlyEnabled(e.target.checked)}
              />
              <span className="text-sm">Solo habilitadas</span>
            </label>

            <button
              type="button"
              onClick={resetFilters}
              className="group h-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md backdrop-blur transition-colors hover:bg-white/20 dark:border-white/10 dark:bg-white/10 dark:text-white"
              title="Limpiar filtros"
            >
              <span className="flex items-center gap-2">
                <ResetIcon />
                <span>Limpiar</span>
              </span>
            </button>
          </div>

          {/* LISTA */}
          {loading ? (
            <div className="flex min-h-[40vh] items-center">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-center shadow-md backdrop-blur">
              No hay cuentas para el filtro seleccionado.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((acc) => {
                const id = acc.id_credit_account;
                const det = details[id];
                const busy = !!updating[id];
                const isOpen = expandedIds.has(id);
                const cur = (acc.currency || "").toUpperCase();

                const balanceLocal =
                  typeof (det?.balance ?? acc.balance) === "string"
                    ? Number(det?.balance ?? acc.balance)
                    : ((det?.balance ?? acc.balance) as number);

                const hasClient = !!(det?.client || acc.client);
                const hasOperator = !!(det?.operator || acc.operator);
                const subjectLabel = hasClient
                  ? det?.client
                    ? `${det.client.first_name} ${det.client.last_name}`
                    : acc.client
                      ? `${acc.client.first_name} ${acc.client.last_name}`
                      : "Cliente"
                  : hasOperator
                    ? det?.operator?.name || acc.operator?.name || "Operador"
                    : "—";
                const subjectKind = hasClient
                  ? "CLIENTE"
                  : hasOperator
                    ? "OPERADOR"
                    : "—";

                const balanceSign =
                  Number(balanceLocal) < 0
                    ? "rose"
                    : Number(balanceLocal) > 0
                      ? "emerald"
                      : "zinc";

                return (
                  <motion.div
                    key={id}
                    layout
                    initial={{ opacity: 0.8, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <div className="text-sm font-semibold">
                          N° {id} · {subjectLabel}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className={pillClasses("violet")}>
                            {subjectKind}
                          </span>
                          <span className={pillClasses("sky")}>{cur}</span>
                          <span className={pillClasses("zinc")}>
                            Estado:{" "}
                            {(det ?? acc).enabled
                              ? "Habilitada"
                              : "Inhabilitada"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className={pillClasses(balanceSign as Tone)}>
                          Saldo:
                          <b className="ml-1">
                            {balanceLocal == null
                              ? "—"
                              : formatAmount(Number(balanceLocal), cur)}
                          </b>
                        </span>

                        <button
                          type="button"
                          onClick={() => toggleExpand(id)}
                          className="flex items-center gap-2 rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                          aria-expanded={isOpen}
                          aria-controls={`acc-${id}-panel`}
                        >
                          <ChevronIcon open={isOpen} />
                          <span>{isOpen ? "Ocultar" : "Ver detalles"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Panel detalles */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          id={`acc-${id}-panel`}
                          key={`panel-${id}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="mt-4 overflow-hidden"
                        >
                          <div className="space-y-4 border-t border-white/10 pt-4">
                            {/* Estado + toggle */}
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/20 px-3 py-2 text-sm dark:bg-white/5">
                                <input
                                  type="checkbox"
                                  checked={(det ?? acc).enabled}
                                  onChange={(e) =>
                                    toggleEnabled(id, e.target.checked)
                                  }
                                  disabled={busy}
                                />
                                <span>
                                  {(det ?? acc).enabled
                                    ? "Habilitada"
                                    : "Deshabilitada"}
                                </span>
                              </label>
                            </div>

                            {canAdjust && (
                              <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold">
                                    Ajustar saldo (auditado)
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAdjustOpen((m) => ({
                                        ...m,
                                        [id]: !m[id],
                                      }))
                                    }
                                    className="rounded-full bg-sky-100 px-4 py-1.5 text-sm text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white"
                                  >
                                    {adjustOpen[id] ? "Cerrar" : "Ajustar"}
                                  </button>
                                </div>

                                {adjustOpen[id] && (
                                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <div className="md:col-span-1">
                                      <label className="ml-1 block text-xs font-medium opacity-80">
                                        Nuevo saldo (se setea)
                                      </label>
                                      <input
                                        value={adjustTarget[id] ?? ""}
                                        onChange={(e) =>
                                          setAdjustTarget((m) => ({
                                            ...m,
                                            [id]: e.target.value,
                                          }))
                                        }
                                        placeholder="Ej: 150000 o 150.000,50"
                                        className="w-full rounded-2xl border border-white/10 bg-white/20 px-3 py-2 text-sm outline-none dark:bg-white/10"
                                      />
                                      <label className="text-xs opacity-70">
                                        Nuevo:{" "}
                                        <b>
                                          {formatAmount(
                                            Number(adjustTarget[id]),
                                            cur,
                                          )}
                                        </b>
                                      </label>
                                      <div className="mt-2 text-xs opacity-70">
                                        Actual:{" "}
                                        <b>
                                          {formatAmount(
                                            Number(balanceLocal || 0),
                                            cur,
                                          )}
                                        </b>
                                      </div>
                                    </div>

                                    <div className="md:col-span-2">
                                      <label className="ml-1 block text-xs font-medium opacity-80">
                                        Motivo (obligatorio)
                                      </label>
                                      <input
                                        value={adjustReason[id] ?? ""}
                                        onChange={(e) =>
                                          setAdjustReason((m) => ({
                                            ...m,
                                            [id]: e.target.value,
                                          }))
                                        }
                                        placeholder="Ej: Corrección por saldo inicial / conciliación..."
                                        className="w-full rounded-2xl border border-white/10 bg-white/20 px-3 py-2 text-sm outline-none dark:bg-white/10"
                                      />

                                      {(() => {
                                        const target = parseAmountInput(
                                          adjustTarget[id] ?? "",
                                        );
                                        const current = Number(
                                          balanceLocal || 0,
                                        );
                                        const delta =
                                          target == null
                                            ? null
                                            : target - current;
                                        const deltaTone: Tone =
                                          delta == null
                                            ? "zinc"
                                            : delta < 0
                                              ? "rose"
                                              : delta > 0
                                                ? "emerald"
                                                : "zinc";

                                        return (
                                          <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <span
                                              className={pillClasses(deltaTone)}
                                            >
                                              Diferencia:{" "}
                                              <b className="ml-1">
                                                {delta == null
                                                  ? "—"
                                                  : formatAmount(delta, cur)}
                                              </b>
                                            </span>

                                            <button
                                              type="button"
                                              disabled={!!adjusting[id]}
                                              onClick={async () => {
                                                if (!token) return;

                                                const target = parseAmountInput(
                                                  adjustTarget[id] ?? "",
                                                );
                                                if (target == null) {
                                                  toast.error(
                                                    "Ingresá un saldo válido.",
                                                  );
                                                  return;
                                                }
                                                const reason = String(
                                                  adjustReason[id] ?? "",
                                                ).trim();
                                                if (!reason) {
                                                  toast.error(
                                                    "Ingresá un motivo (obligatorio).",
                                                  );
                                                  return;
                                                }

                                                setAdjusting((m) => ({
                                                  ...m,
                                                  [id]: true,
                                                }));
                                                try {
                                                  const r = await authFetch(
                                                    `/api/credit/account/${id}/adjust`,
                                                    {
                                                      method: "POST",
                                                      body: JSON.stringify({
                                                        target_balance: String(
                                                          adjustTarget[id] ??
                                                            "",
                                                        ).trim(),
                                                        reason,
                                                      }),
                                                    },
                                                    token,
                                                  );

                                                  const body =
                                                    (await safeJson<{
                                                      error?: string;
                                                      account?: {
                                                        balance?: unknown;
                                                      };
                                                    }>(r)) ?? {};
                                                  if (!r.ok) {
                                                    throw new Error(
                                                      body.error ||
                                                        "No se pudo ajustar el saldo",
                                                    );
                                                  }

                                                  toast.success(
                                                    "Saldo ajustado (queda registrado).",
                                                  );

                                                  // refrescar lista + detalles
                                                  await (async () => {
                                                    // 1) refrescar detalles (para ver el asiento nuevo)
                                                    setDetailsLoading((m) => ({
                                                      ...m,
                                                      [id]: true,
                                                    }));
                                                    try {
                                                      const dres =
                                                        await authFetch(
                                                          `/api/credit/account/${id}`,
                                                          { cache: "no-store" },
                                                          token,
                                                        );
                                                      if (dres.ok) {
                                                        const dj =
                                                          await safeJson<CreditAccount>(
                                                            dres,
                                                          );
                                                        if (dj) {
                                                          setDetails(
                                                            (prev) => ({
                                                              ...prev,
                                                              [id]: dj,
                                                            }),
                                                          );
                                                          setItems((prev) =>
                                                            prev.map((a) =>
                                                              a.id_credit_account ===
                                                              id
                                                                ? {
                                                                    ...a,
                                                                    balance:
                                                                      dj.balance,
                                                                  }
                                                                : a,
                                                            ),
                                                          );
                                                        }
                                                      }
                                                    } finally {
                                                      setDetailsLoading(
                                                        (m) => ({
                                                          ...m,
                                                          [id]: false,
                                                        }),
                                                      );
                                                    }
                                                  })();

                                                  setAdjustOpen((m) => ({
                                                    ...m,
                                                    [id]: false,
                                                  }));
                                                  setAdjustTarget((m) => ({
                                                    ...m,
                                                    [id]: "",
                                                  }));
                                                  setAdjustReason((m) => ({
                                                    ...m,
                                                    [id]: "",
                                                  }));
                                                } catch (e) {
                                                  toast.error(
                                                    e instanceof Error
                                                      ? e.message
                                                      : "Error al ajustar",
                                                  );
                                                } finally {
                                                  setAdjusting((m) => ({
                                                    ...m,
                                                    [id]: false,
                                                  }));
                                                }
                                              }}
                                              className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-sm font-medium text-emerald-900 disabled:opacity-60 dark:text-emerald-200"
                                            >
                                              {adjusting[id]
                                                ? "Guardando..."
                                                : "Confirmar ajuste"}
                                            </button>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Movimientos recientes */}
                            <div>
                              <p className="mb-2 text-sm font-semibold">
                                Movimientos recientes
                              </p>
                              {detailsLoading[id] ? (
                                <div className="flex h-20 items-center">
                                  <Spinner />
                                </div>
                              ) : (det?.recentEntries || []).length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm">
                                  No hay movimientos recientes.
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {(det?.recentEntries || []).map((m) => {
                                    const signed = signedByDocType(
                                      m.amount,
                                      m.doc_type,
                                    );
                                    const amtTone: Tone =
                                      signed < 0
                                        ? "rose"
                                        : signed > 0
                                          ? "emerald"
                                          : "zinc";
                                    const meta = docTypeMeta(m.doc_type);

                                    return (
                                      <div
                                        key={m.id_entry}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm"
                                      >
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <div className="font-medium">
                                              {m.concept || "Movimiento"}
                                            </div>

                                            <span
                                              className={pillClasses(meta.tone)}
                                            >
                                              {meta.icon}
                                              {meta.label}
                                            </span>
                                          </div>

                                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                                            <span
                                              className={pillClasses("zinc")}
                                            >
                                              {formatDateSafe(m.created_at)}
                                            </span>
                                            <span
                                              className={pillClasses("zinc")}
                                            >
                                              Entry N° {m.id_entry}
                                            </span>

                                            {m.createdBy?.first_name ||
                                            m.createdBy?.last_name ? (
                                              <span
                                                className={pillClasses("zinc")}
                                              >
                                                {`${m.createdBy?.first_name ?? ""} ${m.createdBy?.last_name ?? ""}`.trim()}
                                              </span>
                                            ) : null}
                                          </div>
                                        </div>

                                        <div className="text-right">
                                          <div className={pillClasses(amtTone)}>
                                            {formatAmount(
                                              Number(signed),
                                              m.currency || cur,
                                            )}
                                          </div>

                                          <div className="mt-1 text-xs opacity-60">
                                            {m.booking_id
                                              ? `Reserva ${m.booking_id}`
                                              : m.receipt_id
                                                ? `Recibo ${m.receipt_id}`
                                                : m.investment_id
                                                  ? `Gasto ${m.investment_id}`
                                                  : m.operator_due_id
                                                    ? `Cuota Op. ${m.operator_due_id}`
                                                    : ""}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}

              {cursor && (
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

          <ToastContainer position="bottom-right" />
        </section>
      )}
    </ProtectedRoute>
  );
}
