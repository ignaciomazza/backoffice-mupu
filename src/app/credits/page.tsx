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
  amount: number;
  currency: string;
  concept?: string | null;
  doc_type?: string | null;
  booking_id?: number | null;
  receipt_id?: number | null;
  investment_id?: number | null;
  operator_due_id?: number | null;
};

type CreditAccount = {
  id_credit_account: number;
  id_agency: number;

  client_id?: number | null;
  operator_id?: number | null;

  currency: string;
  balance: number | string; // Decimal serializado
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
  // Reemplazá tu useEffect de operadores por este
  useEffect(() => {
    if (!token) return;

    // ⛔️ No llames al endpoint hasta tener agencyId
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
          // Silenciar el 400 típico “Debe proporcionar agencyId”
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
    if (!token) return;
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
  }, [buildQuery, token]);

  useEffect(() => {
    if (!token || agencyId == null) return;
    fetchList();
  }, [token, agencyId, fetchList]);

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

  /* ---------- Expand & lazy details ---------- */
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, CreditAccount>>({});
  const [detailsLoading, setDetailsLoading] = useState<Record<number, boolean>>(
    {},
  );

  const fetchDetails = useCallback(
    async (id: number) => {
      if (!token || details[id]) {
        setExpandedId((prev) => (prev === id ? null : id));
        return;
      }
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
          setExpandedId((prev) => (prev === id ? null : id));
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

      // Tipado sin `any`
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
              <button
                type="button"
                onClick={() => setIsFormVisible((v) => !v)}
                className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                aria-expanded={isFormVisible}
                aria-controls="credit-account-form"
              >
                {isFormVisible ? "Ocultar formulario" : "Nueva cuenta"}
              </button>
              <div className="text-xs opacity-70">
                Rol: <b>{(user?.role || role || "-") as string}</b>
              </div>
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
              className="h-full cursor-pointer appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
              title="Limpiar filtros"
            >
              Limpiar
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
                const isOpen = expandedId === id;
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

                return (
                  <div
                    key={id}
                    className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <div className="text-sm font-semibold">
                          #{id} · {subjectLabel}
                        </div>
                        <div className="text-xs opacity-70">
                          {subjectKind} · {cur}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="rounded-xl border border-white/10 bg-white/20 px-3 py-1 text-sm dark:bg-white/5">
                          Saldo:{" "}
                          <b>
                            {balanceLocal == null
                              ? "—"
                              : formatAmount(Number(balanceLocal), cur)}
                          </b>
                        </div>

                        <button
                          type="button"
                          onClick={() => fetchDetails(id)}
                          className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                          aria-expanded={isOpen}
                          aria-controls={`acc-${id}-panel`}
                        >
                          {isOpen ? "Ocultar" : "Ver detalles"}
                        </button>
                      </div>
                    </div>

                    {/* Panel detalles */}
                    {isOpen && (
                      <div
                        id={`acc-${id}-panel`}
                        className="mt-4 space-y-4 border-t border-white/10 pt-4"
                      >
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
                              {(det?.recentEntries || []).map((m) => (
                                <div
                                  key={m.id_entry}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm"
                                >
                                  <div className="min-w-0">
                                    <div className="font-medium">
                                      {m.concept || "Movimiento"}
                                    </div>
                                    <div className="text-xs opacity-70">
                                      {formatDateSafe(m.created_at)} ·{" "}
                                      {m.doc_type || "-"} · #{m.id_entry}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div
                                      className={[
                                        "font-semibold",
                                        m.amount > 0
                                          ? "text-red-600"
                                          : "text-green-600",
                                      ].join(" ")}
                                    >
                                      {formatAmount(
                                        Number(m.amount),
                                        m.currency || cur,
                                      )}
                                    </div>
                                    <div className="text-xs opacity-60">
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
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
