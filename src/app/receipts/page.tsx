// src/app/receipts/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

/* ================= Helpers módulo (evita deps en useMemo) ================= */
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

/* ================= Estilos compartidos ================= */
const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const ICON_BTN =
  "rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-[.98] active:scale-95 dark:bg-white/10 dark:text-white";
const CHIP =
  "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs shadow-sm";
const BADGE =
  "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium border border-white/10 bg-white/10";

/* ================= Tipos de API ================= */
type ReceiptRow = {
  id_receipt: number;
  receipt_number: string;
  issue_date: string | null;
  amount: number;
  amount_currency: "ARS" | "USD" | string;
  concept: string;
  currency?: string | null; // descripción (legado)
  payment_method?: string | null;
  account?: string | null;
  base_amount?: string | number | null;
  base_currency?: "ARS" | "USD" | string | null;
  counter_amount?: string | number | null;
  counter_currency?: "ARS" | "USD" | string | null;
  serviceIds?: number[] | null;
  clientIds?: number[] | null;
  booking: {
    id_booking: number;
    user?: {
      id_user: number;
      first_name: string | null;
      last_name: string | null;
      role?: string | null;
    } | null;
    titular?: {
      id_client: number;
      first_name: string | null;
      last_name: string | null;
    } | null;
  };
};

type ReceiptsAPI = {
  items: ReceiptRow[];
  nextCursor: number | null;
  error?: string;
};

type User = {
  id_user: number;
  first_name: string | null;
  last_name: string | null;
  role?: string | null;
};

/* ======= Picks desde /api/finance/config ======= */
type FinanceCurrencyPick = { code: string; name: string; enabled: boolean };
type FinancePickBundle = {
  accounts: { id_account: number; name: string; enabled: boolean }[];
  paymentMethods: { id_method: number; name: string; enabled: boolean }[];
  currencies: FinanceCurrencyPick[];
};

/* DTOs seguros para parsear /api/finance/config sin any */
type AccountsDTO = Array<{
  id_account?: number;
  name?: string;
  enabled?: boolean;
}>;

type MethodsDTO = Array<{
  id_method?: number;
  name?: string;
  enabled?: boolean;
}>;

type CurrenciesDTO = Array<{
  code?: string;
  name?: string;
  enabled?: boolean;
}>;

/* ============ Normalizado para UI/CSV ============ */
type NormalizedReceipt = ReceiptRow & {
  _dateLabel: string;
  _amountLabel: string;
  _ownerFull: string;
  _titularFull: string;
  _convLabel: string; // "Base → Contra" si aplica
};

type SortKey = "issue_date" | "receipt_number" | "amount" | "owner";

