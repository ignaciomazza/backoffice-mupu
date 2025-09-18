// src/app/client-stats/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { authFetch } from "@/utils/authFetch";
import { useAuth } from "@/context/AuthContext";
import {
  normalizeClientRecord,
  DEFAULT_CONFIG,
  type NormalizeContext,
} from "@/utils/normalize";

/* ================= Types from API ================= */
type UserLite = {
  id_user: number;
  first_name: string;
  last_name: string;
  role: string;
  id_agency: number;
  email?: string | null;
};

type ClientItem = {
  id_client: number;
  first_name: string;
  last_name: string;
  phone: string;
  address?: string | null;
  postal_code?: string | null;
  locality?: string | null;
  company_name?: string | null;
  tax_id?: string | null;
  commercial_address?: string | null;
  dni_number?: string | null;
  passport_number?: string | null;
  birth_date: string;
  nationality: string;
  gender: string;
  email?: string | null;
  registration_date: string;
  id_user: number;
  user?: UserLite | null;
};

type ClientsAPI = {
  items: ClientItem[];
  nextCursor: number | null;
  error?: string;
};

/* ================= Visible columns ================= */
type VisibleKey =
  | "id_client"
  | "full_name"
  | "phone"
  | "email"
  | "owner"
  | "dni_number"
  | "passport_number"
  | "tax_id"
  | "nationality"
  | "gender"
  | "age"
  | "locality"
  | "registration_date";

type ColumnDef = { key: VisibleKey; label: string; always?: boolean };

const ALL_COLUMNS: ColumnDef[] = [
  { key: "id_client", label: "ID", always: true },
  { key: "full_name", label: "Nombre y Apellido" },
  { key: "phone", label: "Teléfono" },
  { key: "email", label: "Email" },
  { key: "owner", label: "Vendedor" },
  { key: "dni_number", label: "DNI" },
  { key: "passport_number", label: "Pasaporte" },
  { key: "tax_id", label: "CUIT/CUIL" },
  { key: "nationality", label: "Nacionalidad" },
  { key: "gender", label: "Género" },
  { key: "age", label: "Edad" },
  { key: "locality", label: "Localidad" },
  { key: "registration_date", label: "Registrado" },
];

/* ================= Reusable style tokens (glass / sky) ================= */
const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const CHIP =
  "inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 backdrop-blur px-3 py-1.5 text-sm shadow-sm shadow-sky-900/5 dark:bg-white/10 dark:border-white/10";
const ICON_BTN =
  "rounded-3xl bg-sky-600/30 px-3 py-1.5 text-sm text-sky-950/80 hover:text-sky-950 dark:text-white shadow-sm shadow-sky-900/10 hover:bg-sky-600/30 border border-sky-600/30 active:scale-[.99] transition";
const PRIMARY_BTN =
  "rounded-3xl bg-sky-600/30 px-3 py-1.5 text-sm text-sky-950/80 hover:text-sky-950 dark:text-white shadow-sm shadow-sky-900/10 hover:bg-sky-600/30 border border-sky-600/30 active:scale-[.99] transition";

/* ================= Helpers ================= */
function formatDateAR(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR");
}

function valueFor(
  col: VisibleKey,
  c: ClientItem & ReturnType<typeof normalizeClientRecord>,
): string | number | JSX.Element {
  switch (col) {
    case "id_client":
      return (
        <Link
          href={`/clients/${c.id_client}`}
          className="underline decoration-transparent hover:decoration-sky-600"
        >
          {c.id_client}
        </Link>
      );
    case "full_name":
      return c._fullName || `${c.last_name} ${c.first_name}`.trim();
    case "phone":
      if (c._phone.empty) return "—";
      return c._phone.hasPlus ? c._phone.e164Like : c._phone.national;
    case "email":
      return c._email.empty ? "—" : c._email.value;
    case "owner":
      return (
        c._owner || (c.user ? `${c.user.first_name} ${c.user.last_name}` : "—")
      );
    case "dni_number":
      return c._docDNI.empty ? "—" : c._docDNI.formatted || c._docDNI.digits;
    case "passport_number":
      return c._passport.empty ? "—" : c._passport.value;
    case "tax_id":
      if (!c._docCUIT || c._docCUIT.empty) return "—";
      return c._docCUIT.formatted || c._docCUIT.digits;
    case "nationality":
      return c._nat.iso2 ? c._nat.iso2 : c._nat.label || "—";
    case "gender":
      return c._gender || "—";
    case "age":
      return typeof c._age === "number" ? c._age : "—";
    case "locality":
      return c._locality || "—";
    case "registration_date":
      return formatDateAR(c.registration_date);
  }
}

