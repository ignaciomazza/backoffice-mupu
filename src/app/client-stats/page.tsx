// src/app/client-stats/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";
import { authFetch } from "@/utils/authFetch";
import { useAuth } from "@/context/AuthContext";

// 🔎 Normalizadores (ver utils/normalize.ts)
import {
  normalizeClientRecord,
  DEFAULT_CONFIG,
  type NormalizeContext,
} from "@/utils/normalize";

/* =========================================================
 * Tipos del endpoint
 * ======================================================= */
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
  birth_date: string; // ISO
  nationality: string;
  gender: string;
  email?: string | null;
  registration_date: string; // ISO
  id_user: number;
  user?: UserLite | null;
};

type ClientsAPI = {
  items: ClientItem[];
  nextCursor: number | null;
  error?: string;
};

/* =========================================================
 * Columnas visibles
 * ======================================================= */
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
  { key: "owner", label: "Dueño" },
  { key: "dni_number", label: "DNI" },
  { key: "passport_number", label: "Pasaporte" },
  { key: "tax_id", label: "CUIT/CUIL" },
  { key: "nationality", label: "Nacionalidad" },
  { key: "gender", label: "Género" },
  { key: "age", label: "Edad" },
  { key: "locality", label: "Localidad" },
  { key: "registration_date", label: "Registrado" },
];

/* =========================================================
 * Helpers de UI
 * ======================================================= */
function formatDateAR(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR");
}

// Render por columna usando los normalizados
function valueFor(
  col: VisibleKey,
  c: ClientItem & ReturnType<typeof normalizeClientRecord>,
): string | number | JSX.Element {
  switch (col) {
    case "id_client":
      return (
        <Link
          href={`/clients/${c.id_client}`}
          className="underline decoration-white/30 hover:decoration-white"
        >
          {c.id_client}
        </Link>
      );
    case "full_name":
      return c._fullName || `${c.last_name} ${c.first_name}`.trim();
    case "phone":
      return c._phone.empty ? "—" : c._phone.national || c._phone.e164Like;
    case "email":
      return c._email.empty ? "—" : c._email.value;
    case "owner":
      return (
        c._owner || (c.user ? `${c.user.first_name} ${c.user.last_name}` : "—")
      );
    case "dni_number":
      return c.dni_number || "—";
    case "passport_number":
      return c.passport_number || "—";
    case "tax_id":
      return c.tax_id || "—";
    case "nationality":
      return c._nat.iso2 ? c._nat.iso2 : c._nat.label || c.nationality || "—";
    case "gender":
      return c.gender || "—";
    case "age":
      return typeof c._age === "number" ? c._age : "—";
    case "locality":
      return c._locality || c.locality || "—";
    case "registration_date":
      return formatDateAR(c.registration_date);
  }
}

// CSV usando las mismas columnas visibles
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

/* =========================================================
 * Modal Column Picker (overlay fijo)
 * ======================================================= */
