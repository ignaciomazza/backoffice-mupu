"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { normalizeRole } from "@/utils/permissions";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type SubscriptionResponse = {
  subscription: {
    status: string;
    anchor_day: number;
    timezone: string;
    direct_debit_discount_pct: number;
    next_anchor_date: string | Date | null;
  } | null;
  default_method: {
    method_type: string;
    status: string;
    holder_name: string | null;
    holder_tax_id: string | null;
    mandate: {
      status: string;
      cbu_masked: string | null;
      consent_accepted_at: string | Date | null;
      rejected_reason_code?: string | null;
      rejected_reason_text?: string | null;
    } | null;
  } | null;
  state: {
    status: string;
    method_type: string | null;
    mandate_status: string | null;
  };
};

type OverviewResponse = {
  status: string;
  next_anchor_date: string | Date;
  retry_days: number[];
  method_type: string | null;
  mandate_status: string | null;
  mandate_rejected_reason_code?: string | null;
  mandate_rejected_reason_text?: string | null;
  next_attempt_at?: string | Date | null;
  current_cycle?: {
    id_cycle: number;
    anchor_date: string | Date;
    period_start: string | Date;
    period_end: string | Date;
    status: string;
    fx_rate_date: string | Date | null;
    fx_rate_ars_per_usd: number | null;
    total_usd: number | null;
    total_ars: number | null;
    frozen_at: string | Date | null;
  } | null;
  current_charge?: {
    id_charge: number;
    status: string;
    due_date: string | Date | null;
    amount_ars_due: number | null;
    amount_ars_paid: number | null;
    reconciliation_status: string | null;
  } | null;
  attempts?: Array<{
    id_attempt: number;
    attempt_no: number;
    status: string;
    channel: string;
    scheduled_for: string | Date | null;
    processed_at: string | Date | null;
  }>;
  flags?: {
    in_collection: boolean;
    is_past_due: boolean;
    is_suspended: boolean;
    retries_exhausted?: boolean;
  };
  in_collection?: boolean;
  is_past_due?: boolean;
  is_suspended?: boolean;
};

function formatDate(value?: string | Date | null): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

function formatDateTime(value?: string | Date | null): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

function formatArs(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return "-";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function statusChipClass(status: string): string {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") {
    return "border-emerald-300/70 bg-emerald-100/30 text-emerald-900 dark:border-emerald-300/40 dark:bg-emerald-500/10 dark:text-emerald-50";
  }
  if (normalized === "PAST_DUE") {
    return "border-amber-300/70 bg-amber-100/30 text-amber-900 dark:border-amber-300/40 dark:bg-amber-500/10 dark:text-amber-50";
  }
  if (normalized === "SUSPENDED") {
    return "border-rose-300/70 bg-rose-100/30 text-rose-900 dark:border-rose-300/40 dark:bg-rose-500/10 dark:text-rose-50";
  }
  return "border-sky-300/70 bg-sky-100/30 text-sky-900 dark:border-sky-300/40 dark:bg-sky-500/10 dark:text-sky-50";
}

function subscriptionStatusLabel(status?: string | null): string {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "Activa";
  if (normalized === "PAST_DUE") return "Con atraso";
  if (normalized === "SUSPENDED") return "Suspendida";
  if (normalized === "CANCELED") return "Cancelada";
  return "En revisión";
}

function paymentMethodLabel(methodType?: string | null): string {
  const normalized = String(methodType || "").toUpperCase();
  if (normalized === "DIRECT_DEBIT_CBU_GALICIA") {
    return "Débito automático en cuenta bancaria";
  }
  if (normalized === "CIG_GALICIA") return "QR o transferencia bancaria";
  if (normalized === "MP_FALLBACK") return "Mercado Pago";
  return "Todavía no configurado";
}

