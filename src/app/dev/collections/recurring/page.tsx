"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import { normalizeRole } from "@/utils/permissions";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type RunSummary = {
  anchor_date: string;
  override_fx: boolean;
  subscriptions_total: number;
  subscriptions_processed: number;
  cycles_created: number;
  charges_created: number;
  attempts_created: number;
  fx_rates_used: Array<{ date: string; ars_per_usd: number }>;
  errors: Array<{ id_agency: number; message: string }>;
};

type CycleRow = {
  id_cycle: number;
  id_agency: number;
  subscription_id: number;
  anchor_date: string;
  period_start: string;
  period_end: string;
  status: string;
  fx_rate_ars_per_usd: number | null;
  total_ars: number | null;
  latest_charge: {
    id_charge: number;
    status: string;
    amount_ars_due: number | null;
  } | null;
};

type ChargeRow = {
  id_charge: number;
  id_agency: number;
  cycle_id: number | null;
  due_date: string | null;
  status: string;
  amount_ars_due: number | null;
  amount_ars_paid: number | null;
  paid_reference: string | null;
  fiscal_document: {
    id_fiscal_document: number;
    document_type: string;
    status: string;
    afip_number: string | null;
    afip_cae: string | null;
    issued_at: string | null;
    error_message: string | null;
    retry_count: number;
  } | null;
  attempts: Array<{
    id_attempt: number;
    attempt_no: number;
    status: string;
    scheduled_for: string | null;
  }>;
};

type BatchRow = {
  id_batch: number;
  parent_batch_id: number | null;
  direction: "OUTBOUND" | "INBOUND" | string;
  channel: string;
  file_type: string;
  adapter: string | null;
  business_date: string;
  status: string;
  storage_key: string | null;
  original_file_name: string | null;
  total_rows: number;
  total_amount_ars: number | null;
  total_paid_rows: number;
  total_rejected_rows: number;
  total_error_rows: number;
  created_at: string;
};

function dateInputToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);
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

function fiscalStatusLabel(status?: string | null): string {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ISSUED") return "Emitido";
  if (normalized === "FAILED") return "Error";
  if (normalized === "PENDING") return "Pendiente";
  return "-";
}