function toCSVCell(
  col: VisibleKey,
  c: ClientItem & ReturnType<typeof normalizeClientRecord>,
): string {
  const v = valueFor(col, c);
  const raw =
    typeof v === "string" || typeof v === "number"
      ? String(v)
      : String(c.id_client);
  return `"${raw.replace(/"/g, '""')}"`;
}

/* ================= Column Picker (glass) ================= */
function ColumnPickerModal({
  open,
  onClose,
  items,
  visibleKeys,
  onToggle,
  onAll,
  onNone,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  items: { key: VisibleKey; label: string; locked?: boolean }[];
  visibleKeys: VisibleKey[];
  onToggle: (k: VisibleKey) => void;
  onAll: () => void;
  onNone: () => void;
  onReset: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/10 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`${GLASS} absolute left-1/2 top-1/2 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 p-5`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Columnas</h3>
          <button onClick={onClose} className={ICON_BTN}>
            ✕
          </button>
        </div>
        <div className="max-h-72 space-y-1 overflow-auto pr-1">
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

/* ================= Stats (slim) ================= */
type StatsBuckets = {
  u18: number;
  a18_25: number;
  a26_40: number;
  a41_60: number;
  g60: number;
};
type TopPair = [string, number];

type StatsState = {
  count: number;
  withPhoneN: number;
  withEmailN: number;
  avgAge: number | null;
  buckets: StatsBuckets;
  topOwners: TopPair[];
  topNat: TopPair[];
};

const EMPTY_STATS: StatsState = {
  count: 0,
  withPhoneN: 0,
  withEmailN: 0,
  avgAge: null,
  buckets: { u18: 0, a18_25: 0, a26_40: 0, a41_60: 0, g60: 0 },
  topOwners: [],
  topNat: [],
};

/* ================= Page ================= */
export default function ClientStatsPage() {
  const { token, user } = useAuth() as {
    token?: string | null;
    user?: {
      id_user?: number;
      role?: string;
      first_name?: string;
      last_name?: string;
    } | null;
  };

  const role = (user?.role || "").toLowerCase();
  const isVendor = role === "vendedor";
  const canPickOwner = [
    "gerente",
    "administrativo",
    "desarrollador",
    "lider",
  ].includes(role);

  // Filtros
  const [q, setQ] = useState("");
  const [ownerId, setOwnerId] = useState<number | 0>(0);
  const [gender, setGender] = useState<"" | "M" | "F" | "X">("");
  const [hasPhone, setHasPhone] = useState<"" | "yes" | "no">("");
  const [hasEmail, setHasEmail] = useState<"" | "yes" | "no">("");
  const [nat, setNat] = useState<string>("");
  const [ageMin, setAgeMin] = useState<string>("");
  const [ageMax, setAgeMax] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);

  // Data tabla
  const [data, setData] = useState<ClientItem[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState<StatsState>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(false);

  // Normalize context
  const normCtx = useMemo<NormalizeContext>(
    () => ({ countryDefault: "AR", callingCodeDefault: "54" }),
    [],
  );

  // Columnas
  const STORAGE_KEY = "client-stats-columns-minimal";
  const defaultVisible: VisibleKey[] = [
    "id_client",
    "full_name",
    "phone",
    "email",
    "owner",
    "dni_number",
    "age",
    "nationality",
    "registration_date",
  ];
  const [visible, setVisible] = useState<VisibleKey[]>(defaultVisible);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { visible?: VisibleKey[] };
      if (Array.isArray(parsed.visible)) setVisible(parsed.visible);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible }));
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

  // Normalizados (para lo cargado)
  const normalized = useMemo(
    () =>
      data.map((c) => ({
        ...c,
        ...normalizeClientRecord(c, normCtx, DEFAULT_CONFIG),
      })),
    [data, normCtx],
  );

  // Owners para selector
  const owners = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of normalized) {
      const id = c.user?.id_user ?? c.id_user;
      const name =
        c.user?.first_name || c.user?.last_name
          ? `${c.user?.first_name || ""} ${c.user?.last_name || ""}`.trim()
          : c._owner || `#${id}`;
      if (id) map.set(id, name || `#${id}`);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "es"),
    );
  }, [normalized]);

  // Vendedor: forzar su owner
  useEffect(() => {
    if (isVendor && user?.id_user) setOwnerId(user.id_user);
  }, [isVendor, user?.id_user]);

  // Filtrado client-side tabla
  const filteredTableRows = useMemo(() => {
    const min = ageMin ? Number(ageMin) : null;
    const max = ageMax ? Number(ageMax) : null;
    const df = dateFrom ? new Date(dateFrom) : null;
    const dt = dateTo ? new Date(dateTo) : null;

    return normalized.filter((d) => {
      if (ownerId && d.id_user !== ownerId) return false;
      if (gender && d._gender !== gender) return false;

      const hasPh = !d._phone.empty;
      const hasEm = !d._email.empty;
      if (hasPhone === "yes" && !hasPh) return false;
      if (hasPhone === "no" && hasPh) return false;
      if (hasEmail === "yes" && !hasEm) return false;
      if (hasEmail === "no" && hasEm) return false;

      if (nat) {
        const key = (d._nat.iso2 || d._nat.label || "").toLowerCase();
        if (!key.includes(nat.toLowerCase())) return false;
      }

      if (min !== null && typeof d._age === "number" && d._age < min)
        return false;
      if (max !== null && typeof d._age === "number" && d._age > max)
        return false;

      if (df || dt) {
        const rd = d.registration_date ? new Date(d.registration_date) : null;
        if (!rd) return false;
        if (df && rd < new Date(df.getFullYear(), df.getMonth(), df.getDate()))
          return false;
        if (
          dt &&
          rd >
            new Date(
              dt.getFullYear(),
              dt.getMonth(),
              dt.getDate(),
              23,
              59,
              59,
              999,
            )
        )
          return false;
      }

      return true;
    });
  }, [
    normalized,
    ownerId,
    gender,
    hasPhone,
    hasEmail,
    nat,
    ageMin,
    ageMax,
    dateFrom,
    dateTo,
  ]);

  // Opciones nat para datalist (desde stats)
  const natOptions = useMemo(
    () => stats.topNat.slice(0, 12).map(([label]) => label),
    [stats.topNat],
  );

  /* ========= Fetch (tabla) ========= */
  const TAKE = 120;

  const [pageInit, setPageInit] = useState(false);
  const fetchPage = useCallback(
    async (resetList: boolean) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (q.trim()) qs.append("q", q.trim());
        qs.append("take", String(TAKE));

        const wantedUserId =
          isVendor && user?.id_user ? user.id_user : canPickOwner ? ownerId : 0;
        if (wantedUserId) qs.append("userId", String(wantedUserId));
        if (!resetList && cursor !== null) qs.append("cursor", String(cursor));

        const res = await authFetch(
          `/api/clients?${qs.toString()}`,
          { cache: "no-store" },
          token || undefined,
        );
        const json: ClientsAPI = await res.json();
        if (!res.ok) throw new Error(json?.error || "Error al cargar clientes");

        setData((prev) => (resetList ? json.items : [...prev, ...json.items]));
        setCursor(json.nextCursor ?? null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar clientes";
        toast.error(msg);
      } finally {
        setLoading(false);
        setPageInit(true);
      }
    },
    [q, token, cursor, canPickOwner, ownerId, isVendor, user?.id_user],
  );

  /* ========= Fetch (stats full-scan paginado) ========= */
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      let total = 0;
      let withPhoneN = 0;
      let withEmailN = 0;
      let ageSum = 0;
      let ageCount = 0;
      const buckets: StatsBuckets = {
        u18: 0,
        a18_25: 0,
        a26_40: 0,
        a41_60: 0,
        g60: 0,
      };
      const byOwner = new Map<string, number>();
      const byNat = new Map<string, number>();

      const qsBase = new URLSearchParams();
      if (q.trim()) qsBase.append("q", q.trim());
      qsBase.append("take", "100");
      const wantedUserId =
        isVendor && user?.id_user ? user.id_user : canPickOwner ? ownerId : 0;
      if (wantedUserId) qsBase.append("userId", String(wantedUserId));

      let next: number | null = null;
      let pages = 0;
      const MAX_PAGES = 200;

      do {
        const qs = new URLSearchParams(qsBase);
        if (next !== null) qs.append("cursor", String(next));

        const res = await authFetch(
          `/api/clients?${qs.toString()}`,
          { cache: "no-store" },
          token || undefined,
        );
        const json: ClientsAPI = await res.json();
        if (!res.ok)
          throw new Error(json?.error || "Error al calcular estadísticas");

        for (const c of json.items) {
          const n = normalizeClientRecord(c, normCtx, DEFAULT_CONFIG);

          if (gender && n._gender !== gender) continue;

          const hasPh = !n._phone.empty;
          const hasEm = !n._email.empty;
          if (hasPhone === "yes" && !hasPh) continue;
          if (hasPhone === "no" && hasPh) continue;
          if (hasEmail === "yes" && !hasEm) continue;
          if (hasEmail === "no" && hasEm) continue;

          if (nat) {
            const key = (n._nat.iso2 || n._nat.label || "").toLowerCase();
            if (!key.includes(nat.toLowerCase())) continue;
          }

          const a = n._age;
          const min = ageMin ? Number(ageMin) : null;
          const max = ageMax ? Number(ageMax) : null;
          if (min !== null && typeof a === "number" && a < min) continue;
          if (max !== null && typeof a === "number" && a > max) continue;

          if (dateFrom || dateTo) {
            const rd = c.registration_date
              ? new Date(c.registration_date)
              : null;
            if (!rd) continue;
            if (dateFrom) {
              const df = new Date(dateFrom);
              if (rd < new Date(df.getFullYear(), df.getMonth(), df.getDate()))
                continue;
            }
            if (dateTo) {
              const dt = new Date(dateTo);
              if (
                rd >
                new Date(
                  dt.getFullYear(),
                  dt.getMonth(),
                  dt.getDate(),
                  23,
                  59,
                  59,
                  999,
                )
              )
                continue;
            }
          }

          // Agregar
          total++;
          if (hasPh) withPhoneN++;
          if (hasEm) withEmailN++;

          if (typeof a === "number" && a >= 0 && a <= 120) {
            ageSum += a;
            ageCount++;
            if (a <= 17) buckets.u18++;
            else if (a <= 25) buckets.a18_25++;
            else if (a <= 40) buckets.a26_40++;
            else if (a <= 60) buckets.a41_60++;
            else buckets.g60++;
          }

          const ownerName =
            n._owner ||
            (c.user ? `${c.user.first_name} ${c.user.last_name}` : "—");
          byOwner.set(ownerName, (byOwner.get(ownerName) || 0) + 1);

          const natKey = (n._nat.iso2 || n._nat.label || "—").toUpperCase();
          byNat.set(natKey, (byNat.get(natKey) || 0) + 1);
        }

        next = json.nextCursor ?? null;
        pages++;
      } while (next !== null && pages < MAX_PAGES);

      const avgAge =
        ageCount > 0 ? Math.round((ageSum / ageCount) * 10) / 10 : null;
      const topOwners = Array.from(byOwner.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      const topNat = Array.from(byNat.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      setStats({
        count: total,
        withPhoneN,
        withEmailN,
        avgAge,
        buckets,
        topOwners,
        topNat,
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Error al calcular estadísticas";
      toast.error(msg);
      setStats(EMPTY_STATS);
    } finally {
      setStatsLoading(false);
    }
  }, [
    q,
    token,
    normCtx,
    isVendor,
    user?.id_user,
    canPickOwner,
    ownerId,
    gender,
    hasPhone,
    hasEmail,
    nat,
    ageMin,
    ageMax,
    dateFrom,
    dateTo,
  ]);

  const handleSearch = () => {
    setCursor(null);
    setData([]);
    fetchPage(true);
    fetchStats();
  };

  useEffect(() => {
    if (data.length === 0 && !loading) {
      fetchPage(true);
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Export CSV
  const downloadCSV = () => {
    const headers = visibleCols.map((c) => c.label).join(";");
    const rows = filteredTableRows.map((c) =>
      visibleCols.map((col) => toCSVCell(col.key, c)).join(";"),
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const clearFilters = () => {
    setGender("");
    setHasPhone("");
    setHasEmail("");
    setNat("");
    setAgeMin("");
    setAgeMax("");
    setDateFrom("");
    setDateTo("");
    if (!isVendor) setOwnerId(0);
  };

  /* ================= UI ================= */
  return (
    <ProtectedRoute>
      <div>
        {/* Title + KPIs (glass chips) */}
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
            Client Stats
          </h1>
          <div className="flex flex-wrap gap-2">
            <ChipKPI label="Total" value={stats.count} loading={statsLoading} />
            <ChipKPI
              label="Con teléfono"
              value={stats.withPhoneN}
              loading={statsLoading}
            />
            <ChipKPI
              label="Con email"
              value={stats.withEmailN}
              loading={statsLoading}
            />
            <ChipKPI
              label="Edad prom."
              value={stats.avgAge ?? "—"}
              loading={statsLoading}
            />
          </div>
        </div>

        {/* Barra superior de acciones */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={ICON_BTN}
          >
            {filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
          <button onClick={() => setPickerOpen(true)} className={ICON_BTN}>
            Columnas
          </button>
          <button onClick={downloadCSV} className={PRIMARY_BTN}>
            Descargar CSV
          </button>
        </div>

        {/* Panel de filtros (glass) */}
        {filtersOpen && (
          <div className={`${GLASS} mb-8 p-4`}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              {/* q */}
              <div className="md:col-span-4">
                <Label>Buscar</Label>
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nombre, DNI, email, empresa..."
                />
              </div>

              {/* dueño */}
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
                    <option value={user.id_user}>Mis pasajeros</option>
                  )}
                  {(!isVendor || canPickOwner) &&
                    owners.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                </select>
              </div>

              {/* género */}
              <div className="md:col-span-2">
                <Label>Género</Label>
                <select
                  value={gender}
                  onChange={(e) =>
                    setGender(e.target.value as "M" | "F" | "X" | "")
                  }
                  className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-3 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                >
                  <option value="">Todos</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="X">Otro/No binario</option>
                </select>
              </div>

              {/* tel/email */}
              <div className="grid grid-cols-2 gap-3 md:col-span-3">
                <div>
                  <Label>Teléfono</Label>
                  <select
                    value={hasPhone}
                    onChange={(e) =>
                      setHasPhone(e.target.value as "" | "yes" | "no")
                    }
                    className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-3 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                  >
                    <option value="">Todos</option>
                    <option value="yes">Con teléfono</option>
                    <option value="no">Sin teléfono</option>
                  </select>
                </div>
                <div>
                  <Label>Email</Label>
                  <select
                    value={hasEmail}
                    onChange={(e) =>
                      setHasEmail(e.target.value as "" | "yes" | "no")
                    }
                    className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-3 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
                  >
                    <option value="">Todos</option>
                    <option value="yes">Con email</option>
                    <option value="no">Sin email</option>
                  </select>
                </div>
              </div>

              {/* nacionalidad */}
              <div className="md:col-span-3">
                <Label>Nacionalidad</Label>
                <Input
                  list="nat-list"
                  value={nat}
                  onChange={(e) => setNat(e.target.value)}
                  placeholder="AR, ES, Brasil..."
                />
                <datalist id="nat-list">
                  {natOptions.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>

              {/* edad */}
              <div className="grid grid-cols-2 gap-3 md:col-span-3">
                <div>
                  <Label>Edad mín.</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={ageMin}
                    onChange={(e) => setAgeMin(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Edad máx.</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={ageMax}
                    onChange={(e) => setAgeMax(e.target.value)}
                  />
                </div>
              </div>

              {/* fechas */}
              <div className="flex gap-3">
                <div>
                  <Label>Desde</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Hasta</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>

              {/* acciones filtros */}
              <div className="flex flex-wrap items-end justify-end gap-2 md:col-span-12">
                <button onClick={clearFilters} className={ICON_BTN}>
                  Limpiar
                </button>
                <button
                  onClick={handleSearch}
                  disabled={loading || statsLoading}
                  className={`${PRIMARY_BTN} disabled:opacity-50`}
                >
                  {loading || statsLoading ? <Spinner /> : "Aplicar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Resumen único (glass) */}
        <div className={`${GLASS} mb-8 p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Resumen</h2>
            {statsLoading && <Spinner />}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Edad (chips) */}
            <div>
              <p className="mb-2 text-sm opacity-70">Distribución por edad</p>
              <div className="flex flex-wrap gap-2">
                <AgeChip label="≤17" n={stats.buckets.u18} />
                <AgeChip label="18–25" n={stats.buckets.a18_25} />
                <AgeChip label="26–40" n={stats.buckets.a26_40} />
                <AgeChip label="41–60" n={stats.buckets.a41_60} />
                <AgeChip label="60+" n={stats.buckets.g60} />
              </div>
            </div>

            {/* Top vendedores */}
            <div>
              <p className="mb-2 text-sm opacity-70">Top vendedores (pax)</p>
              <ul className="space-y-1 text-sm">
                {stats.topOwners.length === 0 && !statsLoading && (
                  <li className="rounded-3xl border border-white/30 bg-white/10 px-3 py-2 opacity-70 backdrop-blur dark:border-white/10 dark:bg-white/10">
                    Sin datos
                  </li>
                )}
                {stats.topOwners.map(([name, n]) => (
                  <li
                    key={name}
                    className="flex items-center justify-between rounded-3xl border border-white/30 bg-white/10 px-3 py-2 shadow-sm shadow-sky-900/5 backdrop-blur dark:border-white/10 dark:bg-white/10"
                  >
                    <span className="truncate pr-2">{name}</span>
                    <span className="font-medium">{n}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Top nacionalidades */}
            <div>
              <p className="mb-2 text-sm opacity-70">Top nacionalidades</p>
              <ul className="space-y-1 text-sm">
                {stats.topNat.length === 0 && !statsLoading && (
                  <li className="rounded-3xl border border-white/30 bg-white/10 px-3 py-2 opacity-70 backdrop-blur dark:border-white/10 dark:bg-white/10">
                    Sin datos
                  </li>
                )}
                {stats.topNat.map(([label, n]) => (
                  <li
                    key={label}
                    className="flex items-center justify-between rounded-3xl border border-white/30 bg-white/10 px-3 py-2 shadow-sm shadow-sky-900/5 backdrop-blur dark:border-white/10 dark:bg-white/10"
                  >
                    <span className="truncate pr-2">{label}</span>
                    <span className="font-medium">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Tabla (glass) */}
        <div className={`${GLASS} mb-8 overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-700 backdrop-blur dark:text-zinc-200">
                {visibleCols.map((c) => (
                  <th key={c.key} className="p-4 text-center font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTableRows.map((c) => (
                <tr
                  key={c.id_client}
                  className="border-t border-white/30 backdrop-blur-sm transition hover:bg-white/10 dark:border-white/10 dark:hover:bg-white/10"
                >
                  {visibleCols.map((col) => (
                    <td key={col.key} className="px-4 py-2 text-center">
                      {valueFor(col.key, c)}
                    </td>
                  ))}
                </tr>
              ))}

              {loading && filteredTableRows.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleCols.length}
                    className="px-4 py-10 text-center"
                  >
                    <Spinner />
                  </td>
                </tr>
              )}

              {!loading && filteredTableRows.length === 0 && pageInit && (
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
          </table>

          <div className="flex w-full items-center justify-between border-t border-white/30 bg-white/10 px-3 py-2 text-xs backdrop-blur dark:border-white/10 dark:bg-white/10">
            <div className="opacity-70">
              {filteredTableRows.length} filas (de {normalized.length} cargadas)
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

        {/* Modal columnas */}
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
        />

        <ToastContainer position="bottom-right" />
      </div>
    </ProtectedRoute>
  );
}

/* ================= UI atoms (glass-friendly) ================= */
function ChipKPI({
  label,
  value,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className={CHIP}>
      <span className="opacity-70">{label}</span>
      <span className="font-medium">{loading ? <Spinner /> : value}</span>
    </div>
  );
}

function AgeChip({ label, n }: { label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-2 py-1 text-xs shadow-sm shadow-sky-900/5 backdrop-blur dark:border-white/10 dark:bg-white/10">
      <span className="opacity-70">{label}</span>
      <span className="font-medium">{n}</span>
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