function debitAuthorizationLabel(mandateStatus?: string | null): string {
  const normalized = String(mandateStatus || "").toUpperCase();
  if (normalized === "ACTIVE") return "Activa";
  if (normalized === "PENDING") return "En revisión por el banco";
  if (normalized === "PENDING_BANK") return "Pendiente de validación bancaria";
  if (normalized === "REVOKED") return "Revocada";
  if (normalized === "REJECTED") return "Rechazada";
  if (normalized === "EXPIRED") return "Vencida";
  return "Sin autorización";
}

function attemptStatusLabel(status?: string | null): string {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PENDING") return "Pendiente";
  if (normalized === "SCHEDULED") return "Programado";
  if (normalized === "PROCESSING") return "Procesando";
  if (normalized === "PAID") return "Cobrado";
  if (normalized === "REJECTED") return "Rechazado";
  if (normalized === "FAILED") return "Fallido";
  if (normalized === "CANCELED") return "Cancelado";
  return "Pendiente";
}

export default function AgencySubscriptionPage() {
  const { token, role, loading: authLoading } = useAuth();
  const normalizedRole = normalizeRole(role);
  const canManage = normalizedRole === "desarrollador";

  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingMethod, setSavingMethod] = useState(false);
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);

  const [holderName, setHolderName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [cbu, setCbu] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);

  const retryDaysLabel = useMemo(() => {
    const days = overview?.retry_days ?? [2, 4];
    return days.map((day) => `+${day}`).join(" / ");
  }, [overview?.retry_days]);

  const subscriptionStatus = overview?.status || data?.state.status || "ACTIVE";
  const paymentMethod = overview?.method_type || data?.state.method_type;
  const debitAuthorization = overview?.mandate_status || data?.state.mandate_status;
  const mandateRejectedReasonCode =
    overview?.mandate_rejected_reason_code ||
    data?.default_method?.mandate?.rejected_reason_code ||
    null;
  const mandateRejectedReasonText =
    overview?.mandate_rejected_reason_text ||
    data?.default_method?.mandate?.rejected_reason_text ||
    null;
  const nextChargeDate = overview?.next_anchor_date || data?.subscription?.next_anchor_date;
  const discountPct = data?.subscription?.direct_debit_discount_pct ?? 10;
  const attempts = overview?.attempts || [];
  const cycle = overview?.current_cycle || null;
  const nextAttemptAt = overview?.next_attempt_at || null;
  const flags = overview?.flags || {
    in_collection: Boolean(overview?.in_collection),
    is_past_due: Boolean(overview?.is_past_due),
    is_suspended: Boolean(overview?.is_suspended),
    retries_exhausted: false,
  };

  const loadAll = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    try {
      const [subscriptionRes, overviewRes] = await Promise.all([
        authFetch("/api/agency/subscription", { cache: "no-store" }, token),
        authFetch(
          "/api/agency/subscription/overview",
          { cache: "no-store" },
          token,
        ),
      ]);

      if (!subscriptionRes.ok) {
        const json = (await subscriptionRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(json?.error || "No se pudo cargar la suscripción");
      }

      const subscriptionJson = (await subscriptionRes.json()) as SubscriptionResponse;
      setData(subscriptionJson);

      if (subscriptionJson.default_method?.holder_name) {
        setHolderName(subscriptionJson.default_method.holder_name);
      }
      if (subscriptionJson.default_method?.holder_tax_id) {
        setTaxId(subscriptionJson.default_method.holder_tax_id);
      }

      if (overviewRes.ok) {
        const overviewJson = (await overviewRes.json()) as OverviewResponse;
        setOverview(overviewJson);
      } else {
        setOverview(null);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo cargar la suscripción";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadAll();
  }, [token, loadAll]);

  async function handleSaveSubscription() {
    if (!token) return;

    setSavingStatus(true);
    try {
      const res = await authFetch(
        "/api/agency/subscription",
        { method: "PUT", body: JSON.stringify({}) },
        token,
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudo actualizar la suscripción");
      }
      toast.success("Estado actualizado");
      await loadAll();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo actualizar el estado";
      toast.error(message);
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleSubmitDirectDebit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    setSavingMethod(true);
    try {
      const res = await authFetch(
        "/api/agency/subscription/payment-methods/direct-debit",
        {
          method: "POST",
          body: JSON.stringify({
            holderName,
            taxId,
            cbu,
            consentAccepted,
          }),
        },
        token,
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudo guardar el mandato");
      }

      toast.success("Listo. La autorización quedó enviada al banco para revisión.");
      setCbu("");
      setConsentAccepted(false);
      await loadAll();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo guardar el débito automático";
      toast.error(message);
    } finally {
      setSavingMethod(false);
    }
  }

  if (authLoading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      </ProtectedRoute>
    );
  }

  if (!canManage) {
    return (
      <ProtectedRoute>
        <section className="mx-auto mt-6 max-w-4xl rounded-3xl border border-rose-300/40 bg-rose-100/20 p-6 text-sm text-rose-900 dark:border-rose-300/30 dark:bg-rose-500/10 dark:text-rose-50">
          No tenés permisos para gestionar la suscripción.
        </section>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <section className="mt-4 w-full space-y-5 text-sky-950 dark:text-white">
        <header className="relative overflow-hidden rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-transparent" />
          <div className="relative grid gap-5 xl:grid-cols-[1.3fr_0.7fr] xl:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Suscripción</h1>
              <p className="mt-2 max-w-4xl text-sm opacity-85 sm:text-base">
                Desde acá podés ver tu estado de cobro, revisar la próxima fecha y dejar listo el
                débito automático.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium sm:text-sm">
                <span className="rounded-full border border-white/40 bg-white/20 px-3 py-1">
                  Cobro mensual: día 8
                </span>
                <span className="rounded-full border border-white/40 bg-white/20 px-3 py-1">
                  Cobro en pesos argentinos
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-300/40 bg-emerald-100/25 px-4 py-3 text-emerald-950 shadow-sm shadow-emerald-900/10 dark:border-emerald-300/30 dark:bg-emerald-500/10 dark:text-emerald-50">
              <div className="text-xs uppercase tracking-wide opacity-80">
                Beneficio por débito automático
              </div>
              <div className="mt-1 text-3xl font-semibold">-{Number(discountPct)}%</div>
              <div className="text-xs opacity-80">se aplica en cada renovación</div>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex min-h-[20vh] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="grid gap-5 xl:grid-cols-12">
              <article className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur sm:p-7 xl:col-span-5">
                <h2 className="text-xl font-semibold">Estado de tu suscripción</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/30 bg-white/20 p-4 transition duration-200 hover:bg-white/25 sm:col-span-2">
                    <div className="text-xs font-medium uppercase tracking-wide opacity-70">
                      Estado actual
                    </div>
                    <span
                      className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusChipClass(
                        subscriptionStatus,
                      )}`}
                    >
                      {subscriptionStatusLabel(subscriptionStatus)}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/30 bg-white/20 p-4 transition duration-200 hover:bg-white/25">
                    <div className="text-xs font-medium uppercase tracking-wide opacity-70">
                      Próximo cobro
                    </div>
                    <div className="mt-2 text-xl font-semibold">{formatDate(nextChargeDate)}</div>
                    <div className="mt-1 text-xs opacity-70">Se cobra el día 8.</div>
                  </div>
                  <div className="rounded-2xl border border-white/30 bg-white/20 p-4 transition duration-200 hover:bg-white/25">
                    <div className="text-xs font-medium uppercase tracking-wide opacity-70">
                      Reintentos
                    </div>
                    <div className="mt-2 text-xl font-semibold">{retryDaysLabel}</div>
                    <div className="mt-1 text-xs opacity-70">Si el cobro inicial falla.</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wide opacity-70">
                      Forma de cobro actual
                    </div>
                    <div className="mt-1 font-medium">{paymentMethodLabel(paymentMethod)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wide opacity-70">
                      Estado de autorización bancaria
                    </div>
                    <div className="mt-1 font-medium">
                      {debitAuthorizationLabel(debitAuthorization)}
                    </div>
                    {mandateRejectedReasonCode || mandateRejectedReasonText ? (
                      <div className="mt-2 text-xs opacity-80">
                        {mandateRejectedReasonCode ? `${mandateRejectedReasonCode} · ` : ""}
                        {mandateRejectedReasonText || "Motivo informado por el banco"}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/25 bg-white/15 p-4">
                  <h3 className="text-sm font-semibold">Ciclo actual</h3>
                  {!cycle ? (
                    <p className="mt-2 text-xs opacity-80">Todavía no hay un ciclo generado.</p>
                  ) : (
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
                      <div>
                        <div className="opacity-70">Período</div>
                        <div className="font-medium">
                          {formatDate(cycle.period_start)} al {formatDate(cycle.period_end)}
                        </div>
                      </div>
                      <div>
                        <div className="opacity-70">BSP utilizado</div>
                        <div className="font-medium">
                          {cycle.fx_rate_ars_per_usd != null
                            ? `${Number(cycle.fx_rate_ars_per_usd).toFixed(2)} ARS/USD`
                            : "-"}
                        </div>
                      </div>
                      <div>
                        <div className="opacity-70">Total congelado</div>
                        <div className="font-medium">{formatArs(cycle.total_ars)}</div>
                      </div>
                      <div>
                        <div className="opacity-70">Estado de cobro</div>
                        <div className="font-medium">
                          {flags.is_suspended
                            ? "Suspendida por mora"
                            : flags.is_past_due
                              ? "Vencida"
                              : flags.in_collection
                                ? "En gestión de cobro"
                                : "Al día"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-2xl border border-white/25 bg-white/15 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Intentos de cobro</h3>
                    <div className="text-xs opacity-80 sm:text-sm">
                      Próximo reintento:{" "}
                      <span className="font-medium">
                        {nextAttemptAt ? formatDateTime(nextAttemptAt) : "sin reintentos pendientes"}
                      </span>
                    </div>
                  </div>

                  {attempts.length === 0 ? (
                    <p className="mt-2 text-xs opacity-80">
                      Cuando se genere el cobro del ciclo, vas a ver los intentos acá.
                    </p>
                  ) : (
                    <div className="mt-3 overflow-auto">
                      <table className="min-w-full text-xs sm:text-sm">
                        <thead>
                          <tr className="text-left opacity-70">
                            <th className="pb-2 pr-3">Intento</th>
                            <th className="pb-2 pr-3">Fecha programada</th>
                            <th className="pb-2 pr-3">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attempts.map((attempt) => (
                            <tr key={attempt.id_attempt} className="border-t border-white/20">
                              <td className="py-2 pr-3">#{attempt.attempt_no}</td>
                              <td className="py-2 pr-3">{formatDateTime(attempt.scheduled_for)}</td>
                              <td className="py-2 pr-3">{attemptStatusLabel(attempt.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={handleSaveSubscription}
                    disabled={savingStatus}
                    className="rounded-full border border-sky-300/60 bg-sky-100/5 px-4 py-2 text-xs font-medium shadow-sm shadow-sky-900/10 transition hover:brightness-110 disabled:opacity-50"
                  >
                    {savingStatus ? "Actualizando..." : "Volver a cargar datos"}
                  </button>
                </div>
              </article>

              <article className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur sm:p-7 xl:col-span-7">
                <h2 className="text-xl font-semibold">Débito automático</h2>
                <p className="mt-1 text-sm opacity-80 sm:text-base">
                  Cargá los datos de tu cuenta bancaria para pagar todos los meses sin preocuparte.
                </p>
                <p className="mt-1 text-xs opacity-75 sm:text-sm">
                  Tenés un {Number(discountPct)}% de descuento al mantener este método activo.
                </p>

                <form className="mt-5 grid gap-4" onSubmit={handleSubmitDirectDebit}>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                        Titular de la cuenta
                      </span>
                      <input
                        value={holderName}
                        onChange={(e) => setHolderName(e.target.value)}
                        className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2.5 text-sm shadow-sm outline-none transition duration-200 focus:border-sky-400 dark:border-sky-200/60 dark:bg-sky-100/10"
                        placeholder="Nombre y apellido o razón social"
                        required
                      />
                    </label>

                    <label className="grid gap-1 text-sm">
                      <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                        CUIT o CUIL
                      </span>
                      <input
                        value={taxId}
                        onChange={(e) => setTaxId(e.target.value)}
                        className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2.5 text-sm shadow-sm outline-none transition duration-200 focus:border-sky-400 dark:border-sky-200/60 dark:bg-sky-100/10"
                        placeholder="20-12345678-9"
                        required
                      />
                    </label>
                  </div>

                  <label className="grid gap-1 text-sm">
                    <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                      CBU de la cuenta
                    </span>
                    <input
                      value={cbu}
                      onChange={(e) => setCbu(e.target.value)}
                      className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2.5 text-sm shadow-sm outline-none transition duration-200 focus:border-sky-400 dark:border-sky-200/60 dark:bg-sky-100/10"
                      placeholder="Ingresá los 22 números del CBU"
                      required
                    />
                  </label>

                  <label className="mt-0.5 flex items-start gap-2.5 rounded-2xl border border-white/25 bg-white/15 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={(e) => setConsentAccepted(e.target.checked)}
                      className="mt-0.5"
                      required
                    />
                    <span className="text-xs opacity-90 sm:text-sm">
                      Acepto autorizar el débito automático mensual desde esta cuenta.
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/25 bg-white/15 p-3">
                    <button
                      type="submit"
                      disabled={savingMethod}
                      className="rounded-full border border-emerald-300/60 bg-emerald-100/5 px-4 py-2 text-sm font-medium shadow-sm shadow-emerald-900/10 transition hover:brightness-110 disabled:opacity-50"
                    >
                      {savingMethod ? "Guardando..." : "Guardar débito automático"}
                    </button>

                    <div className="text-xs opacity-85 sm:text-sm">
                      CBU registrado:{" "}
                      <span className="font-semibold">
                        {data?.default_method?.mandate?.cbu_masked || "todavía no cargado"}
                      </span>
                    </div>

                    <div className="text-xs opacity-85 sm:text-sm">
                      Estado de autorización:{" "}
                      <span className="font-semibold">
                        {debitAuthorizationLabel(data?.default_method?.mandate?.status)}
                      </span>
                    </div>

                    {mandateRejectedReasonCode || mandateRejectedReasonText ? (
                      <div className="w-full text-xs opacity-85 sm:text-sm">
                        Motivo del rechazo:{" "}
                        <span className="font-semibold">
                          {mandateRejectedReasonCode ? `${mandateRejectedReasonCode} · ` : ""}
                          {mandateRejectedReasonText || "Sin detalle"}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </form>
              </article>

              <article className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur sm:p-7 xl:col-span-12">
                <h2 className="text-xl font-semibold">Alternativas de pago</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3">
                    <div className="text-sm font-medium">QR o transferencia bancaria</div>
                    <p className="mt-1 text-sm opacity-80">Disponible próximamente.</p>
                  </div>
                  <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3">
                    <div className="text-sm font-medium">Mercado Pago</div>
                    <p className="mt-1 text-sm opacity-80">Disponible como alternativa manual.</p>
                  </div>
                </div>
                {/* TODO(PR #2/3): integrar publicación CIG + QR + conciliación de pagos. */}
              </article>
            </div>
          </>
        )}
      </section>
      <ToastContainer position="top-right" autoClose={2200} />
    </ProtectedRoute>
  );
}
