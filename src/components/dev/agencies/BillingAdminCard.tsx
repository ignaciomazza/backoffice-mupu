// src/components/dev/agencies/BillingAdminCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import {
  PLAN_DATA,
  calcExtraUsersCost,
  calcInfraCost,
  calcMonthlyBase,
  type PlanKey,
} from "@/lib/billing/pricing";

type BillingConfig = {
  id_config?: number;
  id_agency: number;
  plan_key: PlanKey;
  billing_users: number;
  user_limit: number | null;
  currency: string;
  start_date?: string | null;
  notes?: string | null;
};

type Adjustment = {
  id_adjustment: number;
  kind: "tax" | "discount";
  mode: "percent" | "fixed";
  value: number;
  currency?: string | null;
  label?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  active: boolean;
};

type Charge = {
  id_charge: number;
  period_start?: string | null;
  period_end?: string | null;
  status: string;
  base_amount_usd: number;
  adjustments_total_usd: number;
  total_usd: number;
  paid_amount?: number | null;
  paid_currency?: string | null;
  fx_rate?: number | null;
  paid_at?: string | null;
  account?: string | null;
  payment_method?: string | null;
  notes?: string | null;
};

type StatsPayload = {
  totals: {
    billed_usd: number;
    paid_usd: number;
    outstanding_usd: number;
  };
  counts: {
    total: number;
    pending: number;
    paid: number;
  };
  last_payment_at?: string | null;
  estimates: {
    monthly_usd: number;
    quarterly_usd: number;
    semiannual_usd: number;
    annual_usd: number;
  };
};

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatYMD(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function toYMD(value?: string | Date | null) {
  if (!value) return "";
  if (value instanceof Date) return formatYMD(value);
  const raw = String(value);
  if (isDateOnly(raw)) return raw;
  if (raw.includes("T")) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return formatYMD(d);
}

function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  if (value instanceof Date) return value.toLocaleDateString("es-AR");
  const raw = String(value);
  if (isDateOnly(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("es-AR");
}

function formatMoney(value: number, currency = "USD") {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(safe);
}

function activeAdjustments(adjustments: Adjustment[], date: Date) {
  return adjustments.filter((adj) => {
    if (!adj.active) return false;
    if (adj.starts_at && new Date(adj.starts_at) > date) return false;
    if (adj.ends_at && new Date(adj.ends_at) < date) return false;
    return true;
  });
}

function calcDiscountTotal(base: number, adjustments: Adjustment[]) {
  const percent = adjustments
    .filter((adj) => adj.mode === "percent")
    .reduce((sum, adj) => sum + Number(adj.value || 0), 0);
  const fixed = adjustments
    .filter((adj) => adj.mode === "fixed")
    .reduce((sum, adj) => sum + Number(adj.value || 0), 0);
  return base * (percent / 100) + fixed;
}

function calcTaxTotal(netBase: number, adjustments: Adjustment[]) {
  const percent = adjustments
    .filter((adj) => adj.mode === "percent")
    .reduce((sum, adj) => sum + Number(adj.value || 0), 0);
  const fixed = adjustments
    .filter((adj) => adj.mode === "fixed")
    .reduce((sum, adj) => sum + Number(adj.value || 0), 0);
  return netBase * (percent / 100) + fixed;
}

function calcTotals(base: number, adjustments: Adjustment[], date: Date) {
  const active = activeAdjustments(adjustments, date);
  const discounts = active.filter((adj) => adj.kind === "discount");
  const taxes = active.filter((adj) => adj.kind === "tax");
  const discountUsd = calcDiscountTotal(base, discounts);
  const netBase = Math.max(base - discountUsd, 0);
  const taxUsd = calcTaxTotal(netBase, taxes);
  const netAdjustments = taxUsd - discountUsd;
  const total = netBase + taxUsd;
  return { discountUsd, taxUsd, netAdjustments, total };
}

type Props = { agencyId: number };

export default function BillingAdminCard({ agencyId }: Props) {
  const { token } = useAuth();

  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [config, setConfig] = useState<BillingConfig>({
    id_agency: agencyId,
    plan_key: "basico",
    billing_users: 3,
    user_limit: null,
    currency: "USD",
    start_date: null,
    notes: "",
  });
  const [currentUsers, setCurrentUsers] = useState(0);

  const [adjustmentsLoading, setAdjustmentsLoading] = useState(true);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<number | null>(
    null,
  );
  const [adjustmentForm, setAdjustmentForm] = useState({
    kind: "discount" as "discount" | "tax",
    mode: "percent" as "percent" | "fixed",
    value: "",
    currency: "USD",
    label: "",
    starts_at: "",
    ends_at: "",
    active: true,
  });
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);

  const [chargesLoading, setChargesLoading] = useState(true);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [nextChargeCursor, setNextChargeCursor] = useState<number | null>(null);
  const [chargesLoadingMore, setChargesLoadingMore] = useState(false);
  const [editingChargeId, setEditingChargeId] = useState<number | null>(null);
  const [chargeForm, setChargeForm] = useState({
    period_start: "",
    period_end: "",
    base_amount_usd: "",
    adjustments_total_usd: "",
    paid_amount: "",
    paid_currency: "USD",
    fx_rate: "",
    paid_at: "",
    account: "",
    payment_method: "",
    notes: "",
  });
  const [chargeTaxPct, setChargeTaxPct] = useState("");
  const [chargeDiscountPct, setChargeDiscountPct] = useState("");
  const [chargeTaxUsd, setChargeTaxUsd] = useState("");
  const [chargeDiscountUsd, setChargeDiscountUsd] = useState("");
  const [chargeSaving, setChargeSaving] = useState(false);

  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const monthlyBase = useMemo(() => {
    return calcMonthlyBase(config.plan_key, config.billing_users);
  }, [config.plan_key, config.billing_users]);
  const monthlyTotals = useMemo(() => {
    return calcTotals(monthlyBase, adjustments, new Date());
  }, [monthlyBase, adjustments]);
  const monthlyTotal = monthlyTotals.total;
  const chargeAdjustmentNet = useMemo(() => {
    const tax = Number(chargeTaxUsd || 0);
    const discount = Number(chargeDiscountUsd || 0);
    if (!Number.isFinite(tax) || !Number.isFinite(discount)) return 0;
    return tax - discount;
  }, [chargeTaxUsd, chargeDiscountUsd]);
  const chargeTotal = useMemo(() => {
    const base = Number(chargeForm.base_amount_usd || 0);
    const adj = chargeAdjustmentNet;
    if (!Number.isFinite(base) || !Number.isFinite(adj)) return 0;
    return base + adj;
  }, [chargeForm.base_amount_usd, chargeAdjustmentNet]);

  const overLimit =
    config.user_limit != null && currentUsers > config.user_limit;

  async function fetchConfig() {
    if (!token) return;
    setConfigLoading(true);
    try {
      const res = await authFetch(
        `/api/dev/agencies/${agencyId}/billing/config`,
        {},
        token,
      );
      if (!res.ok) throw new Error("No se pudo cargar el plan");
      const data = (await res.json()) as {
        config: BillingConfig;
        current_users: number;
      };
      setConfig(data.config);
      setCurrentUsers(data.current_users);
    } catch (e) {
      console.error(e);
      toast.error("Error cargando plan");
    } finally {
      setConfigLoading(false);
    }
  }

  async function fetchAdjustments() {
    if (!token) return;
    setAdjustmentsLoading(true);
    try {
      const res = await authFetch(
        `/api/dev/agencies/${agencyId}/billing/adjustments`,
        {},
        token,
      );
      if (!res.ok) throw new Error("No se pudieron cargar ajustes");
      const data = (await res.json()) as { items: Adjustment[] };
      setAdjustments(data.items);
    } catch (e) {
      console.error(e);
      toast.error("Error cargando ajustes");
    } finally {
      setAdjustmentsLoading(false);
    }
  }

  async function fetchCharges(init = true) {
    if (!token) return;
    if (init) setChargesLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "10" });
      const res = await authFetch(
        `/api/dev/agencies/${agencyId}/billing/charges?${qs.toString()}`,
        {},
        token,
      );
      if (!res.ok) throw new Error("No se pudieron cargar cobros");
      const data = (await res.json()) as {
        items: Charge[];
        nextCursor: number | null;
      };
      setCharges(data.items);
      setNextChargeCursor(data.nextCursor);
    } catch (e) {
      console.error(e);
      toast.error("Error cargando cobros");
    } finally {
      if (init) setChargesLoading(false);
    }
  }

  async function loadMoreCharges() {
    if (!token || nextChargeCursor == null || chargesLoadingMore) return;
    setChargesLoadingMore(true);
    try {
      const qs = new URLSearchParams({
        limit: "10",
        cursor: String(nextChargeCursor),
      });
      const res = await authFetch(
        `/api/dev/agencies/${agencyId}/billing/charges?${qs.toString()}`,
        {},
        token,
      );
      if (!res.ok) throw new Error("No se pudieron cargar mas cobros");
      const data = (await res.json()) as {
        items: Charge[];
        nextCursor: number | null;
      };
      setCharges((prev) => [...prev, ...data.items]);
      setNextChargeCursor(data.nextCursor);
    } catch (e) {
      console.error(e);
      toast.error("Error cargando mas cobros");
    } finally {
      setChargesLoadingMore(false);
    }
  }

  async function fetchStats() {
    if (!token) return;
    setStatsLoading(true);
    try {
      const res = await authFetch(
        `/api/dev/agencies/${agencyId}/billing/stats`,
        {},
        token,
      );
      if (!res.ok) throw new Error("No se pudieron cargar estadisticas");
      const data = (await res.json()) as StatsPayload;
      setStats(data);
    } catch (e) {
      console.error(e);
      toast.error("Error cargando estadisticas");
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !agencyId) return;
    fetchConfig();
    fetchAdjustments();
    fetchCharges();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, agencyId]);

  async function saveConfig() {
    if (!token) return;
    setConfigSaving(true);
    try {
      const payload = {
        plan_key: config.plan_key,
        billing_users: Number(config.billing_users),
        user_limit: config.user_limit ?? undefined,
        currency: config.currency || "USD",
        start_date: config.start_date ? config.start_date : null,
        notes: config.notes || "",
      };
      const res = await authFetch(
        `/api/dev/agencies/${agencyId}/billing/config`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
        token,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo guardar");
      }
      const saved = (await res.json()) as BillingConfig;
      setConfig(saved);
      toast.success("Plan actualizado");
      fetchStats();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error guardando plan");
    } finally {
      setConfigSaving(false);
    }
  }

  function startEditAdjustment(adj: Adjustment) {
    setEditingAdjustmentId(adj.id_adjustment);
    setAdjustmentForm({
      kind: adj.kind,
      mode: adj.mode,
      value: String(adj.value ?? ""),
      currency: adj.currency ?? "USD",
      label: adj.label ?? "",
      starts_at: toYMD(adj.starts_at ?? null),
      ends_at: toYMD(adj.ends_at ?? null),
      active: Boolean(adj.active),
    });
  }

  function resetAdjustmentForm(kind: "discount" | "tax" = "discount") {
    setEditingAdjustmentId(null);
    setAdjustmentForm({
      kind,
      mode: "percent",
      value: "",
      currency: "USD",
      label: "",
      starts_at: "",
      ends_at: "",
      active: true,
    });
  }

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setAdjustmentSaving(true);
    try {
      const payload = {
        kind: adjustmentForm.kind,
        mode: adjustmentForm.mode,
        value: adjustmentForm.value,
        currency:
          adjustmentForm.mode === "fixed"
            ? adjustmentForm.currency || "USD"
            : undefined,
        label: adjustmentForm.label || undefined,
        starts_at: adjustmentForm.starts_at || null,
        ends_at: adjustmentForm.ends_at || null,
        active: adjustmentForm.active,
      };
      const url = editingAdjustmentId
        ? `/api/dev/agencies/${agencyId}/billing/adjustments/${editingAdjustmentId}`
        : `/api/dev/agencies/${agencyId}/billing/adjustments`;
      const method = editingAdjustmentId ? "PUT" : "POST";
      const res = await authFetch(
        url,
        { method, body: JSON.stringify(payload) },
        token,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo guardar el ajuste");
      }
      toast.success(editingAdjustmentId ? "Ajuste actualizado" : "Ajuste creado");
      resetAdjustmentForm();
      fetchAdjustments();
      fetchStats();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error guardando ajuste");
    } finally {
      setAdjustmentSaving(false);
    }
  }

  async function deleteAdjustment(id: number) {
    if (!token) return;
    if (!confirm("¿Eliminar este ajuste?")) return;
    try {
      const res = await authFetch(
        `/api/dev/agencies/${agencyId}/billing/adjustments/${id}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo eliminar");
      }
      toast.success("Ajuste eliminado");
      fetchAdjustments();
      fetchStats();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error eliminando ajuste");
    }
  }

  function startEditCharge(charge: Charge) {
    setEditingChargeId(charge.id_charge);
    const netAdj = Number(charge.adjustments_total_usd ?? 0);
    setChargeForm({
      period_start: toYMD(charge.period_start ?? null),
      period_end: toYMD(charge.period_end ?? null),
      base_amount_usd: String(charge.base_amount_usd ?? ""),
      adjustments_total_usd: String(charge.adjustments_total_usd ?? ""),
      paid_amount: charge.paid_amount != null ? String(charge.paid_amount) : "",
      paid_currency: charge.paid_currency || "USD",
      fx_rate: charge.fx_rate != null ? String(charge.fx_rate) : "",
      paid_at: toYMD(charge.paid_at ?? null),
      account: charge.account || "",
      payment_method: charge.payment_method || "",
      notes: charge.notes || "",
    });
    setChargeTaxPct("");
    setChargeDiscountPct("");
    if (netAdj >= 0) {
      setChargeTaxUsd(netAdj ? netAdj.toFixed(2) : "");
      setChargeDiscountUsd("");
    } else {
      setChargeTaxUsd("");
      setChargeDiscountUsd(Math.abs(netAdj).toFixed(2));
    }
  }

  function resetChargeForm() {
    setEditingChargeId(null);
    setChargeForm({
      period_start: "",
      period_end: "",
      base_amount_usd: "",
      adjustments_total_usd: "",
      paid_amount: "",
      paid_currency: "USD",
      fx_rate: "",
      paid_at: "",
      account: "",
      payment_method: "",
      notes: "",
    });
    setChargeTaxPct("");
    setChargeDiscountPct("");
    setChargeTaxUsd("");
    setChargeDiscountUsd("");
  }

  function fillEstimate() {
    setChargeForm((prev) => ({
      ...prev,
      base_amount_usd: String(monthlyBase.toFixed(2)),
      adjustments_total_usd: String(monthlyTotals.netAdjustments.toFixed(2)),
    }));
    setChargeTaxPct("");
    setChargeDiscountPct("");
    setChargeTaxUsd(
      monthlyTotals.taxUsd ? monthlyTotals.taxUsd.toFixed(2) : "",
    );
    setChargeDiscountUsd(
      monthlyTotals.discountUsd ? monthlyTotals.discountUsd.toFixed(2) : "",
    );
  }

  function applyPercentAdjustments() {
    const base = Number(chargeForm.base_amount_usd);
    if (!Number.isFinite(base) || base <= 0) {
      toast.info("Primero cargá el monto base en USD.");
      return;
    }
    const tax = Number(chargeTaxPct || 0);
    const discount = Number(chargeDiscountPct || 0);
    const discountAmount = Number.isFinite(discount)
      ? (base * discount) / 100
      : 0;
    const netBase = Math.max(base - discountAmount, 0);
    const taxAmount = Number.isFinite(tax) ? (netBase * tax) / 100 : 0;
    const adjustments = taxAmount - discountAmount;
    setChargeForm((prev) => ({
      ...prev,
      adjustments_total_usd: adjustments.toFixed(2),
    }));
    setChargeTaxUsd(taxAmount > 0 ? taxAmount.toFixed(2) : "");
    setChargeDiscountUsd(discountAmount > 0 ? discountAmount.toFixed(2) : "");
  }

  async function submitCharge(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setChargeSaving(true);
    try {
      const paidAmount = chargeForm.paid_amount
        ? Number(chargeForm.paid_amount)
        : null;
      const paidAt = chargeForm.paid_at || null;
      const status = paidAmount || paidAt ? "PAID" : "PENDING";
      const payload = {
        period_start: chargeForm.period_start || null,
        period_end: chargeForm.period_end || null,
        status,
        base_amount_usd: chargeForm.base_amount_usd,
        adjustments_total_usd: chargeAdjustmentNet,
        paid_amount: paidAmount ?? undefined,
        paid_currency: chargeForm.paid_currency || undefined,
        fx_rate: chargeForm.fx_rate || undefined,
        paid_at: paidAt,
        account: chargeForm.account || undefined,
        payment_method: chargeForm.payment_method || undefined,
        notes: chargeForm.notes || undefined,
      };
      const url = editingChargeId
        ? `/api/dev/agencies/${agencyId}/billing/charges/${editingChargeId}`
        : `/api/dev/agencies/${agencyId}/billing/charges`;
      const method = editingChargeId ? "PUT" : "POST";
      const res = await authFetch(
        url,
        { method, body: JSON.stringify(payload) },
        token,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo guardar el cobro");
      }
      toast.success(editingChargeId ? "Cobro actualizado" : "Cobro creado");
      resetChargeForm();
      fetchCharges();
      fetchStats();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error guardando cobro");
    } finally {
      setChargeSaving(false);
    }
  }

  async function deleteCharge(id: number) {
    if (!token) return;
    if (!confirm("¿Eliminar este cobro?")) return;
    try {
      const res = await authFetch(
        `/api/dev/agencies/${agencyId}/billing/charges/${id}`,
        { method: "DELETE" },
        token,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "No se pudo eliminar");
      }
      toast.success("Cobro eliminado");
      fetchCharges();
      fetchStats();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Error eliminando cobro");
    }
  }

  return (
    <div className="space-y-6 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-md shadow-sky-950/10 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">Facturacion de agencia</h3>
          <p className="text-xs text-sky-950/60 dark:text-white/60">
            Paso a paso: 1) Plan y usuarios 2) Ajustes 3) Registrar cobro 4)
            Seguimiento.
          </p>
        </div>
        <div className="text-xs text-sky-950/60 dark:text-white/60">
          Base en USD. Si el pago es en otra moneda, carga monto y cotizacion.
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-medium">Estado diario</h4>
          <button
            type="button"
            onClick={fetchStats}
            className="rounded-full bg-white/0 px-4 py-1.5 text-xs text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
          >
            Actualizar
          </button>
        </div>

        {statsLoading || !stats ? (
          <p className="text-sm text-sky-950/60 dark:text-white/60">
            Cargando estadisticas...
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                <div className="rounded-xl border border-white/10 bg-white/30 p-3 dark:bg-white/10">
                  <p className="text-xs text-sky-950/60 dark:text-white/60">
                    Total cobrado
                  </p>
                  <p className="text-base font-semibold">
                    {formatMoney(stats.totals.paid_usd)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/30 p-3 dark:bg-white/10">
                  <p className="text-xs text-sky-950/60 dark:text-white/60">
                    Deuda actual
                  </p>
                  <p className="text-base font-semibold">
                    {formatMoney(stats.totals.outstanding_usd)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/30 p-3 dark:bg-white/10">
                  <p className="text-xs text-sky-950/60 dark:text-white/60">
                    Ultimo pago
                  </p>
                  <p className="text-base font-semibold">
                    {formatDate(stats.last_payment_at ?? null)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/30 p-3 text-xs dark:bg-white/10">
                <div className="flex justify-between">
                  <span>Estimado mensual</span>
                  <span>{formatMoney(stats.estimates.monthly_usd)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Estimado trimestral</span>
                  <span>{formatMoney(stats.estimates.quarterly_usd)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Estimado semestral</span>
                  <span>{formatMoney(stats.estimates.semiannual_usd)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Estimado anual</span>
                  <span>{formatMoney(stats.estimates.annual_usd)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-sky-950/60 dark:text-white/60">
              <span>Cobros: {stats.counts.total}</span>
              <span>Pagados: {stats.counts.paid}</span>
              <span>Pendientes: {stats.counts.pending}</span>
            </div>
            <p className="text-[11px] text-sky-950/60 dark:text-white/60">
              Ventana de cobro: del 1 al 15 de cada mes.
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-900">
                1
              </div>
              <div>
                <h4 className="text-base font-medium">
                  Definir plan y usuarios
                </h4>
                <p className="text-xs text-sky-950/60 dark:text-white/60">
                  Base mensual segun el cotizador. Ajusta usuarios cobrados y
                  limite interno.
                </p>
              </div>
            </div>
            <span className="text-xs text-sky-950/60 dark:text-white/60">
              Usuarios actuales: {currentUsers}
            </span>
          </div>

          {configLoading ? (
            <p className="text-sm text-sky-950/60 dark:text-white/60">
              Cargando plan...
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs">Plan</span>
                  <select
                    value={config.plan_key}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        plan_key: e.target.value as PlanKey,
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                  >
                    {Object.entries(PLAN_DATA).map(([key, data]) => (
                      <option key={key} value={key}>
                        {data.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs">
                    Usuarios cobrados (cotizador)
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={config.billing_users}
                    onChange={(e) =>
                      setConfig((prev) => {
                        const next = Number(e.target.value);
                        return {
                          ...prev,
                          billing_users: Number.isFinite(next) ? next : 1,
                        };
                      })
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs">
                    Limite de usuarios (sin bloqueo)
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={config.user_limit ?? ""}
                    onChange={(e) =>
                      setConfig((prev) => {
                        if (!e.target.value) {
                          return { ...prev, user_limit: null };
                        }
                        const next = Number(e.target.value);
                        return {
                          ...prev,
                          user_limit: Number.isFinite(next) ? next : null,
                        };
                      })
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs">Inicio del plan</span>
                  <input
                    type="date"
                    value={toYMD(config.start_date ?? null)}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        start_date: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                  />
                </label>
              </div>

              {overLimit && (
                <p className="text-xs text-amber-600">
                  Los usuarios actuales superan el limite configurado.
                </p>
              )}

              <div className="rounded-xl border border-white/10 bg-white/30 p-3 text-xs text-sky-950/70 dark:bg-white/10 dark:text-white/70">
                <div className="flex justify-between">
                  <span>Base plan</span>
                  <span>{formatMoney(PLAN_DATA[config.plan_key].base)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Usuarios extra</span>
                  <span>
                    {formatMoney(calcExtraUsersCost(config.billing_users))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Infra</span>
                  <span>{formatMoney(calcInfraCost(config.billing_users))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Descuentos activos</span>
                  <span>-{formatMoney(monthlyTotals.discountUsd)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Impuestos activos</span>
                  <span>{formatMoney(monthlyTotals.taxUsd)}</span>
                </div>
                <div className="mt-2 flex justify-between font-medium">
                  <span>Total mensual estimado</span>
                  <span>{formatMoney(monthlyTotal)}</span>
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs">Notas</span>
                <textarea
                  value={config.notes ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="min-h-[70px] w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={saveConfig}
                  disabled={configSaving}
                  className="rounded-full bg-sky-100 px-5 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
                >
                  {configSaving ? "Guardando..." : "Guardar plan"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-900">
                2
              </div>
              <div>
                <h4 className="text-base font-medium">Ajustes temporales</h4>
                <p className="text-xs text-sky-950/60 dark:text-white/60">
                  Descuentos o impuestos por campaña. Se aplican sobre la base
                  mensual. Descuentos primero, impuestos sobre el neto.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => resetAdjustmentForm("discount")}
                className="rounded-full bg-white/0 px-4 py-1.5 text-xs text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
              >
                Nuevo descuento
              </button>
              <button
                type="button"
                onClick={() => resetAdjustmentForm("tax")}
                className="rounded-full bg-white/0 px-4 py-1.5 text-xs text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
              >
                Nuevo impuesto
              </button>
            </div>
          </div>

          {adjustmentsLoading ? (
            <p className="text-sm text-sky-950/60 dark:text-white/60">
              Cargando ajustes...
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-sky-950/70 dark:text-white/70">
                  Descuentos
                </p>
                {adjustments.filter((adj) => adj.kind === "discount").length ===
                0 ? (
                  <p className="text-sm text-sky-950/60 dark:text-white/60">
                    No hay descuentos activos.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {adjustments
                      .filter((adj) => adj.kind === "discount")
                      .map((adj) => (
                        <div
                          key={adj.id_adjustment}
                          className="space-y-2 rounded-xl border border-white/10 bg-white/30 p-3 text-xs dark:bg-white/10"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">
                              {adj.label || "Sin titulo"}
                            </span>
                            <span className="rounded-full bg-white/30 px-2 py-0.5 text-[10px] dark:bg-white/10">
                              {adj.active ? "Activo" : "Pausado"}
                            </span>
                          </div>
                          <div className="text-sky-950/70 dark:text-white/70">
                            {adj.mode === "percent"
                              ? `${adj.value}%`
                              : `${adj.value} ${adj.currency || "USD"}`}
                          </div>
                          <div className="text-sky-950/60 dark:text-white/60">
                            {formatDate(adj.starts_at ?? null)} →{" "}
                            {formatDate(adj.ends_at ?? null)}
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEditAdjustment(adj)}
                              className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAdjustment(adj.id_adjustment)}
                              className="rounded-full bg-red-600/90 px-3 py-1 text-xs text-red-50 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-sky-950/70 dark:text-white/70">
                  Impuestos
                </p>
                {adjustments.filter((adj) => adj.kind === "tax").length === 0 ? (
                  <p className="text-sm text-sky-950/60 dark:text-white/60">
                    No hay impuestos activos.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {adjustments
                      .filter((adj) => adj.kind === "tax")
                      .map((adj) => (
                        <div
                          key={adj.id_adjustment}
                          className="space-y-2 rounded-xl border border-white/10 bg-white/30 p-3 text-xs dark:bg-white/10"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">
                              {adj.label || "Sin titulo"}
                            </span>
                            <span className="rounded-full bg-white/30 px-2 py-0.5 text-[10px] dark:bg-white/10">
                              {adj.active ? "Activo" : "Pausado"}
                            </span>
                          </div>
                          <div className="text-sky-950/70 dark:text-white/70">
                            {adj.mode === "percent"
                              ? `${adj.value}%`
                              : `${adj.value} ${adj.currency || "USD"}`}
                          </div>
                          <div className="text-sky-950/60 dark:text-white/60">
                            {formatDate(adj.starts_at ?? null)} →{" "}
                            {formatDate(adj.ends_at ?? null)}
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEditAdjustment(adj)}
                              className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAdjustment(adj.id_adjustment)}
                              className="rounded-full bg-red-600/90 px-3 py-1 text-xs text-red-50 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <form
            onSubmit={submitAdjustment}
            className="space-y-3 rounded-xl border border-white/10 bg-white/20 p-3 text-sm dark:bg-white/10"
          >
            <p className="text-[11px] text-sky-950/60 dark:text-white/60">
              Ejemplo: base 40, descuento 20 (3 meses), IVA 21% = total 24,20.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs">Tipo</span>
                <select
                  value={adjustmentForm.kind}
                  onChange={(e) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      kind: e.target.value as "discount" | "tax",
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                >
                  <option value="discount">Descuento</option>
                  <option value="tax">Impuesto</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs">Modo</span>
                <select
                  value={adjustmentForm.mode}
                  onChange={(e) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      mode: e.target.value as "percent" | "fixed",
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                >
                  <option value="percent">Porcentaje</option>
                  <option value="fixed">Monto fijo</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs">Valor</span>
                <input
                  type="number"
                  step="0.01"
                  value={adjustmentForm.value}
                  onChange={(e) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      value: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs">Moneda</span>
                <input
                  type="text"
                  value={adjustmentForm.currency}
                  onChange={(e) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      currency: e.target.value.toUpperCase(),
                    }))
                  }
                  disabled={adjustmentForm.mode !== "fixed"}
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none disabled:opacity-60 dark:bg-white/10 dark:text-white"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs">Etiqueta</span>
              <input
                type="text"
                value={adjustmentForm.label}
                onChange={(e) =>
                  setAdjustmentForm((prev) => ({
                    ...prev,
                    label: e.target.value,
                  }))
                }
                className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs">Desde</span>
                <input
                  type="date"
                  value={adjustmentForm.starts_at}
                  onChange={(e) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      starts_at: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs">Hasta</span>
                <input
                  type="date"
                  value={adjustmentForm.ends_at}
                  onChange={(e) =>
                    setAdjustmentForm((prev) => ({
                      ...prev,
                      ends_at: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={adjustmentForm.active}
                onChange={(e) =>
                  setAdjustmentForm((prev) => ({
                    ...prev,
                    active: e.target.checked,
                  }))
                }
              />
              Activo
            </label>

            <div className="flex justify-end gap-2">
              {editingAdjustmentId && (
                <button
                  type="button"
                  onClick={() => resetAdjustmentForm()}
                  className="rounded-full bg-white/0 px-4 py-2 text-xs text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={adjustmentSaving}
                className="rounded-full bg-sky-100 px-4 py-2 text-xs text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
              >
                {adjustmentSaving
                  ? "Guardando..."
                  : editingAdjustmentId
                    ? "Guardar ajuste"
                    : "Crear ajuste"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-900">
                3
              </div>
              <div>
                <h4 className="text-base font-medium">Registrar cobro mensual</h4>
                <p className="text-xs text-sky-950/60 dark:text-white/60">
                  Crea el cobro (base + impuestos/descuentos) y registra el
                  pago si ya lo recibiste. Si solo queres deuda, deja el pago
                  vacio y estado PENDING.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetChargeForm}
              className="rounded-full bg-white/0 px-4 py-1.5 text-xs text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
            >
              Limpiar
            </button>
          </div>

          <form
            onSubmit={submitCharge}
            className="space-y-3 rounded-xl border border-white/10 bg-white/20 p-3 text-sm dark:bg-white/10"
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={fillEstimate}
                className="rounded-full bg-white/0 px-4 py-1.5 text-xs text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
              >
                Usar estimacion actual
              </button>
              <span className="text-[11px] text-sky-950/60 dark:text-white/60">
                Total estimado: {formatMoney(monthlyTotal)}
              </span>
            </div>
            <p className="text-[11px] text-sky-950/60 dark:text-white/60">
              La estimacion toma los ajustes configurados en el paso 2.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs">Periodo inicio</span>
                <input
                  type="date"
                  value={chargeForm.period_start}
                  onChange={(e) =>
                    setChargeForm((prev) => ({
                      ...prev,
                      period_start: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs">Periodo fin</span>
                <input
                  type="date"
                  value={chargeForm.period_end}
                  onChange={(e) =>
                    setChargeForm((prev) => ({
                      ...prev,
                      period_end: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
            </div>
            <p className="text-[11px] text-sky-950/60 dark:text-white/60">
              La ventana de cobro es del 1 al 15 de cada mes.
            </p>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs">Base USD</span>
                <input
                  type="number"
                  step="0.01"
                  value={chargeForm.base_amount_usd}
                  onChange={(e) =>
                    setChargeForm((prev) => ({
                      ...prev,
                      base_amount_usd: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs">Descuento USD</span>
                <input
                  type="number"
                  step="0.01"
                  value={chargeDiscountUsd}
                  onChange={(e) => setChargeDiscountUsd(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs">Impuesto USD</span>
                <input
                  type="number"
                  step="0.01"
                  value={chargeTaxUsd}
                  onChange={(e) => setChargeTaxUsd(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
            </div>

            <p className="text-[11px] text-sky-950/60 dark:text-white/60">
              Total USD actual: {formatMoney(chargeTotal)}. Se calcula como
              base - descuento + impuesto.
            </p>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs">Descuento %</span>
                <input
                  type="number"
                  step="0.01"
                  value={chargeDiscountPct}
                  onChange={(e) => setChargeDiscountPct(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs">Impuesto % (IVA)</span>
                <input
                  type="number"
                  step="0.01"
                  value={chargeTaxPct}
                  onChange={(e) => setChargeTaxPct(e.target.value)}
                  placeholder="21"
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={applyPercentAdjustments}
                  className="w-full rounded-full bg-white/0 px-4 py-2 text-xs text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
                >
                  Calcular desde % (% aplica sobre neto)
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs">Monto pagado</span>
                <input
                  type="number"
                  step="0.01"
                  value={chargeForm.paid_amount}
                  onChange={(e) =>
                    setChargeForm((prev) => ({
                      ...prev,
                      paid_amount: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs">Moneda pago</span>
                <input
                  type="text"
                  value={chargeForm.paid_currency}
                  onChange={(e) =>
                    setChargeForm((prev) => ({
                      ...prev,
                      paid_currency: e.target.value.toUpperCase(),
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs">Cotizacion USD</span>
                <input
                  type="number"
                  step="0.0001"
                  value={chargeForm.fx_rate}
                  onChange={(e) =>
                    setChargeForm((prev) => ({
                      ...prev,
                      fx_rate: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
            </div>

            <p className="text-[11px] text-sky-950/60 dark:text-white/60">
              Si el pago fue en ARS: USD estimado = monto pagado / cotizacion.
            </p>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs">Fecha pago</span>
                <input
                  type="date"
                  value={chargeForm.paid_at}
                  onChange={(e) =>
                    setChargeForm((prev) => ({
                      ...prev,
                      paid_at: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs">Cuenta</span>
                <input
                  type="text"
                  value={chargeForm.account}
                  onChange={(e) =>
                    setChargeForm((prev) => ({
                      ...prev,
                      account: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs">Metodo</span>
                <input
                  type="text"
                  value={chargeForm.payment_method}
                  onChange={(e) =>
                    setChargeForm((prev) => ({
                      ...prev,
                      payment_method: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs">Notas</span>
              <textarea
                value={chargeForm.notes}
                onChange={(e) =>
                  setChargeForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                className="min-h-[70px] w-full rounded-xl border border-white/10 bg-white/50 px-3 py-2 text-sm outline-none dark:bg-white/10 dark:text-white"
              />
            </label>

            <div className="flex justify-end gap-2">
              {editingChargeId && (
                <button
                  type="button"
                  onClick={resetChargeForm}
                  className="rounded-full bg-white/0 px-4 py-2 text-xs text-sky-950 shadow-sm ring-1 ring-sky-950/10 transition-transform hover:scale-95 active:scale-90 dark:text-white dark:ring-white/10"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={chargeSaving}
                className="rounded-full bg-sky-100 px-4 py-2 text-xs text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
              >
                {chargeSaving
                  ? "Guardando..."
                  : editingChargeId
                    ? "Guardar cobro"
                    : "Crear cobro"}
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-900">
                4
              </div>
              <div>
                <h4 className="text-base font-medium">Cobros registrados</h4>
                <p className="text-xs text-sky-950/60 dark:text-white/60">
                  Lista de cobros registrados y estado de pago.
                </p>
              </div>
            </div>
          </div>

          {chargesLoading ? (
            <p className="text-sm text-sky-950/60 dark:text-white/60">
              Cargando cobros...
            </p>
          ) : charges.length === 0 ? (
            <p className="text-sm text-sky-950/60 dark:text-white/60">
              Todavia no hay cobros registrados.
            </p>
          ) : (
            <div className="space-y-3">
              {charges.map((charge) => (
                <div
                  key={charge.id_charge}
                  className="space-y-2 rounded-xl border border-white/10 bg-white/30 p-3 text-xs dark:bg-white/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {formatDate(charge.period_start ?? null)} →{" "}
                      {formatDate(charge.period_end ?? null)}
                    </span>
                    <span className="rounded-full bg-white/30 px-2 py-0.5 text-[10px] dark:bg-white/10">
                      {charge.status}
                    </span>
                  </div>
                  <div className="text-sky-950/70 dark:text-white/70">
                    Total: {formatMoney(charge.total_usd)}
                  </div>
                  {charge.paid_amount != null && (
                    <div className="text-sky-950/60 dark:text-white/60">
                      Pago: {charge.paid_amount}{" "}
                      {charge.paid_currency || "USD"}
                      {charge.fx_rate
                        ? ` (USD ${(
                            Number(charge.paid_amount) /
                            Number(charge.fx_rate)
                          ).toFixed(2)})`
                        : ""}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => startEditCharge(charge)}
                      className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCharge(charge.id_charge)}
                      className="rounded-full bg-red-600/90 px-3 py-1 text-xs text-red-50 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}

              {nextChargeCursor != null && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={loadMoreCharges}
                    disabled={chargesLoadingMore}
                    className="rounded-full bg-sky-100 px-4 py-2 text-xs text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:bg-white/10 dark:text-white"
                  >
                    {chargesLoadingMore ? "Cargando..." : "Ver mas"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