export default function RecurringCollectionsDevPage() {
  const { token, role, loading: authLoading } = useAuth();
  const normalizedRole = useMemo(() => normalizeRole(role), [role]);
  const canAccess = normalizedRole === "desarrollador" || normalizedRole === "gerente";

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const [anchorDate, setAnchorDate] = useState(dateInputToday());
  const [overrideFx, setOverrideFx] = useState(false);
  const [batchDate, setBatchDate] = useState(dateInputToday());
  const [from, setFrom] = useState(dateInputDaysAgo(60));
  const [to, setTo] = useState(dateInputToday());
  const [statusFilter, setStatusFilter] = useState("");

  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [uploadingBatchId, setUploadingBatchId] = useState<number | null>(null);
  const [retryingFiscalChargeId, setRetryingFiscalChargeId] = useState<number | null>(null);
  const [lastImportSummary, setLastImportSummary] = useState<{
    outboundBatchId: number;
    matched_rows: number;
    paid: number;
    rejected: number;
    error_rows: number;
  } | null>(null);
  const [selectedResponseFileByBatch, setSelectedResponseFileByBatch] = useState<
    Record<number, File | null>
  >({});

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [cyclesRes, chargesRes, batchesRes] = await Promise.all([
        authFetch(
          `/api/admin/collections/cycles?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { cache: "no-store" },
          token,
        ),
        authFetch(
          `/api/admin/collections/charges?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ""}`,
          { cache: "no-store" },
          token,
        ),
        authFetch(
          `/api/admin/collections/direct-debit/batches?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { cache: "no-store" },
          token,
        ),
      ]);

      if (!cyclesRes.ok) {
        const json = (await cyclesRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudieron cargar los ciclos");
      }
      if (!chargesRes.ok) {
        const json = (await chargesRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudieron cargar los cobros");
      }
      if (!batchesRes.ok) {
        const json = (await batchesRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudieron cargar los lotes");
      }

      const cyclesJson = (await cyclesRes.json()) as { items: CycleRow[] };
      const chargesJson = (await chargesRes.json()) as { items: ChargeRow[] };
      const batchesJson = (await batchesRes.json()) as { items: BatchRow[] };
      setCycles(cyclesJson.items || []);
      setCharges(chargesJson.items || []);
      setBatches(batchesJson.items || []);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo cargar la vista";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [from, statusFilter, to, token]);

  useEffect(() => {
    if (!token || !canAccess) return;
    void loadData();
  }, [token, canAccess, loadData]);

  async function handleRunAnchor(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    setRunning(true);
    try {
      const qs = new URLSearchParams({
        date: anchorDate,
        overrideFx: String(overrideFx),
      });

      const res = await authFetch(
        `/api/admin/collections/run-anchor?${qs.toString()}`,
        { method: "POST" },
        token,
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudo correr la corrida");
      }

      const json = (await res.json()) as { summary: RunSummary };
      setSummary(json.summary);
      toast.success("Corrida ejecutada");
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo correr la corrida";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    setCreatingBatch(true);
    try {
      const res = await authFetch(
        `/api/admin/collections/direct-debit/batches?date=${encodeURIComponent(batchDate)}`,
        { method: "POST" },
        token,
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudo crear el lote");
      }

      const json = (await res.json()) as {
        batch: { id_batch: number; total_rows: number };
      };
      toast.success(`Lote creado (#${json.batch.id_batch}) con ${json.batch.total_rows} filas`);
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo crear el lote";
      toast.error(message);
    } finally {
      setCreatingBatch(false);
    }
  }

  async function handleDownloadBatch(batchId: number) {
    if (!token) return;

    try {
      const res = await authFetch(
        `/api/admin/collections/direct-debit/batches/${batchId}/download`,
        { cache: "no-store" },
        token,
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudo descargar el archivo");
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition") || "";
      const fileNameMatch = /filename=\"?([^\";]+)\"?/i.exec(contentDisposition);
      const fileName = fileNameMatch?.[1] || `batch-${batchId}.csv`;

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo descargar el lote";
      toast.error(message);
    }
  }

  async function handleImportResponse(batchId: number) {
    if (!token) return;
    const file = selectedResponseFileByBatch[batchId];
    if (!file) {
      toast.error("Elegí un archivo de respuesta antes de importar");
      return;
    }

    setUploadingBatchId(batchId);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await authFetch(
        `/api/admin/collections/direct-debit/batches/${batchId}/import-response`,
        {
          method: "POST",
          body: formData,
        },
        token,
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudo importar la respuesta");
      }

      const json = (await res.json()) as {
        summary: {
          matched_rows: number;
          paid: number;
          rejected: number;
          error_rows: number;
        };
      };

      setLastImportSummary({
        outboundBatchId: batchId,
        matched_rows: json.summary.matched_rows,
        paid: json.summary.paid,
        rejected: json.summary.rejected,
        error_rows: json.summary.error_rows,
      });
      toast.success(
        `Respuesta importada: ${json.summary.paid} pagos, ${json.summary.rejected} rechazados, ${json.summary.error_rows} errores`,
      );
      setSelectedResponseFileByBatch((prev) => ({ ...prev, [batchId]: null }));
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo importar la respuesta";
      toast.error(message);
    } finally {
      setUploadingBatchId(null);
    }
  }

  async function handleRetryIssueFiscal(chargeId: number) {
    if (!token) return;
    setRetryingFiscalChargeId(chargeId);
    try {
      const res = await authFetch(
        `/api/admin/collections/charges/${chargeId}/retry-issue-fiscal`,
        { method: "POST" },
        token,
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "No se pudo reintentar la emisión fiscal");
      }

      toast.success("Se ejecutó el reintento fiscal");
      await loadData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo reintentar la emisión fiscal";
      toast.error(message);
    } finally {
      setRetryingFiscalChargeId(null);
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

  if (!canAccess) {
    return (
      <ProtectedRoute>
        <section className="mx-auto mt-6 max-w-4xl rounded-3xl border border-rose-300/40 bg-rose-100/20 p-6 text-sm text-rose-900 dark:border-rose-300/30 dark:bg-rose-500/10 dark:text-rose-50">
          No tenés permisos para acceder a Cobranzas Recurrentes.
        </section>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <section className="mx-auto mt-4 max-w-6xl space-y-5 text-sky-950 dark:text-white">
        <header className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur">
          <h1 className="text-2xl font-semibold">Cobranzas recurrentes</h1>
          <p className="mt-1 text-sm opacity-80">
            Corrida manual del ciclo anclado y monitoreo de ciclos/cobros.
          </p>
        </header>

        <article className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur">
          <h2 className="text-lg font-semibold">Correr corrida (día ancla)</h2>
          <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={handleRunAnchor}>
            <label className="grid gap-1 text-sm">
              <span className="text-xs opacity-70">Fecha base</span>
              <input
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
                className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2 text-sm shadow-sm outline-none dark:border-sky-200/60 dark:bg-sky-100/10"
              />
            </label>

            <label className="mt-5 flex items-center gap-2 text-sm md:mt-7">
              <input
                type="checkbox"
                checked={overrideFx}
                onChange={(e) => setOverrideFx(e.target.checked)}
              />
              Permitir BSP anterior si falta el del día
            </label>

            <div className="md:col-span-2 md:flex md:items-end">
              <button
                type="submit"
                disabled={running}
                className="rounded-full border border-emerald-300/60 bg-emerald-100/5 px-4 py-2 text-sm font-medium shadow-sm shadow-emerald-900/10 transition hover:brightness-110 disabled:opacity-50"
              >
                {running ? "Ejecutando..." : "Correr corrida"}
              </button>
            </div>
          </form>

          {summary ? (
            <div className="mt-4 rounded-2xl border border-white/25 bg-white/15 p-4 text-sm">
              <div className="font-semibold">Última ejecución</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>Ancla: {summary.anchor_date}</div>
                <div>Suscripciones: {summary.subscriptions_processed}/{summary.subscriptions_total}</div>
                <div>Ciclos creados: {summary.cycles_created}</div>
                <div>Cobros creados: {summary.charges_created}</div>
                <div>Intentos creados: {summary.attempts_created}</div>
                <div>Errores: {summary.errors.length}</div>
              </div>
            </div>
          ) : null}
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur">
          <h2 className="text-lg font-semibold">Filtros</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span className="text-xs opacity-70">Desde</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2 text-sm shadow-sm outline-none dark:border-sky-200/60 dark:bg-sky-100/10"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs opacity-70">Hasta</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2 text-sm shadow-sm outline-none dark:border-sky-200/60 dark:bg-sky-100/10"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs opacity-70">Estado cobro (opcional)</span>
              <input
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value.toUpperCase())}
                placeholder="READY / PAID / ..."
                className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2 text-sm shadow-sm outline-none dark:border-sky-200/60 dark:bg-sky-100/10"
              />
            </label>
            <div className="md:flex md:items-end">
              <button
                type="button"
                onClick={() => void loadData()}
                className="rounded-full border border-sky-300/60 bg-sky-100/5 px-4 py-2 text-sm font-medium shadow-sm shadow-sky-900/10 transition hover:brightness-110"
              >
                Recargar
              </button>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur">
          <h2 className="text-lg font-semibold">Pago Directo - Lotes</h2>

          <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={handleCreateBatch}>
            <label className="grid gap-1 text-sm">
              <span className="text-xs opacity-70">Fecha de negocio</span>
              <input
                type="date"
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
                className="rounded-2xl border border-sky-200 bg-white/60 px-4 py-2 text-sm shadow-sm outline-none dark:border-sky-200/60 dark:bg-sky-100/10"
              />
            </label>

            <div className="md:col-span-3 md:flex md:items-end">
              <button
                type="submit"
                disabled={creatingBatch}
                className="rounded-full border border-emerald-300/60 bg-emerald-100/5 px-4 py-2 text-sm font-medium shadow-sm shadow-emerald-900/10 transition hover:brightness-110 disabled:opacity-50"
              >
                {creatingBatch ? "Creando lote..." : "Crear lote de presentación"}
              </button>
            </div>
          </form>

          {lastImportSummary ? (
            <div className="mt-4 rounded-2xl border border-white/25 bg-white/15 p-3 text-xs sm:text-sm">
              <span className="font-semibold">
                Última importación (lote #{lastImportSummary.outboundBatchId}):
              </span>{" "}
              Matcheados {lastImportSummary.matched_rows} · Pagados {lastImportSummary.paid} ·
              Rechazados {lastImportSummary.rejected} · Errores {lastImportSummary.error_rows}
            </div>
          ) : null}

          <div className="mt-5 overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs opacity-70">
                  <th className="pb-2 pr-3">#</th>
                  <th className="pb-2 pr-3">Dirección</th>
                  <th className="pb-2 pr-3">Fecha</th>
                  <th className="pb-2 pr-3">Estado</th>
                  <th className="pb-2 pr-3">Filas</th>
                  <th className="pb-2 pr-3">Total</th>
                  <th className="pb-2 pr-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td className="py-3 text-xs opacity-70" colSpan={7}>
                      Sin lotes para el rango seleccionado.
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => (
                    <tr key={batch.id_batch} className="border-t border-white/20 align-top">
                      <td className="py-2 pr-3">#{batch.id_batch}</td>
                      <td className="py-2 pr-3">
                        {batch.direction}
                        {batch.parent_batch_id ? ` · resp. de #${batch.parent_batch_id}` : ""}
                      </td>
                      <td className="py-2 pr-3">{formatDate(batch.business_date)}</td>
                      <td className="py-2 pr-3">{batch.status}</td>
                      <td className="py-2 pr-3">{batch.total_rows}</td>
                      <td className="py-2 pr-3">{formatArs(batch.total_amount_ars)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-col gap-2">
                          {batch.storage_key ? (
                            <button
                              type="button"
                              onClick={() => void handleDownloadBatch(batch.id_batch)}
                              className="w-fit rounded-full border border-sky-300/60 bg-sky-100/10 px-3 py-1 text-xs font-medium transition hover:brightness-110"
                            >
                              Descargar
                            </button>
                          ) : null}

                          {batch.direction === "OUTBOUND" ? (
                            <div className="flex flex-col gap-2">
                              <input
                                type="file"
                                accept=".csv,text/csv"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  setSelectedResponseFileByBatch((prev) => ({
                                    ...prev,
                                    [batch.id_batch]: file,
                                  }));
                                }}
                                className="text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => void handleImportResponse(batch.id_batch)}
                                disabled={
                                  uploadingBatchId === batch.id_batch ||
                                  !selectedResponseFileByBatch[batch.id_batch]
                                }
                                className="w-fit rounded-full border border-amber-300/60 bg-amber-100/10 px-3 py-1 text-xs font-medium transition hover:brightness-110 disabled:opacity-50"
                              >
                                {uploadingBatchId === batch.id_batch
                                  ? "Importando..."
                                  : "Importar respuesta"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur">
          <h2 className="text-lg font-semibold">Ciclos recientes</h2>
          {loading ? (
            <div className="mt-4 flex min-h-[15vh] items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs opacity-70">
                    <th className="pb-2 pr-3">Agencia</th>
                    <th className="pb-2 pr-3">Ancla</th>
                    <th className="pb-2 pr-3">Período</th>
                    <th className="pb-2 pr-3">BSP</th>
                    <th className="pb-2 pr-3">Total ARS</th>
                    <th className="pb-2 pr-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.length === 0 ? (
                    <tr>
                      <td className="py-3 text-xs opacity-70" colSpan={6}>
                        Sin ciclos en el rango.
                      </td>
                    </tr>
                  ) : (
                    cycles.map((cycle) => (
                      <tr key={cycle.id_cycle} className="border-t border-white/20">
                        <td className="py-2 pr-3">#{cycle.id_agency}</td>
                        <td className="py-2 pr-3">{formatDate(cycle.anchor_date)}</td>
                        <td className="py-2 pr-3">
                          {formatDate(cycle.period_start)} - {formatDate(cycle.period_end)}
                        </td>
                        <td className="py-2 pr-3">
                          {cycle.fx_rate_ars_per_usd != null
                            ? Number(cycle.fx_rate_ars_per_usd).toFixed(2)
                            : "-"}
                        </td>
                        <td className="py-2 pr-3">{formatArs(cycle.total_ars)}</td>
                        <td className="py-2 pr-3">{cycle.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="rounded-3xl border border-white/30 bg-white/10 p-6 shadow-lg shadow-sky-900/10 backdrop-blur">
          <h2 className="text-lg font-semibold">Cobros recientes</h2>
          {loading ? (
            <div className="mt-4 flex min-h-[15vh] items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs opacity-70">
                    <th className="pb-2 pr-3">Agencia</th>
                    <th className="pb-2 pr-3">Vencimiento</th>
                    <th className="pb-2 pr-3">Estado</th>
                    <th className="pb-2 pr-3">Importe ARS</th>
                    <th className="pb-2 pr-3">Intentos</th>
                    <th className="pb-2 pr-3">Fiscal</th>
                    <th className="pb-2 pr-3">Acción fiscal</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.length === 0 ? (
                    <tr>
                      <td className="py-3 text-xs opacity-70" colSpan={7}>
                        Sin cobros en el rango.
                      </td>
                    </tr>
                  ) : (
                    charges.map((charge) => (
                      <tr key={charge.id_charge} className="border-t border-white/20">
                        <td className="py-2 pr-3">#{charge.id_agency}</td>
                        <td className="py-2 pr-3">{formatDate(charge.due_date)}</td>
                        <td className="py-2 pr-3">{charge.status}</td>
                        <td className="py-2 pr-3">{formatArs(charge.amount_ars_due)}</td>
                        <td className="py-2 pr-3">
                          {charge.attempts.map((attempt) => `#${attempt.attempt_no} ${attempt.status}`).join(" · ") || "-"}
                        </td>
                        <td className="py-2 pr-3">
                          {fiscalStatusLabel(charge.fiscal_document?.status)}
                          {charge.fiscal_document?.afip_number ? (
                            <div className="mt-1 text-[11px] opacity-80">
                              N° AFIP {charge.fiscal_document.afip_number}
                            </div>
                          ) : null}
                          {charge.fiscal_document?.issued_at ? (
                            <div className="mt-1 text-[11px] opacity-70">
                              {formatDateTime(charge.fiscal_document.issued_at)}
                            </div>
                          ) : null}
                          {charge.fiscal_document?.error_message ? (
                            <div className="mt-1 max-w-xs text-[11px] opacity-75">
                              {charge.fiscal_document.error_message}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">
                          {charge.fiscal_document?.status === "FAILED" ? (
                            <button
                              type="button"
                              onClick={() => void handleRetryIssueFiscal(charge.id_charge)}
                              disabled={retryingFiscalChargeId === charge.id_charge}
                              className="rounded-full border border-rose-300/60 bg-rose-100/10 px-3 py-1 text-xs font-medium transition hover:brightness-110 disabled:opacity-50"
                            >
                              {retryingFiscalChargeId === charge.id_charge
                                ? "Reintentando..."
                                : "Reintentar"}
                            </button>
                          ) : (
                            <span className="text-xs opacity-60">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
      <ToastContainer position="top-right" autoClose={2200} />
    </ProtectedRoute>
  );
}
