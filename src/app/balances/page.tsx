// src/app/balances/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { authFetch } from "@/utils/authFetch";
import { useAuth } from "@/context/AuthContext";

/* ================= Tipos ================= */
type UserLite = {
  id_user: number;
  first_name: string;
  last_name: string;
};

interface Booking {
  id_booking: number;
  clientStatus: string;
  operatorStatus: string;
  status?: string;
  creation_date: string;
  departure_date?: string | null;
  return_date?: string | null;
  titular: {
    first_name: string;
    last_name: string;
  };
  user?: UserLite | null;
  services: {
    sale_price: number;
    currency: "ARS" | "USD";
    card_interest?: number;
  }[];
  Receipt: {
    amount: number;
    amount_currency: "ARS" | "USD";
    base_amount?: number | string | null;
    base_currency?: "ARS" | "USD" | null;
    counter_amount?: number | string | null;
    counter_currency?: "ARS" | "USD" | null;
  }[];
}

type BookingsAPI = {
  items: Booking[];
  nextCursor: number | null;
  error?: string;
};

/* ====== Tipo normalizado para la tabla / export ====== */
type NormalizedBooking = Booking & {
  _titularFull: string;
  _ownerFull: string;
  _saleNoInt: Record<"ARS" | "USD", number>;
  _saleWithInt: Record<"ARS" | "USD", number>;
  _paid: Record<"ARS" | "USD", number>;
  _debt: { ARS: number; USD: number };
  _saleLabel: string;
  _paidLabel: string;
  _debtLabel: string;
  _depDate: Date | null;
  _retDate: Date | null;
  _travelLabel: string;
};

/* ================= Estilos compartidos (glass / sky) ================= */
const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const CHIP =
  "inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 backdrop-blur px-3 py-1.5 text-sm shadow-sm shadow-sky-900/5 dark:bg-white/10 dark:border-white/10";
const ICON_BTN =
  "rounded-3xl bg-sky-600/30 px-3 py-1.5 text-sm text-sky-950/80 hover:text-sky-950 dark:text-white shadow-sm shadow-sky-900/10 hover:bg-sky-600/30 border border-sky-600/30 active:scale-[.99] transition";
const PRIMARY_BTN =
  "rounded-3xl bg-sky-600/30 px-3 py-1.5 text-sm text-sky-950/80 hover:text-sky-950 dark:text-white shadow-sm shadow-sky-900/10 hover:bg-sky-600/30 border border-sky-600/30 active:scale-[.99] transition";
const BADGE =
  "inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium";

/* ================= Columnas visibles ================= */
type VisibleKey =
  | "id_booking"
  | "titular"
  | "owner"
  | "clientStatus"
  | "operatorStatus"
  | "creation_date"
  | "travel"
  | "sale_total"
  | "paid_total"
  | "debt_total";

type ColumnDef = { key: VisibleKey; label: string; always?: boolean };

const ALL_COLUMNS: ColumnDef[] = [
  { key: "id_booking", label: "Reserva", always: true },
  { key: "titular", label: "Titular", always: true },
  { key: "owner", label: "Vendedor" },
  { key: "clientStatus", label: "Cliente" },
  { key: "operatorStatus", label: "Operador" },
  { key: "creation_date", label: "Creación" },
  { key: "travel", label: "Viaje" },
  { key: "sale_total", label: "Venta (sin int.)" },
  { key: "paid_total", label: "Cobrado" },
  { key: "debt_total", label: "Deuda" },
];