function ColumnPickerModal({
  open,
  onClose,
  items,
  visibleKeys,
  onToggle,
  onAll,
  onNone,
  onReset,
  presets,
  onSavePreset,
  onLoadPreset,
  onRemovePreset,
}: {
  open: boolean;
  onClose: () => void;
  items: { key: VisibleKey; label: string; locked?: boolean }[];
  visibleKeys: VisibleKey[];
  onToggle: (k: VisibleKey) => void;
  onAll: () => void;
  onNone: () => void;
  onReset: () => void;
  presets: { name: string; keys: VisibleKey[] }[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (name: string) => void;
  onRemovePreset: (name: string) => void;
}) {
  const [presetName, setPresetName] = useState("");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="absolute left-1/2 top-1/2 w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-white/10 p-5 shadow-xl dark:text-white">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Columnas visibles</h3>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1 hover:bg-white/10"
            aria-label="Cerrar"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 p-3">
            <p className="mb-2 text-sm opacity-80">Seleccioná columnas</p>
            <div className="max-h-72 space-y-1 overflow-auto pr-1">
              {items.map((it) => (
                <label
                  key={it.key}
                  className={`flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 ${it.locked ? "opacity-60" : "hover:bg-white/5"}`}
                  title={it.locked ? "Columna fija" : ""}
                >
                  <span className="text-sm">{it.label}</span>
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
              <button
                onClick={onAll}
                className="rounded-full px-3 py-1 text-sm hover:bg-white/10"
              >
                Todas
              </button>
              <button
                onClick={onNone}
                className="rounded-full px-3 py-1 text-sm hover:bg-white/10"
              >
                Ninguna
              </button>
              <button
                onClick={onReset}
                className="rounded-full px-3 py-1 text-sm hover:bg-white/10"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-3">
            <p className="mb-2 text-sm opacity-80">Presets</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {presets.map((p) => (
                <div key={p.name} className="flex items-center gap-1">
                  <button
                    className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                    onClick={() => onLoadPreset(p.name)}
                  >
                    {p.name}
                  </button>
                  <button
                    className="rounded-full px-2 text-xs opacity-60 hover:bg-white/10"
                    title="Eliminar"
                    onClick={() => onRemovePreset(p.name)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Nombre del preset"
                className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-sm outline-none"
              />
              <button
                className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white"
                onClick={() => {
                  const name = presetName.trim();
                  if (name) onSavePreset(name);
                  setPresetName("");
                }}
              >
                Guardar
              </button>
            </div>

            <div className="mt-4 space-x-2">
              <button
                onClick={() => onLoadPreset("Difusión")}
                className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
              >
                Difusión
              </button>
              <button
                onClick={() => onLoadPreset("Identificación")}
                className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
              >
                Identificación
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
 * Page
 * ======================================================= */
export default function ClientStatsPage() {
  const { token } = useAuth();

  // Filtros
  const [q, setQ] = useState("");
  const [withPhone, setWithPhone] = useState(false);
  const [withEmail, setWithEmail] = useState(false);

  // Data y paginación
  const [data, setData] = useState<ClientItem[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Normalization context (si tenés esos datos de la agencia, pasalos acá)
  const normCtx = useMemo<NormalizeContext>(
    () => ({
      // countryDefault: "AR",
      // callingCodeDefault: "54",
    }),
    [],
  );

  // Columnas visibles + presets
  const STORAGE_KEY = "client-stats-columns";
  const defaultVisible: VisibleKey[] = ["full_name", "phone", "owner"];
  const [visible, setVisible] = useState<VisibleKey[]>(defaultVisible);
  const [presets, setPresets] = useState<
    { name: string; keys: VisibleKey[] }[]
  >([
    { name: "Difusión", keys: ["full_name", "phone", "owner"] },
    {
      name: "Identificación",
      keys: ["full_name", "dni_number", "passport_number", "tax_id", "email"],
    },
  ]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Persistencia columnas/presets
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        visible?: VisibleKey[];
        presets?: { name: string; keys: VisibleKey[] }[];
      };
      if (Array.isArray(parsed.visible)) {
        const allKeys = ALL_COLUMNS.map((c) => c.key);
        const clean = parsed.visible.filter((k: VisibleKey) =>
          allKeys.includes(k),
        );
        if (clean.length) setVisible(clean);
      }
      if (Array.isArray(parsed.presets)) setPresets(parsed.presets);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible, presets }));
  }, [visible, presets]);

  // Column picker actions
  const allKeys = useMemo(() => ALL_COLUMNS.map((c) => c.key), []);
  const toggleCol = (k: VisibleKey) =>
    setVisible((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));
  const setAll = () => setVisible(allKeys);
  const setNone = () =>
    setVisible(ALL_COLUMNS.filter((c) => c.always).map((c) => c.key));
  const resetCols = () =>
    setVisible(defaultVisible.filter((k) => allKeys.includes(k)));
  const savePreset = (name: string) => {
    const cleaned = visible.filter((k) => allKeys.includes(k));
    if (!cleaned.length) return;
    setPresets((p) => {
      const others = p.filter(
        (x) => x.name.trim().toLowerCase() !== name.trim().toLowerCase(),
      );
      return [...others, { name, keys: cleaned }];
    });
  };
  const loadPreset = (name: string) => {
    const pr =
      presets.find(
        (x) => x.name.trim().toLowerCase() === name.trim().toLowerCase(),
      ) || presets.find((x) => x.name === name);
    if (pr) {
      const clean = pr.keys.filter((k) => allKeys.includes(k));
      if (clean.length) setVisible(clean);
    }
  };
  const removePreset = (name: string) =>
    setPresets((p) => p.filter((x) => x.name !== name));

  // Columnas visibles en orden
  const visibleCols = useMemo(
    () => ALL_COLUMNS.filter((c) => c.always || visible.includes(c.key)),
    [visible],
  );

  // Normalizados (memoizados)
  const normalized = useMemo(
    () =>
      data.map((c) => ({
        ...c,
        ...normalizeClientRecord(c, normCtx, DEFAULT_CONFIG),
      })),
    [data, normCtx],
  );

  // KPIs y estadísticas ampliadas (sobre datos normalizados)
  const stats = useMemo(() => {
    const count = normalized.length;

    const withPhoneN = normalized.filter((d) => !d._phone.empty).length;
    const withEmailN = normalized.filter((d) => !d._email.empty).length;
    const pct = (n: number) => (count ? ((n / count) * 100).toFixed(1) : "0.0");

    // Edad
    const ages: number[] = normalized
      .map((d) => (typeof d._age === "number" ? d._age : null))
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);

    const avgAge =
      ages.length > 0
        ? Math.round((ages.reduce((s, x) => s + x, 0) / ages.length) * 10) / 10
        : null;
    const medAge =
      ages.length > 0
        ? ages.length % 2
          ? ages[(ages.length - 1) / 2]
          : Math.round(
              ((ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2) * 10,
            ) / 10
        : null;

    const buckets = { u18: 0, a18_25: 0, a26_40: 0, a41_60: 0, g60: 0 };
    ages.forEach((a) => {
      if (a <= 17) buckets.u18++;
      else if (a <= 25) buckets.a18_25++;
      else if (a <= 40) buckets.a26_40++;
      else if (a <= 60) buckets.a41_60++;
      else buckets.g60++;
    });

    // Top dueños
    const byOwner = new Map<string, number>();
    normalized.forEach((d) => {
      const name =
        d._owner || (d.user ? `${d.user.first_name} ${d.user.last_name}` : "—");
      byOwner.set(name, (byOwner.get(name) || 0) + 1);
    });
    const topOwners = Array.from(byOwner.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Top nacionalidades (normalizadas)
    const byNat = new Map<string, number>();
    normalized.forEach((d) => {
      const key = (d._nat.iso2 || d._nat.label || "—").toUpperCase();
      byNat.set(key, (byNat.get(key) || 0) + 1);
    });
    const topNat = Array.from(byNat.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Localidades únicas (normalizadas)
    const uniqueLocalities = new Set(
      normalized.map((d) => (d._locality || "").trim()).filter(Boolean),
    ).size;

    // Calidad teléfonos (promedio de score)
    const phoneScoreAvg =
      normalized.length > 0
        ? Math.round(
            (normalized.reduce((s, d) => s + (d._phone.score || 0), 0) /
              normalized.length) *
              100,
          ) / 100
        : 0;

    return {
      count,
      withPhone: { n: withPhoneN, pct: pct(withPhoneN) },
      withEmail: { n: withEmailN, pct: pct(withEmailN) },
      ages: { avgAge, medAge, buckets },
      topOwners,
      topNat,
      uniqueLocalities,
      phoneScoreAvg,
    };
  }, [normalized]);

  // Carga con paginación
  const TAKE = 120;
  const fetchPage = useCallback(
    async (resetList: boolean) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (q.trim()) qs.append("q", q.trim());
        qs.append("take", String(TAKE));
        if (!resetList && cursor !== null) qs.append("cursor", String(cursor));

        const res = await authFetch(
          `/api/clients?${qs.toString()}`,
          { cache: "no-store" },
          token || undefined,
        );
        const json: ClientsAPI = await res.json();
        if (!res.ok) throw new Error(json?.error || "Error al cargar clientes");

        const items = Array.isArray(json.items) ? json.items : [];
        const filtered = items.filter((c) => {
          // Filtros de “con teléfono / con email” se aplican con normalizador
          const n = normalizeClientRecord(c, normCtx, DEFAULT_CONFIG);
          if (withPhone && n._phone.empty) return false;
          if (withEmail && n._email.empty) return false;
          return true;
        });

        setData((prev) => (resetList ? filtered : prev.concat(filtered)));
        setCursor(json.nextCursor ?? null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar clientes";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [q, withPhone, withEmail, token, cursor, normCtx],
  );

  const handleSearch = () => {
    setCursor(null);
    setData([]);
    fetchPage(true);
  };

  // Export CSV respetando visibilidad + normalizados
  const downloadCSV = () => {
    const headers = visibleCols.map((c) => c.label).join(";");
    const rows = normalized.map((c) =>
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

  /* ====================== UI ====================== */
  return (
    <ProtectedRoute>
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-sky-950 dark:text-white">
          Client Stats
        </h1>

        {/* Toolbar sticky */}
        <div className="sticky top-2 z-30 mb-6 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur dark:text-white">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            {/* Búsqueda + toggles */}
            <div className="md:col-span-6">
              <label className="mb-1 block text-sm font-medium">Buscar</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, DNI, email, empresa..."
                className="w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={withPhone}
                    onChange={(e) => setWithPhone(e.target.checked)}
                  />
                  Con teléfono
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={withEmail}
                    onChange={(e) => setWithEmail(e.target.checked)}
                  />
                  Con email
                </label>
              </div>
            </div>

            {/* Presets rápidos */}
            <div className="md:col-span-3">
              <p className="mb-1 text-sm font-medium">Presets rápidos</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => loadPreset("Difusión")}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                >
                  Difusión
                </button>
                <button
                  onClick={() => loadPreset("Identificación")}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                >
                  Identificación
                </button>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-end justify-end gap-2 md:col-span-3">
              <button
                onClick={() => setPickerOpen(true)}
                className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 dark:bg-white/10 dark:text-white"
              >
                Columnas
              </button>
              <button
                onClick={handleSearch}
                disabled={loading}
                className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 hover:scale-95 active:scale-90 disabled:opacity-50 dark:bg-white/10 dark:text-white"
              >
                {loading ? <Spinner /> : "Buscar"}
              </button>
              <button
                onClick={downloadCSV}
                className="rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
              >
                Descargar CSV
              </button>
            </div>
          </div>
        </div>

        {/* KPIs principales */}
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
            <p className="text-lg font-medium">Total clientes</p>
            <p className="font-light">{stats.count}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
            <p className="text-lg font-medium">Con teléfono</p>
            <p className="font-light">
              {stats.withPhone.n} ({stats.withPhone.pct}%)
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
            <p className="text-lg font-medium">Con email</p>
            <p className="font-light">
              {stats.withEmail.n} ({stats.withEmail.pct}%)
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
            <p className="text-lg font-medium">Localidades únicas</p>
            <p className="font-light">{stats.uniqueLocalities}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
            <p className="text-lg font-medium">Calidad tel. (avg score)</p>
            <p className="font-light">{stats.phoneScoreAvg}</p>
          </div>
        </div>

        {/* Stats extendidas */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
            <p className="mb-2 text-lg font-medium">Edad</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm opacity-80">Promedio</p>
                <p className="font-light">{stats.ages.avgAge ?? "—"}</p>
              </div>
              <div>
                <p className="text-sm opacity-80">Mediana</p>
                <p className="font-light">{stats.ages.medAge ?? "—"}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
              <div className="rounded-xl border border-white/10 bg-white/10 p-2">
                ≤17
                <div className="mt-1 font-semibold">
                  {stats.ages.buckets.u18}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-2">
                18–25
                <div className="mt-1 font-semibold">
                  {stats.ages.buckets.a18_25}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-2">
                26–40
                <div className="mt-1 font-semibold">
                  {stats.ages.buckets.a26_40}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-2">
                41–60
                <div className="mt-1 font-semibold">
                  {stats.ages.buckets.a41_60}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-2">
                60+
                <div className="mt-1 font-semibold">
                  {stats.ages.buckets.g60}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
            <p className="mb-2 text-lg font-medium">Top Dueños</p>
            <ul className="space-y-1">
              {stats.topOwners.map(([name, n]) => (
                <li
                  key={name}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3 py-2"
                >
                  <span className="truncate pr-2">{name}</span>
                  <span className="font-semibold">{n}</span>
                </li>
              ))}
              {stats.topOwners.length === 0 && (
                <li className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm opacity-70">
                  Sin datos
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
            <p className="mb-2 text-lg font-medium">Top Nacionalidades</p>
            <ul className="space-y-1">
              {stats.topNat.map(([nat, n]) => (
                <li
                  key={nat}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3 py-2"
                >
                  <span className="truncate pr-2">{nat}</span>
                  <span className="font-semibold">{n}</span>
                </li>
              ))}
              {stats.topNat.length === 0 && (
                <li className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm opacity-70">
                  Sin datos
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/10 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
          <table className="w-full">
            <thead>
              <tr className="text-sky-950 dark:text-white">
                {visibleCols.map((c) => (
                  <th key={c.key} className="px-4 py-3 font-normal">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalized.map((c) => (
                <tr key={c.id_client} className="border-t border-white/10">
                  {visibleCols.map((col) => (
                    <td key={col.key} className="px-2 py-3 text-sm font-light">
                      {valueFor(col.key, c)}
                    </td>
                  ))}
                </tr>
              ))}

              {loading && normalized.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleCols.length}
                    className="px-4 py-10 text-center"
                  >
                    <Spinner />
                  </td>
                </tr>
              )}

              {!loading && normalized.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleCols.length}
                    className="px-4 py-10 text-center text-sm opacity-70"
                  >
                    No hay resultados. Ajustá los filtros y probá de nuevo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex w-full items-center justify-between border-t border-white/10 px-4 py-2">
            <div className="text-xs opacity-70">{normalized.length} filas</div>
            <button
              onClick={() => fetchPage(false)}
              disabled={loading || cursor === null}
              className="w-fit rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-50 dark:bg-white/10 dark:text-white"
            >
              {cursor === null
                ? "No hay más"
                : loading
                  ? "Cargando..."
                  : "Cargar más"}
            </button>
          </div>
        </div>

        {/* Modal columnas (overlay fijo, NO queda debajo de la tabla) */}
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
          presets={presets}
          onSavePreset={savePreset}
          onLoadPreset={loadPreset}
          onRemovePreset={removePreset}
        />

        <ToastContainer position="bottom-right" />
      </div>
    </ProtectedRoute>
  );
}
