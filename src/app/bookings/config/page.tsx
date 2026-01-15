"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import type { BillingAdjustmentConfig } from "@/types";

/* =========================================================
 * Tipos DTO (según las APIs provistas)
 * ========================================================= */
type ServiceTypeDTO = {
  id_service_type: number;
  code: string;
  name: string;
  enabled: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type CalcConfigResponse = {
  billing_breakdown_mode: "auto" | "manual";
  transfer_fee_pct: number; // proporción (0.024 = 2.4%)
  billing_adjustments: BillingAdjustmentConfig[];
  use_booking_sale_total: boolean;
};

type RoleResponse = { role?: string };

/* =========================================================
 * Estilos compartidos (alineados con Finanzas)
 * ========================================================= */
const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const ICON_BTN =
  "rounded-full bg-sky-100 px-4 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-[.98] active:scale-95 disabled:opacity-50 dark:bg-white/10 dark:text-white";
const BADGE =
  "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium border border-white/10 bg-white/10";

/* =========================================================
 * Helpers
 * ========================================================= */
function percentToString(p: number): string {
  // 0.024 => "2.40"
  const v = Number(p);
  if (!Number.isFinite(v)) return "0.00";
  return (v * 100).toFixed(2);
}

function stringToProportion(input: string): number | null {
  // Siempre interpretamos el valor tipeado como PORCENTAJE (ej: "2.40" => 2.4%)
  // y lo convertimos a proporción (0.024).
  const raw = input.replace(",", ".").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n / 100;
}

function stringToNumber(input: string): number | null {
  const raw = input.replace(",", ".").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatNumber(value: number, digits = 2): string {
  const v = Number(value);
  if (!Number.isFinite(v)) return "0.00";
  return v.toFixed(digits);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/* Debounce genérico */
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* UI mini */
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

function Switch({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-1.5 shadow-sm backdrop-blur transition hover:bg-white/20 dark:border-white/10 dark:bg-white/10 ${
        checked ? "ring-1 ring-sky-400/60" : ""
      }`}
      title={title}
      aria-label={label}
    >
      <span
        className={`inline-block h-4 w-7 rounded-full ${
          checked ? "bg-emerald-500/60" : "bg-white/30 dark:bg-white/10"
        }`}
      >
        <span
          className={`block size-4 rounded-full bg-white transition ${
            checked ? "translate-x-3" : ""
          }`}
        />
      </span>
      <span className="text-sm">{label}</span>
    </button>
  );
}

/* =============== Modal simple =============== */
function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/10 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`${GLASS} absolute left-1/2 top-1/2 ${
          wide ? "w-[min(94vw,780px)]" : "w-[min(92vw,560px)]"
        } -translate-x-1/2 -translate-y-1/2 p-5`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className={ICON_BTN}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[65vh] overflow-auto pr-1">{children}</div>
        {footer && <div className="mt-4 flex justify-end">{footer}</div>}
      </div>
    </div>
  );
}

/* =========================================================
 * Page
 * ========================================================= */
type TabKey = "types" | "calc";

export default function BookingsConfigPage() {
  const { token } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  // rol y permisos (derivado desde /api/user/profile, no /api/user/role)
  const [role, setRole] = useState<string | null>(null);
  const canEdit = useMemo(
    () =>
      role === "gerente" ||
      role === "administrativo" ||
      role === "desarrollador",
    [role],
  );

  // Tabs
  const [active, setActive] = useState<TabKey>("types");

  // -------- Service Types -----------
  const [svcLoading, setSvcLoading] = useState(true);
  const [svcItems, setSvcItems] = useState<ServiceTypeDTO[]>([]);
  const [svcSearch, setSvcSearch] = useState("");
  const debSearch = useDebounced(svcSearch, 350);
  const [svcOnlyEnabled, setSvcOnlyEnabled] = useState(false);

  // Modal crear/editar
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<ServiceTypeDTO | null>(null);
  const [typeForm, setTypeForm] = useState<{
    name: string;
    code: string;
    enabled: boolean;
  }>({ name: "", code: "", enabled: true });
  const [savingType, setSavingType] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // -------- Calc Config -----------
  const [cfgLoading, setCfgLoading] = useState(true);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [pctStr, setPctStr] = useState<string>("2.40");
  const [savingCfg, setSavingCfg] = useState(false);
  const [serverMode, setServerMode] = useState<"auto" | "manual">("auto");
  const [serverPctStr, setServerPctStr] = useState<string>("2.40");
  const [adjustments, setAdjustments] = useState<BillingAdjustmentConfig[]>([]);
  const [serverAdjustments, setServerAdjustments] = useState<
    BillingAdjustmentConfig[]
  >([]);
  const [useBookingSaleTotal, setUseBookingSaleTotal] = useState(false);
  const [serverUseBookingSaleTotal, setServerUseBookingSaleTotal] =
    useState(false);
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [editingAdj, setEditingAdj] =
    useState<BillingAdjustmentConfig | null>(null);
  const [adjForm, setAdjForm] = useState<{
    label: string;
    kind: BillingAdjustmentConfig["kind"];
    basis: BillingAdjustmentConfig["basis"];
    valueType: BillingAdjustmentConfig["valueType"];
    valueStr: string;
    active: boolean;
  }>({
    label: "",
    kind: "cost",
    basis: "sale",
    valueType: "percent",
    valueStr: "",
    active: true,
  });

  const firstLoadRef = useRef(true);

  /* =========================================================
   * Effects: load role + data
   * ========================================================= */
  useEffect(() => setMounted(true), []);

  // Cargar rol desde /api/user/profile (evita /api/user/role que provoca 401 -> logout)
  useEffect(() => {
    if (!token || !mounted) return;
    let abort = false;

    (async () => {
      try {
        setLoading(true);
        const rr = await authFetch(
          "/api/user/profile",
          { cache: "no-store" },
          token,
        );
        if (rr.ok) {
          const { role: r } = (await rr.json()) as RoleResponse;
          if (!abort) setRole((r || "").toLowerCase());
        } else {
          if (!abort) setRole(null);
        }
      } catch {
        if (!abort) setRole(null);
      } finally {
        if (!abort) setLoading(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [token, mounted]);

  // Cargar Config (1 vez) y Service Types (inicial + filtros)
  useEffect(() => {
    if (!token || !mounted) return;
    let cancel = false;

    const loadCalcConfig = async () => {
      setCfgLoading(true);
      try {
        const res = await authFetch(
          "/api/service-calc-config",
          { cache: "no-store" },
          token,
        );
        if (!res.ok) throw new Error("No se pudo obtener la configuración");
        const data = (await res.json()) as CalcConfigResponse;
        if (cancel) return;
        setMode(data.billing_breakdown_mode);
        setServerMode(data.billing_breakdown_mode);
        const pct = percentToString(data.transfer_fee_pct);
        setPctStr(pct);
        setServerPctStr(pct);
        const adj = Array.isArray(data.billing_adjustments)
          ? data.billing_adjustments
          : [];
        setAdjustments(adj);
        setServerAdjustments(adj);
        setUseBookingSaleTotal(Boolean(data.use_booking_sale_total));
        setServerUseBookingSaleTotal(Boolean(data.use_booking_sale_total));
      } catch (e) {
        console.error("[bookings/config] calc-config", e);
        toast.error("No se pudo cargar Cálculo & Comisiones");
      } finally {
        if (!cancel) setCfgLoading(false);
      }
    };

    const loadServiceTypes = async () => {
      setSvcLoading(true);
      try {
        const params = new URLSearchParams();
        if (debSearch.trim()) params.set("q", debSearch.trim());
        if (svcOnlyEnabled) params.set("enabled", "true");

        const url =
          "/api/service-types" +
          (params.toString() ? `?${params.toString()}` : "");
        const res = await authFetch(url, { cache: "no-store" }, token);
        if (!res.ok) throw new Error("No se pudo obtener los tipos");
        const data = (await res.json()) as ServiceTypeDTO[];
        if (cancel) return;
        setSvcItems(data);
      } catch (e) {
        console.error("[bookings/config] service-types", e);
        toast.error("No se pudo cargar Tipos de Servicio");
      } finally {
        if (!cancel) setSvcLoading(false);
      }
    };

    const firstLoad = async () => {
      setLoading(true);
      try {
        await Promise.all([loadCalcConfig(), loadServiceTypes()]);
      } finally {
        if (!cancel) setLoading(false);
      }
    };

    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      void firstLoad();
    } else {
      // recarga por cambios de filtro
      void loadServiceTypes();
    }

    return () => {
      cancel = true;
    };
  }, [token, mounted, debSearch, svcOnlyEnabled]);

  /* =========================================================
   * Actions: Service Types (modal style, como Finanzas)
   * ========================================================= */
  const openNewType = useCallback(() => {
    setEditingType(null);
    setTypeForm({ name: "", code: "", enabled: true });
    setTypeModalOpen(true);
  }, []);

  const openEditType = useCallback((row: ServiceTypeDTO) => {
    setEditingType(row);
    setTypeForm({
      name: row.name,
      code: row.code,
      enabled: row.enabled,
    });
    setTypeModalOpen(true);
  }, []);

  const saveType = useCallback(async () => {
    if (!token) return;
    const payload = {
      name: typeForm.name.trim(),
      code: (typeForm.code.trim() || slugify(typeForm.name)).trim(),
      enabled: !!typeForm.enabled,
    };
    if (!payload.name) {
      toast.error("Ingresá un nombre.");
      return;
    }
    if (!payload.code) {
      toast.error("Ingresá un código.");
      return;
    }

    setSavingType(true);
    try {
      if (editingType) {
        // UPDATE
        const res = await authFetch(
          `/api/service-types/${editingType.id_service_type}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          token,
        );
        if (res.status === 403) {
          toast.error("No autorizado para editar tipos");
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || "Error al actualizar");
        }
        const updated = (await res.json()) as ServiceTypeDTO;
        setSvcItems((prev) =>
          prev.map((it) =>
            it.id_service_type === updated.id_service_type ? updated : it,
          ),
        );
        toast.success("Tipo actualizado");
      } else {
        // CREATE
        const res = await authFetch(
          "/api/service-types",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          token,
        );
        if (res.status === 403) {
          toast.error("No autorizado para crear tipos");
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || "Error al crear tipo");
        }
        const created = (await res.json()) as ServiceTypeDTO;
        setSvcItems((prev) => [...prev, created]);
        toast.success("Tipo creado");
      }
      setTypeModalOpen(false);
      setEditingType(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      toast.error(msg);
    } finally {
      setSavingType(false);
    }
  }, [editingType, token, typeForm]);

  const removeType = useCallback(
    async (row: ServiceTypeDTO) => {
      if (!token) return;
      if (!confirm(`¿Eliminar "${row.name}"?`)) return;

      setDeletingId(row.id_service_type);
      try {
        const res = await authFetch(
          `/api/service-types/${row.id_service_type}`,
          { method: "DELETE" },
          token,
        );
        if (res.status === 403) {
          toast.error("No autorizado para eliminar");
          return;
        }
        if (!res.ok && res.status !== 204) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || "Error al eliminar");
        }
        setSvcItems((prev) =>
          prev.filter((x) => x.id_service_type !== row.id_service_type),
        );
        toast.success("Tipo eliminado");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al eliminar";
        toast.error(msg);
      } finally {
        setDeletingId(null);
      }
    },
    [token],
  );

  /* Toggle rápido enabled con update optimista */
  const toggleEnabledQuick = useCallback(
    async (row: ServiceTypeDTO) => {
      if (!canEdit || !token) return;

      const targetId = row.id_service_type;
      const nextVal = !row.enabled;

      // Optimista
      setSvcItems((prev) =>
        prev.map((it) =>
          it.id_service_type === targetId ? { ...it, enabled: nextVal } : it,
        ),
      );

      try {
        const res = await authFetch(
          `/api/service-types/${targetId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: nextVal }),
          },
          token,
        );
        if (!res.ok) {
          throw new Error("No se pudo actualizar el estado");
        }
        toast.success(nextVal ? "Habilitado" : "Deshabilitado");
      } catch (e) {
        // revertir
        setSvcItems((prev) =>
          prev.map((it) =>
            it.id_service_type === targetId
              ? { ...it, enabled: row.enabled }
              : it,
          ),
        );
        toast.error(
          e instanceof Error ? e.message : "Error al actualizar estado",
        );
      }
    },
    [canEdit, token],
  );

  /* =========================================================
   * Actions: Calc Config
   * ========================================================= */
  const makeAdjustmentId = useCallback(() => {
    const uuid =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : null;
    if (uuid) return uuid;
    return `adj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const openNewAdjustment = useCallback(() => {
    setEditingAdj(null);
    setAdjForm({
      label: "",
      kind: "cost",
      basis: "sale",
      valueType: "percent",
      valueStr: "",
      active: true,
    });
    setAdjModalOpen(true);
  }, []);

  const openEditAdjustment = useCallback((adj: BillingAdjustmentConfig) => {
    setEditingAdj(adj);
    setAdjForm({
      label: adj.label,
      kind: adj.kind,
      basis: adj.basis,
      valueType: adj.valueType,
      valueStr:
        adj.valueType === "percent"
          ? percentToString(adj.value)
          : formatNumber(adj.value, 2),
      active: adj.active,
    });
    setAdjModalOpen(true);
  }, []);

  const saveAdjustment = useCallback(() => {
    const label = adjForm.label.trim();
    if (!label) {
      toast.error("Ingresá un nombre para el ajuste.");
      return;
    }
    const value =
      adjForm.valueType === "percent"
        ? stringToProportion(adjForm.valueStr)
        : stringToNumber(adjForm.valueStr);
    if (value == null) {
      toast.error(
        adjForm.valueType === "percent"
          ? "Porcentaje inválido."
          : "Monto inválido.",
      );
      return;
    }

    const next: BillingAdjustmentConfig = {
      id: editingAdj?.id ?? makeAdjustmentId(),
      label,
      kind: adjForm.kind,
      basis: adjForm.basis,
      valueType: adjForm.valueType,
      value,
      active: adjForm.active,
    };

    setAdjustments((prev) => {
      if (editingAdj) {
        return prev.map((it) => (it.id === editingAdj.id ? next : it));
      }
      return [...prev, next];
    });

    setAdjModalOpen(false);
    setEditingAdj(null);
  }, [adjForm, editingAdj, makeAdjustmentId]);

  const removeAdjustment = useCallback((adj: BillingAdjustmentConfig) => {
    if (!confirm(`¿Eliminar el ajuste "${adj.label}"?`)) return;
    setAdjustments((prev) => prev.filter((it) => it.id !== adj.id));
  }, []);

  const toggleAdjustmentActive = useCallback((adjId: string) => {
    setAdjustments((prev) =>
      prev.map((it) =>
        it.id === adjId ? { ...it, active: !it.active } : it,
      ),
    );
  }, []);

  const adjustmentsDirty =
    JSON.stringify(adjustments) !== JSON.stringify(serverAdjustments);
  const configDirty =
    mode !== serverMode ||
    pctStr.trim() !== serverPctStr.trim() ||
    adjustmentsDirty ||
    useBookingSaleTotal !== serverUseBookingSaleTotal;

  const saveCalcConfig = useCallback(async () => {
    if (!token) return;

    const body: Record<string, unknown> = {};
    body.billing_breakdown_mode = mode;

    const p = stringToProportion(pctStr);
    if (p == null) {
      toast.error("Porcentaje inválido");
      return;
    }
    body.transfer_fee_pct = p;
    body.billing_adjustments = adjustments;
    body.use_booking_sale_total = useBookingSaleTotal;

    setSavingCfg(true);
    try {
      const res = await authFetch(
        "/api/service-calc-config",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        token,
      );
      if (res.status === 403) {
        toast.error("No autorizado para guardar");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Error al guardar configuración");
      }
      const data = (await res.json()) as CalcConfigResponse;
      const pct = percentToString(data.transfer_fee_pct);
      setMode(data.billing_breakdown_mode);
      setPctStr(pct);
      setServerMode(data.billing_breakdown_mode);
      setServerPctStr(pct);
      const adj = Array.isArray(data.billing_adjustments)
        ? data.billing_adjustments
        : [];
      setAdjustments(adj);
      setServerAdjustments(adj);
      setUseBookingSaleTotal(Boolean(data.use_booking_sale_total));
      setServerUseBookingSaleTotal(Boolean(data.use_booking_sale_total));
      toast.success("Configuración guardada");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      toast.error(msg);
    } finally {
      setSavingCfg(false);
    }
  }, [adjustments, mode, pctStr, token, useBookingSaleTotal]);

  /* Ctrl/Cmd+S para guardar config cuando hay cambios */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (configDirty && canEdit && !savingCfg) {
          void saveCalcConfig();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [configDirty, canEdit, savingCfg, saveCalcConfig]);

  /* Autocomplete de código al tipear nombre (solo cuando creás) */
  useEffect(() => {
    if (editingType) return; // en edición no forzamos el code

    const name = typeForm.name.trim();
    const code = typeForm.code.trim();

    if (!name) return;
    if (!code) {
      setTypeForm((f) => ({ ...f, code: slugify(name) }));
    }
  }, [editingType, typeForm.name, typeForm.code]);

  /* =========================================================
   * Render
   * ========================================================= */
  if (!mounted) return null;

  const enabledCount = svcItems.filter((s) => s.enabled).length;

  // Para el slider (0% a 10% típico; si querés más alto, subí el max)
  const sliderValue = clamp(Number(pctStr.replace(",", ".")) || 0, 0, 10);
  const adjKindLabels: Record<BillingAdjustmentConfig["kind"], string> = {
    cost: "Costo",
    tax: "Impuesto",
  };
  const adjBasisLabels: Record<BillingAdjustmentConfig["basis"], string> = {
    sale: "Venta",
    cost: "Costo",
    margin: "Ganancia",
  };
  const adjValueLabels: Record<
    BillingAdjustmentConfig["valueType"],
    string
  > = {
    percent: "%",
    fixed: "Monto fijo",
  };

  return (
    <ProtectedRoute>
      <section className="mx-auto max-w-6xl px-4 py-6 text-sky-950 dark:text-white">
        {/* Título + Tabs */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Configuración de Reservas
            </h1>
            <p className="mt-1 text-sm text-sky-950/70 dark:text-white/70">
              Gestioná los <b>Tipos de Servicio</b> y el modo de{" "}
              <b>Cálculo &amp; Comisiones</b> por agencia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "types", label: "Tipos" },
              { key: "calc", label: "Cálculo" },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key as TabKey)}
                className={`${ICON_BTN} ${
                  active === t.key ? "ring-1 ring-sky-400/60" : ""
                }`}
                aria-label={`Ir a ${t.label}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido por tab */}
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            {/* ===================== TAB: Tipos ===================== */}
            {active === "types" && (
              <div className={`${GLASS} p-6`}>
                {/* Header sección */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium">Tipos de servicio</h2>
                    <span className={BADGE} title="Habilitados / Total">
                      {enabledCount}/{svcItems.length}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={openNewType}
                      disabled={!canEdit}
                      className={ICON_BTN}
                    >
                      Nuevo tipo
                    </button>
                  </div>
                </div>

                {/* Filtros */}
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                  <div className="sm:col-span-2">
                    <Label>Buscar</Label>
                    <Input
                      type="text"
                      value={svcSearch}
                      onChange={(e) => setSvcSearch(e.target.value)}
                      placeholder="Nombre o código…"
                      aria-label="Buscar tipos"
                    />
                  </div>
                  <label className="inline-flex select-none items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={svcOnlyEnabled}
                      onChange={(e) => setSvcOnlyEnabled(e.target.checked)}
                      className="size-4"
                    />
                    Solo habilitados
                  </label>
                </div>

                {/* Listado */}
                <div className="relative min-h-[120px]">
                  {svcLoading ? (
                    <div className="space-y-2">
                      <div className="h-4 w-full animate-pulse rounded bg-white/20 dark:bg-white/10" />
                      <div className="h-4 w-full animate-pulse rounded bg-white/20 dark:bg-white/10" />
                      <div className="h-4 w-full animate-pulse rounded bg-white/20 dark:bg-white/10" />
                    </div>
                  ) : svcItems.length === 0 ? (
                    <p className="text-sm text-sky-950/70 dark:text-white/70">
                      No hay tipos para mostrar.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {svcItems
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((row) => (
                          <li
                            key={row.id_service_type}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">
                                  {row.name}
                                </span>
                                {!row.enabled && (
                                  <span className={BADGE}>Deshabilitado</span>
                                )}
                              </div>
                              <div className="truncate text-sm opacity-80">
                                {row.code}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleEnabledQuick(row)}
                                disabled={!canEdit}
                                className={ICON_BTN}
                                title={
                                  canEdit
                                    ? "Alternar habilitado"
                                    : "Solo lectura"
                                }
                              >
                                {row.enabled ? "Deshabilitar" : "Habilitar"}
                              </button>

                              <button
                                type="button"
                                onClick={() => openEditType(row)}
                                disabled={!canEdit}
                                className={ICON_BTN}
                                aria-label="Editar tipo"
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                onClick={() => void removeType(row)}
                                disabled={
                                  !canEdit || deletingId === row.id_service_type
                                }
                                className={`${ICON_BTN} bg-rose-500/15 text-rose-700 dark:text-rose-300`}
                                aria-label="Eliminar tipo"
                              >
                                {deletingId === row.id_service_type
                                  ? "Eliminando…"
                                  : "Eliminar"}
                              </button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* ===================== TAB: Cálculo & Comisiones ===================== */}
            {active === "calc" && (
              <div className={`${GLASS} p-6`}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-medium">
                    Cálculo &amp; Comisiones
                  </h2>
                  {!canEdit && (
                    <span className="text-xs text-sky-950/60 dark:text-white/60">
                      Solo lectura
                    </span>
                  )}
                </div>

                {cfgLoading ? (
                  <div className="space-y-3">
                    <div className="h-4 w-full animate-pulse rounded bg-white/20 dark:bg-white/10" />
                    <div className="h-4 w-full animate-pulse rounded bg-white/20 dark:bg-white/10" />
                    <div className="h-4 w-full animate-pulse rounded bg-white/20 dark:bg-white/10" />
                  </div>
                ) : (
                  <>
                    <div className="mb-4">
                      <Label>Modo de carga</Label>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/30 p-3 dark:bg-white/10">
                          <input
                            type="radio"
                            name="mode"
                            value="auto"
                            disabled={!canEdit}
                            checked={mode === "auto"}
                            onChange={() => setMode("auto")}
                          />
                          <div className="text-sm">
                            <div className="font-medium">Automático</div>
                            <div className="text-xs opacity-70">
                              Usa BillingBreakdown para calcular impuestos y
                              comisiones.
                            </div>
                          </div>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/30 p-3 dark:bg-white/10">
                          <input
                            type="radio"
                            name="mode"
                            value="manual"
                            disabled={!canEdit}
                            checked={mode === "manual"}
                            onChange={() => setMode("manual")}
                          />
                          <div className="text-sm">
                            <div className="font-medium">Manual</div>
                            <div className="text-xs opacity-70">
                              Carga simple sin desglose automático.
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="mb-4">
                      <Label>Venta total por reserva</Label>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/30 p-3 dark:bg-white/10">
                        <div className="text-sm">
                          <div className="font-medium">
                            Usar venta total en lugar de venta por servicio
                          </div>
                          <div className="text-xs opacity-70">
                            Permite cargar costos e impuestos por servicio, y
                            definir la venta en el detalle de la reserva.
                          </div>
                        </div>
                        <Switch
                          checked={useBookingSaleTotal}
                          onChange={setUseBookingSaleTotal}
                          label={useBookingSaleTotal ? "Activo" : "Inactivo"}
                          title="Configurar venta total por reserva"
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <Label>Costos bancarios</Label>
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr,90px]">
                        <div className="rounded-2xl border border-white/10 p-3">
                          <input
                            type="range"
                            min={0}
                            max={10}
                            step={0.05}
                            value={sliderValue}
                            onChange={(e) => {
                              const v = clamp(Number(e.target.value), 0, 10);
                              setPctStr(v.toFixed(2));
                            }}
                            disabled={!canEdit}
                            className="w-full"
                            aria-label="Porcentaje de costos bancarios"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min={0}
                            max={10}
                            value={pctStr}
                            onChange={(e) => setPctStr(e.target.value)}
                            placeholder="2.40"
                            disabled={!canEdit}
                            className="text-right"
                          />
                          <span className="pb-2 text-sky-950/70 dark:text-white/70">
                            %
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-sky-950/70 dark:text-white/70">
                        Se guarda como proporción (p. ej. {pctStr || "0.00"}% ={" "}
                        <code>
                          {(() => {
                            const p = stringToProportion(pctStr ?? "0");
                            return p == null ? "—" : p.toFixed(4);
                          })()}
                        </code>
                        ). Ejemplo: sobre 100.000 →{" "}
                        <b>
                          {(() => {
                            const p = stringToProportion(pctStr ?? "0") ?? 0;
                            return Math.round(100000 * p).toLocaleString(
                              "es-AR",
                            );
                          })()}
                        </b>
                        .
                      </p>
                    </div>

                    <div className="mb-4">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Label>Ajustes adicionales</Label>
                          <p className="text-xs text-sky-950/70 dark:text-white/70">
                            Se aplican sobre venta, costo o ganancia y se
                            descuentan de la comisión. Los montos fijos usan la
                            moneda del servicio.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={openNewAdjustment}
                          disabled={!canEdit}
                          className={ICON_BTN}
                        >
                          Agregar ajuste
                        </button>
                      </div>

                      {adjustments.length === 0 ? (
                        <p className="text-sm text-sky-950/70 dark:text-white/70">
                          No hay ajustes configurados.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {adjustments.map((adj) => {
                            const valueLabel =
                              adj.valueType === "percent"
                                ? `${percentToString(adj.value)}%`
                                : formatNumber(adj.value, 2);
                            return (
                              <li
                                key={adj.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">
                                      {adj.label}
                                    </span>
                                    {!adj.active && (
                                      <span className={BADGE}>Inactivo</span>
                                    )}
                                  </div>
                                  <div className="text-xs opacity-70">
                                    {adjKindLabels[adj.kind]} · Base{" "}
                                    {adjBasisLabels[adj.basis]} ·{" "}
                                    {adjValueLabels[adj.valueType]}{" "}
                                    {valueLabel}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleAdjustmentActive(adj.id)
                                    }
                                    disabled={!canEdit}
                                    className={ICON_BTN}
                                  >
                                    {adj.active ? "Desactivar" : "Activar"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditAdjustment(adj)}
                                    disabled={!canEdit}
                                    className={ICON_BTN}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeAdjustment(adj)}
                                    disabled={!canEdit}
                                    className={`${ICON_BTN} bg-rose-500/15 text-rose-700 dark:text-rose-300`}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMode(serverMode);
                          setPctStr(serverPctStr);
                          setAdjustments(serverAdjustments);
                          setUseBookingSaleTotal(serverUseBookingSaleTotal);
                        }}
                        disabled={!configDirty}
                        className="rounded-full bg-white/50 px-4 py-2 text-sky-950 shadow-sm transition hover:scale-[.98] active:scale-95 disabled:opacity-50 dark:bg-white/10 dark:text-white"
                      >
                        Restablecer
                      </button>
                      <button
                        type="button"
                        onClick={saveCalcConfig}
                        disabled={!canEdit || savingCfg || !configDirty}
                        className={ICON_BTN}
                        title={configDirty ? "⌘/Ctrl + S" : undefined}
                      >
                        {savingCfg ? <Spinner /> : "Guardar cambios"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Modal: crear/editar tipo */}
        <Modal
          open={typeModalOpen}
          onClose={() => setTypeModalOpen(false)}
          title={
            editingType ? "Editar tipo de servicio" : "Nuevo tipo de servicio"
          }
          footer={
            <>
              <button
                type="button"
                onClick={() => setTypeModalOpen(false)}
                className={ICON_BTN}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveType}
                disabled={savingType || !canEdit}
                className={ICON_BTN}
              >
                {savingType ? "Guardando…" : "Guardar"}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nombre</Label>
              <Input
                value={typeForm.name}
                onChange={(e) =>
                  setTypeForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Ej: Aéreos nacional"
              />
            </div>
            <div>
              <Label>Código</Label>
              <Input
                value={typeForm.code}
                onChange={(e) =>
                  setTypeForm((f) => ({ ...f, code: e.target.value }))
                }
                placeholder="aereos-nacional"
              />
              <p className="mt-1 text-[11px] opacity-60">
                Vista previa:{" "}
                <code>{slugify(typeForm.code || typeForm.name)}</code>
              </p>
            </div>
            <div className="sm:col-span-2">
              <Switch
                checked={!!typeForm.enabled}
                onChange={(v) => setTypeForm((f) => ({ ...f, enabled: v }))}
                label="Habilitado"
              />
            </div>
          </div>
        </Modal>

        <Modal
          open={adjModalOpen}
          onClose={() => setAdjModalOpen(false)}
          title={editingAdj ? "Editar ajuste" : "Nuevo ajuste"}
          footer={
            <>
              <button
                type="button"
                onClick={() => setAdjModalOpen(false)}
                className={ICON_BTN}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveAdjustment}
                disabled={!canEdit}
                className={ICON_BTN}
              >
                {editingAdj ? "Guardar" : "Agregar"}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nombre</Label>
              <Input
                value={adjForm.label}
                onChange={(e) =>
                  setAdjForm((f) => ({ ...f, label: e.target.value }))
                }
                placeholder="Ej: Impuesto de ganancias"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <select
                value={adjForm.kind}
                onChange={(e) =>
                  setAdjForm((f) => ({
                    ...f,
                    kind: e.target.value as BillingAdjustmentConfig["kind"],
                  }))
                }
                disabled={!canEdit}
                className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-4 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
              >
                <option value="cost">Costo</option>
                <option value="tax">Impuesto</option>
              </select>
            </div>
            <div>
              <Label>Base</Label>
              <select
                value={adjForm.basis}
                onChange={(e) =>
                  setAdjForm((f) => ({
                    ...f,
                    basis: e.target.value as BillingAdjustmentConfig["basis"],
                  }))
                }
                disabled={!canEdit}
                className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-4 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
              >
                <option value="sale">Venta</option>
                <option value="cost">Costo</option>
                <option value="margin">Ganancia</option>
              </select>
            </div>
            <div>
              <Label>Modo</Label>
              <select
                value={adjForm.valueType}
                onChange={(e) =>
                  setAdjForm((f) => ({
                    ...f,
                    valueType:
                      e.target.value as BillingAdjustmentConfig["valueType"],
                  }))
                }
                disabled={!canEdit}
                className="w-full cursor-pointer appearance-none rounded-3xl border border-white/30 bg-white/10 px-4 py-2 outline-none backdrop-blur dark:border-white/10 dark:bg-white/10"
              >
                <option value="percent">Porcentaje</option>
                <option value="fixed">Monto fijo</option>
              </select>
            </div>
            <div>
              <Label>
                {adjForm.valueType === "percent" ? "Porcentaje" : "Monto"}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={adjForm.valueStr}
                onChange={(e) =>
                  setAdjForm((f) => ({ ...f, valueStr: e.target.value }))
                }
                placeholder={adjForm.valueType === "percent" ? "2.40" : "0.00"}
                disabled={!canEdit}
                className="text-right"
              />
              <p className="mt-1 text-[11px] opacity-60">
                {adjForm.valueType === "percent"
                  ? "Se interpreta como porcentaje (ej: 2.40%)."
                  : "Se aplica como monto fijo por servicio."}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Switch
                checked={adjForm.active}
                onChange={(v) => setAdjForm((f) => ({ ...f, active: v }))}
                label="Activo"
              />
            </div>
          </div>
        </Modal>

        <ToastContainer position="bottom-right" />
      </section>
    </ProtectedRoute>
  );
}