/* ================= Utilidades ================= */
function formatDateAR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR");
}
const toNum = (v: number | string | null | undefined) => {
  const n =
    typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

const TAKE = 120;

/* ================= Page ================= */
export default function BalancesPage() {
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
  const [clientStatusArr, setClientStatusArr] = useState<string[]>([]);
  const [operatorStatusArr, setOperatorStatusArr] = useState<string[]>([]);
  const [dateMode, setDateMode] = useState<"travel" | "creation">("travel");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  /* ---------- Datos tabla/paginación ---------- */
  const [data, setData] = useState<Booking[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageInit, setPageInit] = useState(false);

  /* ---------- Densidad / layout ---------- */
  type Density = "comfortable" | "compact";
  const [density, setDensity] = useState<Density>("comfortable");
  const STORAGE_KEY_COLS = "balances-columns-v1";
  const STORAGE_KEY_DENS = "balances-density-v1";

  useEffect(() => {
    const d = localStorage.getItem(STORAGE_KEY_DENS);
    if (d === "comfortable" || d === "compact") setDensity(d);
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DENS, density);
  }, [density]);

  /* ---------- Formatos moneda ---------- */
  const fmtARS = useCallback(
    (v: number) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
      }).format(v),
    [],
  );
  const fmtUSD = useCallback(
    (v: number) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "USD",
      })
        .format(v)
        .replace("US$", "U$D"),
    [],
  );

  /* ---------- Helpers económico-contables ---------- */
  const sumByCurrency = useCallback(
    (services: Booking["services"], withInterest: boolean) => {
      return services.reduce<Record<"ARS" | "USD", number>>(
        (acc, s) => {
          const extra = withInterest ? (s.card_interest ?? 0) : 0;
          acc[s.currency] = (acc[s.currency] || 0) + s.sale_price + extra;
          return acc;
        },
        { ARS: 0, USD: 0 },
      );
    },
    [],
  );

  const sumReceiptsByCurrency = useCallback((receipts: Booking["Receipt"]) => {
    return receipts.reduce<Record<"ARS" | "USD", number>>(
      (acc, r) => {
        if (
          r.counter_currency &&
          r.counter_amount !== null &&
          r.counter_amount !== undefined
        ) {
          const cur = r.counter_currency;
          const val = toNum(r.counter_amount);
          acc[cur] = (acc[cur] || 0) + val;
        } else if (r.amount_currency) {
          const cur = r.amount_currency;
          const val = toNum(r.amount);
          acc[cur] = (acc[cur] || 0) + val;
        }
        return acc;
      },
      { ARS: 0, USD: 0 },
    );
  }, []);

  /* ---------- Normalizador reutilizable ---------- */
  const normalizeBooking = useCallback(
    (b: Booking): NormalizedBooking => {
      const titularFull =
        `${b.titular.last_name ?? ""} ${b.titular.first_name ?? ""}`.trim();
      const ownerFull =
        b.user?.first_name || b.user?.last_name
          ? `${b.user?.first_name || ""} ${b.user?.last_name || ""}`.trim()
          : "";

      const saleNoInt = sumByCurrency(b.services, false);
      const saleWithInt = sumByCurrency(b.services, true);
      const paid = sumReceiptsByCurrency(b.Receipt);
      const debt = {
        ARS: (saleWithInt.ARS || 0) - (paid.ARS || 0),
        USD: (saleWithInt.USD || 0) - (paid.USD || 0),
      };

      const saleLabel = [
        saleNoInt.ARS ? fmtARS(saleNoInt.ARS) : "",
        saleNoInt.USD ? fmtUSD(saleNoInt.USD) : "",
      ]
        .filter(Boolean)
        .join(" y ");
      const paidLabel = [
        paid.ARS ? fmtARS(paid.ARS) : "",
        paid.USD ? fmtUSD(paid.USD) : "",
      ]
        .filter(Boolean)
        .join(" y ");
      const debtLabel = [
        (debt.ARS ?? 0) ? fmtARS(debt.ARS) : "",
        (debt.USD ?? 0) ? fmtUSD(debt.USD) : "",
      ]
        .filter(Boolean)
        .join(" y ");

      const dep = b.departure_date ? new Date(b.departure_date) : null;
      const ret = b.return_date ? new Date(b.return_date) : null;

      return {
        ...b,
        _titularFull: titularFull,
        _ownerFull: ownerFull,
        _saleNoInt: saleNoInt,
        _saleWithInt: saleWithInt,
        _paid: paid,
        _debt: debt,
        _saleLabel: saleLabel || "—",
        _paidLabel: paidLabel || "—",
        _debtLabel: debtLabel || "—",
        _depDate: dep,
        _retDate: ret,
        _travelLabel:
          dep || ret
            ? `${formatDateAR(b.departure_date)} – ${formatDateAR(b.return_date)}`
            : "—",
      };
    },
    [fmtARS, fmtUSD, sumByCurrency, sumReceiptsByCurrency],
  );

  /* ---------- Normalizados/derivados para la tabla ---------- */
  const normalized = useMemo<NormalizedBooking[]>(
    () => data.map((b) => normalizeBooking(b)),
    [data, normalizeBooking],
  );

  /* ---------- Owners para selector ---------- */
  const owners = useMemo(() => {
    const map = new Map<number, string>();
    for (const b of normalized) {
      const id = b.user?.id_user;
      if (!id) continue;
      const name =
        b.user?.first_name || b.user?.last_name
          ? `${b.user?.first_name || ""} ${b.user?.last_name || ""}`.trim()
          : `#${id}`;
      map.set(id, name);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "es"),
    );
  }, [normalized]);

  /* ---------- Forzar owner para vendedor ---------- */
  useEffect(() => {
    if (isVendor && user?.id_user) setOwnerId(user.id_user);
  }, [isVendor, user?.id_user]);

  /* ---------- Columnas visibles ---------- */
  const defaultVisible: VisibleKey[] = [
    "id_booking",
    "titular",
    "owner",
    "clientStatus",
    "operatorStatus",
    "creation_date",
    "travel",
    "sale_total",
    "paid_total",
    "debt_total",
  ];
  const [visible, setVisible] = useState<VisibleKey[]>(defaultVisible);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_COLS);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { visible?: VisibleKey[] };
      if (Array.isArray(parsed.visible)) setVisible(parsed.visible);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COLS, JSON.stringify({ visible }));
  }, [visible]);

  const allKeys = useMemo(() => ALL_COLUMNS.map((c) => c.key), []);
  const toggleCol = (k: VisibleKey) =>
    setVisible((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));
  const setAll = () => setVisible(allKeys);
  const setNone = () =>
    setVisible(ALL_COLUMNS.filter((c) => c.always).map((c) => c.key));
  const resetCols = () =>
    setVisible(defaultVisible.filter((k) => allKeys.includes(k)));
  const visibleCols = useMemo(
    () => ALL_COLUMNS.filter((c) => c.always || visible.includes(c.key)),
    [visible],
  );

  // Presets rápidos para columnas
  const applyPreset = (p: "basic" | "finance" | "debt") => {
    if (p === "basic") {
      setVisible([
        "id_booking",
        "titular",
        "owner",
        "clientStatus",
        "operatorStatus",
        "creation_date",
        "travel",
      ]);
    } else if (p === "finance") {
      setVisible([
        "id_booking",
        "titular",
        "owner",
        "sale_total",
        "paid_total",
        "debt_total",
        "creation_date",
      ]);
    } else {
      setVisible([
        "id_booking",
        "titular",
        "debt_total",
        "paid_total",
        "owner",
      ]);
    }
  };

  /* ---------- Ordenamiento ---------- */
  type SortKey =
    | "id_booking"
    | "titular"
    | "owner"
    | "clientStatus"
    | "operatorStatus"
    | "creation_date"
    | "travel"
    | "sale_total"
    | "paid_total"
    | "debt_total";
  const [sortKey, setSortKey] = useState<SortKey>("creation_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const setSort = (k: SortKey) => {
    setSortKey((prev) => {
      if (prev === k) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("desc");
      return k;
    });
  };

  const sortedRows = useMemo(() => {
    const rows = [...normalized];
    const dirMul = sortDir === "asc" ? 1 : -1;

    rows.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;

      switch (sortKey) {
        case "id_booking":
          va = a.id_booking;
          vb = b.id_booking;
          break;
        case "titular":
          va = a._titularFull || "";
          vb = b._titularFull || "";
          break;
        case "owner":
          va = a._ownerFull || "";
          vb = b._ownerFull || "";
          break;
        case "clientStatus":
          va = a.clientStatus || "";
          vb = b.clientStatus || "";
          break;
        case "operatorStatus":
          va = a.operatorStatus || "";
          vb = b.operatorStatus || "";
          break;
        case "creation_date":
          va = new Date(a.creation_date).getTime();
          vb = new Date(b.creation_date).getTime();
          break;
        case "travel":
          va = a._depDate ? a._depDate.getTime() : 0;
          vb = b._depDate ? b._depDate.getTime() : 0;
          break;
        case "sale_total":
          va = (a._saleNoInt.ARS || 0) * 1e6 + (a._saleNoInt.USD || 0);
          vb = (b._saleNoInt.ARS || 0) * 1e6 + (b._saleNoInt.USD || 0);
          break;
        case "paid_total":
          va = (a._paid.ARS || 0) * 1e6 + (a._paid.USD || 0);
          vb = (b._paid.ARS || 0) * 1e6 + (b._paid.USD || 0);
          break;
        case "debt_total":
          va = (a._debt.ARS || 0) * 1e6 + (a._debt.USD || 0);
          vb = (b._debt.ARS || 0) * 1e6 + (b._debt.USD || 0);
          break;
      }

      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb, "es") * dirMul;
      }
      return ((va as number) - (vb as number)) * dirMul;
    });

    return rows;
  }, [normalized, sortKey, sortDir]);

  /* ---------- KPIs rápidos (sobre lo cargado) ---------- */
  const kpis = useMemo(() => {
    const count = sortedRows.length;
    let saleARS = 0,
      saleUSD = 0,
      paidARS = 0,
      paidUSD = 0,
      debtARS = 0,
      debtUSD = 0;

    for (const r of sortedRows) {
      saleARS += r._saleNoInt.ARS || 0;
      saleUSD += r._saleNoInt.USD || 0;
      paidARS += r._paid.ARS || 0;
      paidUSD += r._paid.USD || 0;
      debtARS += r._debt.ARS || 0;
      debtUSD += r._debt.USD || 0;
    }

    return {
      count,
      sale: { ARS: saleARS, USD: saleUSD },
      paid: { ARS: paidARS, USD: paidUSD },
      debt: { ARS: debtARS, USD: debtUSD },
    };
  }, [sortedRows]);

  /* ---------- Fetch page / aplicar ---------- */
  const buildQS = useCallback(
    (withCursor?: number | null) => {
      const qs = new URLSearchParams();
      if (q.trim()) qs.append("q", q.trim());

      // owner (según permisos)
      const wantedUserId =
        isVendor && user?.id_user ? user.id_user : canPickOwner ? ownerId : 0;
      if (wantedUserId) qs.append("userId", String(wantedUserId));

      // estados
      if (clientStatusArr.length)
        qs.append("clientStatus", clientStatusArr.join(","));
      if (operatorStatusArr.length)
        qs.append("operatorStatus", operatorStatusArr.join(","));

      // fechas según modo
      if (dateMode === "creation") {
        if (from) qs.append("creationFrom", from);
        if (to) qs.append("creationTo", to);
      } else {
        if (from) qs.append("from", from);
        if (to) qs.append("to", to);
      }

      // paginación
      qs.append("take", String(TAKE));
      if (withCursor !== undefined && withCursor !== null)
        qs.append("cursor", String(withCursor));

      return qs;
    },
    [
      q,
      isVendor,
      user?.id_user,
      canPickOwner,
      ownerId,
      clientStatusArr,
      operatorStatusArr,
      dateMode,
      from,
      to,
    ],
  );

  const fetchPage = useCallback(
    async (resetList: boolean) => {
      setLoading(true);
      try {
        const qs = buildQS(resetList ? undefined : cursor);
        const res = await authFetch(
          `/api/bookings?${qs.toString()}`,
          { cache: "no-store" },
          token || undefined,
        );
        const json: BookingsAPI = await res.json();
        if (!res.ok) throw new Error(json?.error || "Error al cargar reservas");

        setData((prev) => (resetList ? json.items : [...prev, ...json.items]));
        setCursor(json.nextCursor ?? null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar reservas";
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

  /* ---------- CSV (full-scan, no sólo lo cargado) ---------- */
  const toCell = (col: VisibleKey, b: NormalizedBooking): string => {
    let raw = "";
    switch (col) {
      case "id_booking":
        raw = String(b.id_booking);
        break;
      case "titular":
        raw = b._titularFull || "";
        break;
      case "owner":
        raw = b._ownerFull || "";
        break;
      case "clientStatus":
        raw = b.clientStatus || "";
        break;
      case "operatorStatus":
        raw = b.operatorStatus || "";
        break;
      case "creation_date":
        raw = formatDateAR(b.creation_date);
        break;
      case "travel":
        raw = b._travelLabel;
        break;
      case "sale_total":
        raw = b._saleLabel;
        break;
      case "paid_total":
        raw = b._paidLabel;
        break;
      case "debt_total":
        raw = b._debtLabel;
        break;
    }
    return `"${String(raw).replace(/"/g, '""')}"`;
  };

  const downloadCSV = async () => {
    try {
      const headers = visibleCols.map((c) => c.label).join(";");

      // Full-scan con paginado
      let next: number | null = null;
      const rows: string[] = [];

      for (let i = 0; i < 200; i++) {
        const qs = buildQS(next);
        const res = await authFetch(
          `/api/bookings?${qs.toString()}`,
          { cache: "no-store" },
          token || undefined,
        );
        const json: BookingsAPI = await res.json();
        if (!res.ok) throw new Error(json?.error || "Error al exportar CSV");

        // normalizar cada página para reusar formateos
        const pageNorm: NormalizedBooking[] = json.items.map((b) =>
          normalizeBooking(b),
        );

        for (const b of pageNorm) {
          rows.push(visibleCols.map((col) => toCell(col.key, b)).join(";"));
        }

        next = json.nextCursor ?? null;
        if (next === null) break;
      }

      const csv = [headers, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reservas_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al descargar CSV";
      toast.error(msg);
    }
  };

  /* ---------- Acciones filtros ---------- */
  const clearFilters = () => {
    setQ("");
    setClientStatusArr([]);
    setOperatorStatusArr([]);
    setDateMode("travel");
    setFrom("");
    setTo("");
    if (!isVendor) setOwnerId(0);
  };

  /* ================= UI ================= */
  const rowPad = density === "compact" ? "py-1.5" : "py-2.5";

  return (
    <ProtectedRoute>
      <div>
        {/* Title + KPIs */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-sky-950 dark:text-white">
              Balances / Reservas
            </h1>
            <p className="text-sm opacity-70">
              Visualizá ventas, cobros y deuda por reserva.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ChipKPI label="Total" value={kpis.count} />
            <ChipKPI
              label="Venta"
              value={
                [
                  kpis.sale.ARS ? fmtARS(kpis.sale.ARS) : "",
                  kpis.sale.USD ? fmtUSD(kpis.sale.USD) : "",
                ]
                  .filter(Boolean)
                  .join(" y ") || "—"
              }
            />
            <ChipKPI
              label="Cobrado"
              value={
                [
                  kpis.paid.ARS ? fmtARS(kpis.paid.ARS) : "",
                  kpis.paid.USD ? fmtUSD(kpis.paid.USD) : "",
                ]
                  .filter(Boolean)
                  .join(" y ") || "—"
              }
            />
            <ChipKPI
              label="Deuda"
              value={
                [
                  kpis.debt.ARS ? fmtARS(kpis.debt.ARS) : "",
                  kpis.debt.USD ? fmtUSD(kpis.debt.USD) : "",
                ]
                  .filter(Boolean)
                  .join(" y ") || "—"
              }
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={ICON_BTN}
          >
            {filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>

          <div className="hidden h-5 w-px bg-sky-950/30 dark:bg-white/30 sm:block" />

          <button onClick={() => setPickerOpen(true)} className={ICON_BTN}>
            Columnas
          </button>

          <div className="hidden h-5 w-px bg-sky-950/30 dark:bg-white/30 sm:block" />

          <div className="flex items-center gap-1">
            <button onClick={() => applyPreset("basic")} className={ICON_BTN}>
              Básico
            </button>
            <button onClick={() => applyPreset("finance")} className={ICON_BTN}>
              Finanzas
            </button>
            <button onClick={() => applyPreset("debt")} className={ICON_BTN}>
              Deuda
            </button>
          </div>

          <div className="hidden h-5 w-px bg-sky-950/30 dark:bg-white/30 sm:block" />

          <div className="flex items-center gap-1">
            <button
              onClick={() => setDensity("comfortable")}
              className={`${ICON_BTN} ${density === "comfortable" ? "ring-1 ring-sky-400/60" : ""}`}
              title="Densidad cómoda"
            >
              Cómoda
            </button>
            <button
              onClick={() => setDensity("compact")}
              className={`${ICON_BTN} ${density === "compact" ? "ring-1 ring-sky-400/60" : ""}`}
              title="Densidad compacta"
            >
              Compacta
            </button>
          </div>

          <div className="hidden h-5 w-px bg-sky-950/30 dark:bg-white/30 sm:block" />

          <button onClick={downloadCSV} className={PRIMARY_BTN}>
            Exportar CSV
          </button>
        </div>

        {/* Filtros */}
        {filtersOpen && (
          <div className={`${GLASS} mb-8 p-4`}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              {/* q */}
              <div className="md:col-span-4">
                <Label>Buscar</Label>
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Reserva, titular, detalles..."
                />
              </div>

              {/* vendedor */}
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
                    <option value={user.id_user}>Mis reservas</option>
                  )}
                  {(!isVendor || canPickOwner) &&
                    owners.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Estados */}
              <div className="md:col-span-5">
                <Label>Estados</Label>
                <div className="flex flex-wrap gap-2">
                  {["Pendiente", "Pago, Facturado".split(", ")].flat().map(
                    (st) =>
                      typeof st === "string" && (
                        <button
                          key={`c-${st}`}
                          onClick={() =>
                            setClientStatusArr((arr) =>
                              arr.includes(st)
                                ? arr.filter((x) => x !== st)
                                : [...arr, st],
                            )
                          }
                          className={`${CHIP} ${clientStatusArr.includes(st) ? "ring-1 ring-sky-400/50" : ""}`}
                        >
                          Cliente: {st}
                        </button>
                      ),
                  )}
                  {["Pendiente", "Pago"].map((st) => (
                    <button
                      key={`o-${st}`}
                      onClick={() =>
                        setOperatorStatusArr((arr) =>
                          arr.includes(st)
                            ? arr.filter((x) => x !== st)
                            : [...arr, st],
                        )
                      }
                      className={`${CHIP} ${operatorStatusArr.includes(st) ? "ring-1 ring-sky-400/50" : ""}`}
                    >
                      Operador: {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modo de fecha */}
              <div className="md:col-span-3">
                <Label>Filtrar por</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDateMode("travel")}
                    className={`${CHIP} ${dateMode === "travel" ? "ring-1 ring-sky-400/50" : ""}`}
                  >
                    Viaje
                  </button>
                  <button
                    onClick={() => setDateMode("creation")}
                    className={`${CHIP} ${dateMode === "creation" ? "ring-1 ring-sky-400/50" : ""}`}
                  >
                    Creación
                  </button>
                </div>
              </div>

              {/* Fechas */}
              <div className="flex gap-3 md:col-span-4">
                <div className="flex-1">
                  <Label>Desde</Label>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label>Hasta</Label>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </div>

              {/* Acciones */}
              <div className="flex flex-wrap items-end justify-end gap-2 md:col-span-12">
                <button onClick={clearFilters} className={ICON_BTN}>
                  Limpiar
                </button>
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className={`${PRIMARY_BTN} disabled:opacity-50`}
                >
                  {loading ? <Spinner /> : "Aplicar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabla */}
        <div className={`${GLASS} mb-8 overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white/40 backdrop-blur dark:bg-zinc-900/40">
              <tr className="text-zinc-700 dark:text-zinc-200">
                {visibleCols.map((c) => {
                  const sortable = true;
                  const active = sortKey === (c.key as SortKey);
                  return (
                    <th
                      key={c.key}
                      className={`cursor-pointer select-none px-4 ${rowPad} text-center font-medium decoration-transparent hover:underline hover:decoration-sky-600`}
                      onClick={() => setSort(c.key as SortKey)}
                      title="Ordenar"
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {sortable && (
                          <span className="inline-block text-xs opacity-70">
                            {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="h-96 overflow-scroll">
              {sortedRows.map((b, idx) => (
                <tr
                  key={b.id_booking}
                  className={`border-t border-white/20 transition hover:bg-white/10 dark:border-white/10 ${
                    idx % 2 === 1 ? "bg-white/5 dark:bg-white/5" : ""
                  }`}
                >
                  {visibleCols.map((col) => {
                    switch (col.key) {
                      case "id_booking":
                        return (
                          <td
                            key={col.key}
                            className={`px-4 ${rowPad} text-center`}
                          >
                            <Link
                              href={`/bookings/services/${b.id_booking}`}
                              target="_blank"
                              className="underline decoration-transparent hover:decoration-sky-600"
                            >
                              {b.id_booking}
                            </Link>
                          </td>
                        );
                      case "titular":
                        return (
                          <td
                            key={col.key}
                            className={`px-4 ${rowPad} text-center`}
                          >
                            {b._titularFull || "—"}
                          </td>
                        );
                      case "owner":
                        return (
                          <td
                            key={col.key}
                            className={`px-4 ${rowPad} text-center`}
                          >
                            {b._ownerFull || "—"}
                          </td>
                        );
                      case "clientStatus":
                        return (
                          <td
                            key={col.key}
                            className={`px-4 ${rowPad} text-center`}
                          >
                            <StatusBadge type="client" value={b.clientStatus} />
                          </td>
                        );
                      case "operatorStatus":
                        return (
                          <td
                            key={col.key}
                            className={`px-4 ${rowPad} text-center`}
                          >
                            <StatusBadge type="op" value={b.operatorStatus} />
                          </td>
                        );
                      case "creation_date":
                        return (
                          <td
                            key={col.key}
                            className={`px-4 ${rowPad} text-center`}
                          >
                            {formatDateAR(b.creation_date)}
                          </td>
                        );
                      case "travel":
                        return (
                          <td
                            key={col.key}
                            className={`px-4 ${rowPad} text-center`}
                          >
                            {b._travelLabel}
                          </td>
                        );
                      case "sale_total":
                        return (
                          <td
                            key={col.key}
                            className={`px-4 ${rowPad} text-center`}
                          >
                            {b._saleLabel}
                          </td>
                        );
                      case "paid_total":
                        return (
                          <td
                            key={col.key}
                            className={`px-4 ${rowPad} text-center`}
                          >
                            {b._paidLabel}
                          </td>
                        );
                      case "debt_total":
                        return (
                          <td
                            key={col.key}
                            className={`px-4 ${rowPad} text-center`}
                          >
                            {b._debtLabel}
                          </td>
                        );
                    }
                  })}
                </tr>
              ))}

              {loading && sortedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleCols.length}
                    className="px-4 py-10 text-center"
                  >
                    <Spinner />
                  </td>
                </tr>
              )}

              {!loading && sortedRows.length === 0 && pageInit && (
                <tr>
                  <td
                    colSpan={visibleCols.length}
                    className="px-4 py-10 text-center opacity-70"
                  >
                    No hay resultados. Ajustá los filtros y probá de nuevo.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totales de lo visible */}
            {sortedRows.length > 0 && (
              <tfoot className="border-t border-white/20 bg-white/10 backdrop-blur dark:border-white/10">
                <tr>
                  <td
                    className={`px-4 ${rowPad} text-left font-medium`}
                    colSpan={Math.max(
                      1,
                      visibleCols.findIndex((c) => c.key === "sale_total"),
                    )}
                  >
                    Totales (cargado/visible)
                  </td>
                  {visible.includes("sale_total") && (
                    <td className={`px-4 ${rowPad} text-center font-medium`}>
                      {[
                        kpis.sale.ARS ? fmtARS(kpis.sale.ARS) : "",
                        kpis.sale.USD ? fmtUSD(kpis.sale.USD) : "",
                      ]
                        .filter(Boolean)
                        .join(" y ") || "—"}
                    </td>
                  )}
                  {visible.includes("paid_total") && (
                    <td className={`px-4 ${rowPad} text-center font-medium`}>
                      {[
                        kpis.paid.ARS ? fmtARS(kpis.paid.ARS) : "",
                        kpis.paid.USD ? fmtUSD(kpis.paid.USD) : "",
                      ]
                        .filter(Boolean)
                        .join(" y ") || "—"}
                    </td>
                  )}
                  {visible.includes("debt_total") && (
                    <td className={`px-4 ${rowPad} text-center font-medium`}>
                      {[
                        kpis.debt.ARS ? fmtARS(kpis.debt.ARS) : "",
                        kpis.debt.USD ? fmtUSD(kpis.debt.USD) : "",
                      ]
                        .filter(Boolean)
                        .join(" y ") || "—"}
                    </td>
                  )}
                  {/* Completar con celdas vacías si faltan */}
                  {(() => {
                    const printed = [
                      visible.includes("sale_total"),
                      visible.includes("paid_total"),
                      visible.includes("debt_total"),
                    ].filter(Boolean).length;
                    const missing = visibleCols.length - 1 - printed; // -1 por el colSpan de la etiqueta
                    return Array.from({ length: Math.max(0, missing) }).map(
                      (_, i) => <td key={`pad-${i}`} />,
                    );
                  })()}
                </tr>
              </tfoot>
            )}
          </table>

          <div className="flex w-full items-center justify-between border-t border-white/30 bg-white/10 px-3 py-2 text-xs backdrop-blur dark:border-white/10 dark:bg-white/10">
            <div className="opacity-70">
              {sortedRows.length} filas (de {normalized.length} cargadas)
            </div>
            <button
              onClick={() => fetchPage(false)}
              disabled={loading || cursor === null}
              className={`${ICON_BTN} disabled:opacity-50`}
            >
              {cursor === null
                ? "No hay más"
                : loading
                  ? "Cargando..."
                  : "Cargar más"}
            </button>
          </div>
        </div>

        {/* Modal de columnas */}
        <ColumnPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          items={ALL_COLUMNS.map((c) => ({
            key: c.key,
            label: c.label,
            locked: c.always,
          }))}
          visibleKeys={visible}
          onToggle={toggleCol}
          onAll={setAll}
          onNone={setNone}
          onReset={resetCols}
          onPreset={applyPreset}
        />

        <ToastContainer position="bottom-right" />
      </div>
    </ProtectedRoute>
  );
}

/* ================= Column Picker ================= */
function ColumnPickerModal({
  open,
  onClose,
  items,
  visibleKeys,
  onToggle,
  onAll,
  onNone,
  onReset,
  onPreset,
}: {
  open: boolean;
  onClose: () => void;
  items: { key: VisibleKey; label: string; locked?: boolean }[];
  visibleKeys: VisibleKey[];
  onToggle: (k: VisibleKey) => void;
  onAll: () => void;
  onNone: () => void;
  onReset: () => void;
  onPreset: (p: "basic" | "finance" | "debt") => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/10 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`${GLASS} absolute left-1/2 top-1/2 w-[min(92vw,640px)] -translate-x-1/2 -translate-y-1/2 p-5`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Columnas visibles</h3>
          <button onClick={onClose} className={ICON_BTN}>
            ✕
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs opacity-70">Presets:</span>
          <button onClick={() => onPreset("basic")} className={ICON_BTN}>
            Básico
          </button>
          <button onClick={() => onPreset("finance")} className={ICON_BTN}>
            Finanzas
          </button>
          <button onClick={() => onPreset("debt")} className={ICON_BTN}>
            Deuda
          </button>
        </div>

        <div className="grid max-h-72 grid-cols-1 gap-1 overflow-auto pr-1 sm:grid-cols-2">
          {items.map((it) => (
            <label
              key={it.key}
              className={`flex cursor-pointer items-center justify-between rounded-3xl px-2 py-1 text-sm ${it.locked ? "opacity-60" : "hover:bg-white/10 dark:hover:bg-zinc-800/50"}`}
            >
              <span>{it.label}</span>
              <input
                type="checkbox"
                checked={visibleKeys.includes(it.key)}
                onChange={() => !it.locked && onToggle(it.key)}
                disabled={it.locked}
              />
            </label>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button onClick={onAll} className={ICON_BTN}>
            Todas
          </button>
          <button onClick={onNone} className={ICON_BTN}>
            Ninguna
          </button>
          <button onClick={onReset} className={ICON_BTN}>
            Reset
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className={PRIMARY_BTN}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= UI atoms ================= */
function ChipKPI({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={CHIP}>
      <span className="opacity-70">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StatusBadge({
  type,
  value,
}: {
  type: "client" | "op";
  value: string;
}) {
  // Colores suaves según valor
  const map: Record<string, string> = {
    pendiente: "bg-amber-500/20 text-amber-900 dark:text-amber-200",
    pago: "bg-emerald-500/20 text-emerald-900 dark:text-emerald-200",
    facturado: "bg-sky-500/20 text-sky-900 dark:text-sky-200",
  };
  const key = (value || "").toLowerCase();
  const cls = map[key] || "bg-zinc-500/20 text-zinc-800 dark:text-zinc-200";
  return (
    <span
      className={`${BADGE} ${cls}`}
      title={`${type === "client" ? "Cliente" : "Operador"}: ${value}`}
    >
      {value || "—"}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs opacity-70">{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`block w-full min-w-fit appearance-none rounded-3xl border border-white/30 bg-white/10 px-4 py-2 outline-none backdrop-blur placeholder:opacity-60 dark:border-white/10 dark:bg-white/10 ${props.className || ""}`}
    />
  );
}