/* ================= Page ================= */
export default function ReceiptsPage() {
  const { token, user } = useAuth() as {
    token?: string | null;
    user?: { id_user?: number; role?: string } | null;
  };

  const role = (user?.role || "").toLowerCase();
  const isVendor = role === "vendedor";
  const canPickOwner = [
    "gerente",
    "administrativo",
    "desarrollador",
    "lider",
  ].includes(role);

  /* ---------- Filtros ---------- */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState("");
  const [ownerId, setOwnerId] = useState<number | 0>(0);
  const [currency, setCurrency] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [account, setAccount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("issue_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  /* ---------- Data / paginado ---------- */
  const TAKE = 24;
  const [data, setData] = useState<ReceiptRow[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageInit, setPageInit] = useState(false);

  /* ---------- Config financiera (para opciones de filtros) ---------- */
  const [finance, setFinance] = useState<FinancePickBundle | null>(null);
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await authFetch(
          "/api/finance/config",
          { cache: "no-store" },
          token,
        );
        if (!res.ok) return;

        const j = (await res.json()) as Partial<{
          accounts: AccountsDTO;
          paymentMethods: MethodsDTO;
          currencies: CurrenciesDTO;
        }>;

        const accounts: FinancePickBundle["accounts"] =
          (j.accounts ?? [])
            .filter(
              (
                a,
              ): a is { id_account: number; name: string; enabled?: boolean } =>
                typeof a?.id_account === "number" &&
                typeof a?.name === "string",
            )
            .map((a) => ({
              id_account: a.id_account,
              name: a.name,
              enabled: Boolean(a.enabled),
            })) ?? [];

        const paymentMethods: FinancePickBundle["paymentMethods"] =
          (j.paymentMethods ?? [])
            .filter(
              (
                m,
              ): m is { id_method: number; name: string; enabled?: boolean } =>
                typeof m?.id_method === "number" && typeof m?.name === "string",
            )
            .map((m) => ({
              id_method: m.id_method,
              name: m.name,
              enabled: Boolean(m.enabled),
            })) ?? [];

        const currencies: FinancePickBundle["currencies"] =
          (j.currencies ?? [])
            .filter(
              (c): c is { code: string; name: string; enabled?: boolean } =>
                typeof c?.code === "string" && typeof c?.name === "string",
            )
            .map((c) => ({
              code: String(c.code).toUpperCase(),
              name: c.name,
              enabled: Boolean(c.enabled),
            })) ?? [];

        setFinance({ accounts, paymentMethods, currencies });
      } catch {
        setFinance(null);
      }
    })();
  }, [token]);

  /* ---------- Vendedores (desde API + fallback) ---------- */
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await authFetch("/api/users", { cache: "no-store" }, token);
        if (res.ok) {
          const list = (await res.json()) as User[];
          setUsers(Array.isArray(list) ? list : []);
        }
      } catch {
        setUsers([]);
      }
    })();
  }, [token]);

  const ownerOptionsFromData = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of data) {
      const u = r.booking?.user;
      if (!u?.id_user) continue;
      const name =
        `${u.first_name || ""} ${u.last_name || ""}`.trim() || `#${u.id_user}`;
      map.set(u.id_user, name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const vendorOptions = useMemo(() => {
    const primary =
      users.filter((u) => (u.role || "").toLowerCase() === "vendedor").length >
      0
        ? users.filter((u) => (u.role || "").toLowerCase() === "vendedor")
        : users;

    const base = primary.map((u) => ({
      id: u.id_user,
      name:
        `${u.first_name || ""} ${u.last_name || ""}`.trim() || `#${u.id_user}`,
    }));

    const seen = new Set(base.map((o) => o.id));
    for (const o of ownerOptionsFromData) {
      if (!seen.has(o.id)) base.push(o);
    }

    return base.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [users, ownerOptionsFromData]);

  /* ---------- Helpers ---------- */
  const fmtMoney = useCallback((v: number, cur: string) => {
    const c = String(cur || "ARS").toUpperCase();
    try {
      const s = new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: c,
      }).format(v);
      return c === "USD" ? s.replace("US$", "U$D") : s;
    } catch {
      const sym = c === "USD" ? "U$D" : c === "ARS" ? "$" : `${c} `;
      return `${sym}${(v ?? 0).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
  }, []);

  const toNum = (x: unknown) => {
    const n =
      typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
    return Number.isFinite(n) ? (n as number) : 0;
  };

  /* ---------- Forzar owner para vendedor ---------- */
  useEffect(() => {
    if (isVendor && user?.id_user) setOwnerId(user.id_user);
  }, [isVendor, user?.id_user]);

  /* ---------- Opciones de filtros (desde Config con fallback a data) ---------- */
  const paymentMethodOptions = useMemo(() => {
    const fromConfig =
      finance?.paymentMethods?.filter((m) => m.enabled).map((m) => m.name) ??
      [];
    if (fromConfig.length) return uniqSorted(fromConfig);

    const fromData = Array.from(
      new Set(
        data
          .map((r) => (r.payment_method || r.currency || "").trim())
          .filter(Boolean),
      ),
    );
    return uniqSorted(fromData);
  }, [finance?.paymentMethods, data]);

  const accountOptions = useMemo(() => {
    const fromConfig =
      finance?.accounts?.filter((a) => a.enabled).map((a) => a.name) ?? [];
    if (fromConfig.length) return uniqSorted(fromConfig);

    const fromData = Array.from(
      new Set(data.map((r) => (r.account || "").trim()).filter(Boolean)),
    );
    return uniqSorted(fromData);
  }, [finance?.accounts, data]);

  const currencyDict = useMemo(() => {
    const d: Record<string, string> = {};
    for (const c of finance?.currencies || []) {
      if (c.enabled) d[c.code.toUpperCase()] = c.name;
    }
    return d;
  }, [finance?.currencies]);

  const currencyOptions = useMemo(() => {
    const fromConfig =
      finance?.currencies
        ?.filter((c) => c.enabled)
        .map((c) => c.code.toUpperCase()) ?? [];
    if (fromConfig.length) return uniqSorted(fromConfig);

    const fromData = Array.from(
      new Set(
        data
          .flatMap((r) => [
            r.amount_currency,
            r.base_currency,
            r.counter_currency,
          ])
          .filter(Boolean)
          .map((c) => String(c).toUpperCase()),
      ),
    );
    return uniqSorted(fromData);
  }, [finance?.currencies, data]);

  /* ---------- Normalizado ---------- */
  const normalized = useMemo<NormalizedReceipt[]>(() => {
    return data.map((r) => {
      const dateLabel = r.issue_date
        ? new Date(r.issue_date).toLocaleDateString("es-AR")
        : "—";
      const amountLabel = fmtMoney(r.amount || 0, r.amount_currency || "ARS");
      const ownerFull = r.booking?.user
        ? `${r.booking.user.first_name || ""} ${r.booking.user.last_name || ""}`.trim()
        : "";
      const titularFull = r.booking?.titular
        ? `${r.booking.titular.first_name || ""} ${r.booking.titular.last_name || ""}`.trim()
        : "";
      const hasBase = r.base_amount != null && r.base_currency;
      const hasCounter = r.counter_amount != null && r.counter_currency;
      const convLabel =
        hasBase || hasCounter
          ? `${hasBase ? fmtMoney(toNum(r.base_amount), r.base_currency || "ARS") : "—"} → ${
              hasCounter
                ? fmtMoney(toNum(r.counter_amount), r.counter_currency || "ARS")
                : "—"
            }`
          : "—";

      return {
        ...r,
        _dateLabel: dateLabel,
        _amountLabel: amountLabel,
        _ownerFull: ownerFull || "—",
        _titularFull: titularFull || "—",
        _convLabel: convLabel,
      };
    });
  }, [data, fmtMoney]);

  /* ---------- Orden en cliente ---------- */
  const displayRows = useMemo(() => {
    const rows = [...normalized];
    const dir = sortDir === "asc" ? 1 : -1;

    rows.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case "issue_date":
          va = a.issue_date ? new Date(a.issue_date).getTime() : 0;
          vb = b.issue_date ? new Date(b.issue_date).getTime() : 0;
          break;
        case "receipt_number":
          va = a.receipt_number || "";
          vb = b.receipt_number || "";
          break;
        case "amount":
          va = a.amount || 0;
          vb = b.amount || 0;
          break;
        case "owner":
          va = a._ownerFull || "";
          vb = b._ownerFull || "";
          break;
      }
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb, "es") * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });

    return rows;
  }, [normalized, sortKey, sortDir]);

  /* ---------- KPIs ---------- */
  const kpis = useMemo(() => {
    const count = normalized.length;
    let ars = 0,
      usd = 0;
    for (const r of normalized) {
      if (String(r.amount_currency).toUpperCase() === "USD")
        usd += r.amount || 0;
      else ars += r.amount || 0;
    }
    return { count, ars, usd };
  }, [normalized]);

  /* ---------- Build querystring ---------- */
  const buildQS = useCallback(
    (withCursor?: number | null) => {
      const qs = new URLSearchParams();
      if (q.trim()) qs.append("q", q.trim());

      const wantedUserId =
        isVendor && user?.id_user ? user.id_user : canPickOwner ? ownerId : 0;
      if (wantedUserId) qs.append("userId", String(wantedUserId));

      if (currency) qs.append("currency", currency);
      if (paymentMethod) qs.append("payment_method", paymentMethod);
      if (account) qs.append("account", account);
      if (from) qs.append("from", from);
      if (to) qs.append("to", to);
      if (minAmount.trim()) qs.append("minAmount", minAmount.trim());
      if (maxAmount.trim()) qs.append("maxAmount", maxAmount.trim());

      qs.append("take", String(TAKE));
      if (withCursor !== undefined && withCursor !== null) {
        qs.append("cursor", String(withCursor));
      }
      return qs;
    },
    [
      q,
      isVendor,
      user?.id_user,
      canPickOwner,
      ownerId,
      currency,
      paymentMethod,
      account,
      from,
      to,
      minAmount,
      maxAmount,
    ],
  );

  /* ---------- Fetch ---------- */
  const fetchPage = useCallback(
    async (resetList: boolean) => {
      setLoading(true);
      try {
        const qs = buildQS(resetList ? undefined : cursor);
        const res = await authFetch(
          `/api/receipts?${qs.toString()}`,
          { cache: "no-store" },
          token || undefined,
        );
        const json: ReceiptsAPI = await res.json();
        if (!res.ok) throw new Error(json?.error || "Error al cargar recibos");
        setData((prev) => (resetList ? json.items : [...prev, ...json.items]));
        setCursor(json.nextCursor ?? null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar recibos";
        toast.error(msg);
      } finally {
        setLoading(false);
        setPageInit(true);
      }
    },
    [buildQS, cursor, token],
  );

  const handleSearch = () => {
    setCursor(null);
    setData([]);
    fetchPage(true);
  };

  useEffect(() => {
    if (data.length === 0 && !loading) fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- CSV (scan multipágina) ---------- */
  const downloadCSV = async () => {
    try {
      const headers = [
        "Fecha",
        "N° Recibo",
        "Reserva",
        "Titular",
        "Vendedor",
        "Método",
        "Cuenta",
        "Importe",
        "Conversión",
        "Concepto",
        "Servicios",
        "Clientes",
      ].join(";");

      let next: number | null = null;
      const rows: string[] = [];

      for (let i = 0; i < 300; i++) {
        const qs = buildQS(next);
        const res = await authFetch(
          `/api/receipts?${qs.toString()}`,
          { cache: "no-store" },
          token || undefined,
        );
        const json: ReceiptsAPI = await res.json();
        if (!res.ok) throw new Error(json?.error || "Error al exportar CSV");

        const pageNorm: NormalizedReceipt[] = json.items.map((r) => ({
          ...r,
          _dateLabel: r.issue_date
            ? new Date(r.issue_date).toLocaleDateString("es-AR")
            : "—",
          _amountLabel: fmtMoney(r.amount || 0, r.amount_currency || "ARS"),
          _ownerFull: r.booking?.user
            ? `${r.booking.user.first_name || ""} ${r.booking.user.last_name || ""}`.trim() ||
              "—"
            : "—",
          _titularFull: r.booking?.titular
            ? `${r.booking.titular.first_name || ""} ${r.booking.titular.last_name || ""}`.trim() ||
              "—"
            : "—",
          _convLabel:
            r.base_amount || r.counter_amount
              ? `${fmtMoney(toNum(r.base_amount), r.base_currency || "ARS")} → ${fmtMoney(toNum(r.counter_amount), r.counter_currency || "ARS")}`
              : "—",
        }));

        for (const r of pageNorm) {
          const cells = [
            r._dateLabel,
            r.receipt_number,
            String(r.booking?.id_booking ?? ""),
            r._titularFull,
            r._ownerFull,
            r.payment_method || r.currency || "",
            r.account || "",
            r._amountLabel,
            r._convLabel,
            r.concept || "",
            String(r.serviceIds?.length ?? 0),
            String(r.clientIds?.length ?? 0),
          ];
          rows.push(
            cells
              .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`)
              .join(";"),
          );
        }

        next = json.nextCursor ?? null;
        if (next === null) break;
      }

      const csv = [headers, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipts_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al descargar CSV";
      toast.error(msg);
    }
  };

  /* ---------- Acciones filtros ---------- */
  const clearFilters = () => {
    setQ("");
    if (!isVendor) setOwnerId(0);
    setCurrency("");
    setPaymentMethod("");
    setAccount("");
    setFrom("");
    setTo("");
    setMinAmount("");
    setMaxAmount("");
  };

  const setQuickRange = (preset: "last7" | "thisMonth") => {
    const now = new Date();
    if (preset === "last7") {
      const toD = now.toISOString().slice(0, 10);
      const fromD = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      setFrom(fromD);
      setTo(toD);
    } else {
      const year = now.getFullYear();
      const month = now.getMonth();
      const first = new Date(year, month, 1).toISOString().slice(0, 10);
      const last = new Date(year, month + 1, 0).toISOString().slice(0, 10);
      setFrom(first);
      setTo(last);
    }
  };

  /* ================= UI ================= */
  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        {/* Encabezado + KPIs */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              Receipts / Entradas de dinero
            </h1>
            <p className="text-sm opacity-70">
              Visualizá los recibos emitidos por la agencia.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={CHIP}>Total: {kpis.count}</span>
            <span className={CHIP}>
              ARS:{" "}
              {new Intl.NumberFormat("es-AR", {
                style: "currency",
                currency: "ARS",
              }).format(kpis.ars)}
            </span>
            <span className={CHIP}>
              USD:{" "}
              {new Intl.NumberFormat("es-AR", {
                style: "currency",
                currency: "USD",
              }).format(kpis.usd)}
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={ICON_BTN}
          >
            {filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>

          {/* Orden */}
          <div className={`${CHIP} gap-2`}>
            <span className="opacity-70">Ordenar por</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="cursor-pointer rounded-full border border-white/10 bg-white/10 px-2 py-1 outline-none dark:bg-white/10"
            >
              <option value="issue_date">Fecha</option>
              <option value="receipt_number">N° recibo</option>
              <option value="amount">Importe</option>
              <option value="owner">Vendedor</option>
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="rounded-full bg-white/10 px-2 py-1 text-xs"
              title="Asc/Desc"
            >
              {sortDir === "asc" ? "Asc" : "Desc"}
            </button>
          </div>

          <button onClick={downloadCSV} className={ICON_BTN}>
            Exportar CSV
          </button>
        </div>

        {/* Filtros */}
        {filtersOpen && (
          <div className={`${GLASS} mb-6 p-4`}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-4">
                <Label>Buscar</Label>
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="N° recibo, concepto, 'UN MILLON...', #reserva..."
                />
              </div>

              <div className="md:col-span-3">
                <Label>Vendedor</Label>
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(Number(e.target.value))}
                  disabled={!canPickOwner && isVendor}
                  className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-3 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                >
                  {!isVendor && <option value={0}>Todos</option>}
                  {isVendor && user?.id_user && (
                    <option value={user.id_user}>Mis ventas</option>
                  )}
                  {vendorOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <Label>Moneda</Label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-3 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                >
                  <option value="">Todas</option>
                  {currencyOptions.map((code) => (
                    <option key={code} value={code}>
                      {currencyDict[code]
                        ? `${code} — ${currencyDict[code]}`
                        : code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <Label>Método de pago</Label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-3 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                >
                  <option value="">Todos</option>
                  {paymentMethodOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <Label>Cuenta</Label>
                <select
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-3 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                >
                  <option value="">Todas</option>
                  {accountOptions.map((acc) => (
                    <option key={acc} value={acc}>
                      {acc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <Label>Desde</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <Label>Hasta</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>

              <div className="flex items-end gap-2 md:col-span-6">
                <button
                  onClick={() => setQuickRange("last7")}
                  className={ICON_BTN}
                >
                  Últimos 7 días
                </button>
                <button
                  onClick={() => setQuickRange("thisMonth")}
                  className={ICON_BTN}
                >
                  Mes actual
                </button>
              </div>

              <div className="md:col-span-3">
                <Label>Importe mín.</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="md:col-span-3">
                <Label>Importe máx.</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="∞"
                />
              </div>

              <div className="flex flex-wrap items-end justify-end gap-2 md:col-span-12">
                <button onClick={clearFilters} className={ICON_BTN}>
                  Limpiar
                </button>
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className={`${ICON_BTN} disabled:opacity-50`}
                >
                  {loading ? <Spinner /> : "Aplicar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LISTA (estilo investments) */}
        {loading && displayRows.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner />
          </div>
        ) : displayRows.length === 0 && pageInit ? (
          <div className={`${GLASS} p-6 text-center`}>No hay resultados.</div>
        ) : (
          <div className="space-y-3">
            {displayRows.map((r) => {
              const servicesCount = r.serviceIds?.length ?? 0;
              const clientsCount = r.clientIds?.length ?? 0;
              const cur = String(r.amount_currency).toUpperCase();
              return (
                <article
                  key={r.id_receipt}
                  className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-white"
                >
                  {/* Encabezado */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm opacity-70">
                        #{r.receipt_number}
                      </span>
                      <button
                        className={`${BADGE}`}
                        onClick={() => {
                          if (
                            typeof navigator !== "undefined" &&
                            navigator.clipboard
                          ) {
                            navigator.clipboard
                              .writeText(r.receipt_number)
                              .then(
                                () => toast.success("N° de recibo copiado"),
                                () => toast.error("No se pudo copiar"),
                              );
                          }
                        }}
                        title="Copiar N° recibo"
                      >
                        Copiar
                      </button>
                      <span className={`${BADGE}`}>{r._dateLabel}</span>
                      <span className={`${BADGE}`}>{cur}</span>
                    </div>
                    <div className="text-base font-semibold">
                      {r._amountLabel}
                    </div>
                  </div>

                  {/* Concepto */}
                  <div className="mt-1 text-lg opacity-90">
                    {r.concept || "—"}
                  </div>

                  {/* Meta principal */}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <span className={CHIP}>
                      <b>Reserva:</b>
                      <Link
                        href={`/bookings/services/${r.booking?.id_booking}`}
                        target="_blank"
                        className="underline decoration-transparent hover:decoration-sky-600"
                      >
                        {r.booking?.id_booking}
                      </Link>
                    </span>

                    <span className={CHIP}>
                      <b>Vendedor:</b> {r._ownerFull}
                    </span>

                    <span className={CHIP}>
                      <b>Titular:</b> {r._titularFull}
                    </span>

                    {(r.payment_method || r.currency) && (
                      <span className={CHIP}>
                        <b>Método:</b> {r.payment_method || r.currency}
                      </span>
                    )}

                    {r.account && (
                      <span className={CHIP}>
                        <b>Cuenta:</b> {r.account}
                      </span>
                    )}

                    {r._convLabel !== "—" && (
                      <span className={CHIP}>
                        <b>Conversión:</b> {r._convLabel}
                      </span>
                    )}

                    <span className={CHIP}>
                      <b>Servicios:</b> {servicesCount}
                    </span>

                    <span className={CHIP}>
                      <b>Clientes:</b> {clientsCount}
                    </span>
                  </div>
                </article>
              );
            })}

            {/* Paginado */}
            <div className="flex justify-center">
              <button
                onClick={() => fetchPage(false)}
                disabled={loading || cursor === null}
                className={`${ICON_BTN} disabled:opacity-50`}
              >
                {cursor === null ? (
                  "No hay más"
                ) : loading ? (
                  <Spinner />
                ) : (
                  "Ver más"
                )}
              </button>
            </div>
          </div>
        )}

        <ToastContainer position="bottom-right" />
      </section>
    </ProtectedRoute>
  );
}

/* ================= UI atoms ================= */
function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs opacity-70">{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`block w-full min-w-fit appearance-none rounded-3xl border border-white/30 bg-white/10 px-4 py-2 outline-none backdrop-blur placeholder:opacity-60 dark:border-white/10 dark:bg-white/10 ${
        props.className || ""
      }`}
    />
  );
}
