"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";
import {
  loadFinancePicks,
  type FinanceAccount,
  type FinanceCurrency,
  type FinancePaymentMethod,
} from "@/utils/loadFinancePicks";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type TransferRow = {
  id_transfer: number;
  transfer_date: string;
  note: string | null;
  origin_account_id: number | null;
  origin_account_name: string | null;
  origin_method_id: number | null;
  origin_method_name: string | null;
  origin_currency: string;
  origin_amount: number;
  destination_account_id: number | null;
  destination_account_name: string | null;
  destination_method_id: number | null;
  destination_method_name: string | null;
  destination_currency: string;
  destination_amount: number;
  fx_rate: number | null;
  fee_amount: number | null;
  fee_currency: string | null;
  fee_account_name: string | null;
  fee_method_name: string | null;
  fee_note: string | null;
  created_at: string;
  deleted_at: string | null;
};

type AuditRow = {
  id_audit: number;
  account_id: number;
  account_name: string | null;
  currency: string;
  year: number;
  month: number;
  expected_balance: number;
  actual_balance: number;
  difference: number;
  note: string | null;
  create_adjustment: boolean;
  adjustment_id: number | null;
  created_at: string;
};

type AdjustmentRow = {
  id_adjustment: number;
  account_id: number;
  account_name: string | null;
  currency: string;
  amount: number;
  effective_date: string;
  reason: string;
  note: string | null;
  source: string;
  audit_id: number | null;
  created_at: string;
};

type MonthLock = {
  id_agency: number;
  year: number;
  month: number;
  is_locked: boolean;
  reason?: string | null;
  locked_at?: string | null;
  locked_by?: number | null;
  unlocked_at?: string | null;
  unlocked_by?: number | null;
};

type MonthLockEvent = {
  id_event: number;
  year: number;
  month: number;
  action: "lock" | "unlock" | string;
  reason: string | null;
  acted_by: number | null;
  acted_at: string;
};

type AuditPreview = {
  account_id: number;
  currency: string;
  year: number;
  month: number;
  expected_balance: number;
  opening_amount: number;
  opening_date: string | null;
  is_locked: boolean;
};

const GLASS =
  "rounded-3xl border border-white/30 bg-white/10 backdrop-blur shadow-lg shadow-sky-900/10 dark:bg-white/10 dark:border-white/5";
const BTN_BASE =
  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium shadow-sm backdrop-blur transition-transform hover:scale-[.98] active:scale-95 disabled:opacity-50";
const BTN_SKY = `${BTN_BASE} border-sky-300/60 bg-sky-100/5 text-sky-950 shadow-sky-900/10 dark:border-sky-400/30 dark:bg-sky-500/5 dark:text-sky-50`;
const BTN_EMERALD = `${BTN_BASE} border-emerald-300/60 bg-emerald-100/5 text-emerald-900 shadow-emerald-900/10 dark:border-emerald-400/30 dark:bg-emerald-500/5 dark:text-emerald-50`;
const BTN_DANGER = `${BTN_BASE} border-rose-300/60 bg-rose-500/5 text-rose-900 shadow-rose-900/10 dark:border-rose-400/40 dark:bg-rose-500/5 dark:text-rose-50`;

const MONTH_OPTIONS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseOptionalNumber(value: string): number | undefined {
  const raw = String(value || "").trim().replace(",", ".");
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalInt(value: string): number | undefined {
  const n = parseOptionalNumber(value);
  if (n == null) return undefined;
  return Math.trunc(n);
}

function formatAmount(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const code = String(currency || "ARS").toUpperCase();
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${safe.toFixed(2)} ${code}`;
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR");
}

function SectionToggle({
  title,
  description,
  open,
  onToggle,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-left"
    >
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs opacity-75">{description}</p>
      </div>
      <span className="text-xs font-medium">{open ? "Ocultar" : "Mostrar"}</span>
    </button>
  );
}

function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  );
}

export default function PasesSaldoPage() {
  const { token } = useAuth();
  const now = useMemo(() => new Date(), []);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [currencies, setCurrencies] = useState<FinanceCurrency[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [methods, setMethods] = useState<FinancePaymentMethod[]>([]);

  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [monthLock, setMonthLock] = useState<MonthLock | null>(null);
  const [lockEvents, setLockEvents] = useState<MonthLockEvent[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [savingAudit, setSavingAudit] = useState(false);
  const [savingLock, setSavingLock] = useState(false);
  const [deletingTransferId, setDeletingTransferId] = useState<number | null>(
    null,
  );

  const [openTransfer, setOpenTransfer] = useState(true);
  const [openAudit, setOpenAudit] = useState(false);
  const [openLock, setOpenLock] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);

  const [sameCurrency, setSameCurrency] = useState(true);
  const [addFee, setAddFee] = useState(false);
  const [useMethods, setUseMethods] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [transferForm, setTransferForm] = useState({
    transfer_date: toDateInputValue(now),
    note: "",
    origin_account_id: "",
    origin_method_id: "",
    origin_currency: "ARS",
    origin_amount: "",
    destination_account_id: "",
    destination_method_id: "",
    destination_currency: "ARS",
    destination_amount: "",
    fx_rate: "",
    fee_amount: "",
    fee_currency: "ARS",
    fee_account_id: "",
    fee_method_id: "",
    fee_note: "",
  });

  const [auditForm, setAuditForm] = useState({
    account_id: "",
    currency: "ARS",
    actual_balance: "",
    note: "",
    create_adjustment: false,
    adjustment_reason: "",
  });

  const [preview, setPreview] = useState<AuditPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lockReason, setLockReason] = useState("");
  const [deleteReasonByTransfer, setDeleteReasonByTransfer] = useState<
    Record<number, string>
  >({});

  const enabledCurrencies = useMemo(
    () => currencies.filter((c) => c.enabled),
    [currencies],
  );

  const currencyOptions = enabledCurrencies.length
    ? enabledCurrencies
    : currencies;

  const isLocked = !!monthLock?.is_locked;

  const loadData = useCallback(
    async (initial = false) => {
      if (!token) return;
      if (initial) setLoading(true);
      else setRefreshing(true);

      try {
        const [picks, transfersRes, auditsRes, lockRes] = await Promise.all([
          loadFinancePicks(token),
          authFetch(
            `/api/finance/transfers?year=${year}&month=${month}&take=300`,
            { cache: "no-store" },
            token,
          ),
          authFetch(
            `/api/finance/account-audits?year=${year}&month=${month}&take=300`,
            { cache: "no-store" },
            token,
          ),
          authFetch(
            `/api/finance/month-locks?year=${year}&month=${month}`,
            { cache: "no-store" },
            token,
          ),
        ]);

        setCurrencies(picks.currencies || []);
        setAccounts(picks.accounts || []);
        setMethods(picks.paymentMethods || []);

        if (transfersRes.ok) {
          const data = (await transfersRes.json()) as { items?: TransferRow[] };
          setTransfers(Array.isArray(data.items) ? data.items : []);
        } else {
          setTransfers([]);
        }

        if (auditsRes.ok) {
          const data = (await auditsRes.json()) as {
            audits?: AuditRow[];
            adjustments?: AdjustmentRow[];
          };
          setAudits(Array.isArray(data.audits) ? data.audits : []);
          setAdjustments(Array.isArray(data.adjustments) ? data.adjustments : []);
        } else {
          setAudits([]);
          setAdjustments([]);
        }

        if (lockRes.ok) {
          const data = (await lockRes.json()) as {
            lock?: MonthLock;
            events?: MonthLockEvent[];
          };
          setMonthLock(data.lock ?? null);
          setLockEvents(Array.isArray(data.events) ? data.events : []);
        } else {
          setMonthLock(null);
          setLockEvents([]);
        }
      } catch (e) {
        console.error("[pases-saldo] loadData", e);
        toast.error("No se pudieron cargar los datos.");
      } finally {
        if (initial) setLoading(false);
        else setRefreshing(false);
      }
    },
    [token, year, month],
  );

  useEffect(() => {
    if (!token) return;
    void loadData(true);
  }, [token, loadData]);

  useEffect(() => {
    if (!currencyOptions.length) return;
    const fallback = currencyOptions[0].code.toUpperCase();
    setTransferForm((prev) => ({
      ...prev,
      origin_currency: prev.origin_currency || fallback,
      destination_currency: prev.destination_currency || fallback,
      fee_currency: prev.fee_currency || fallback,
    }));
    setAuditForm((prev) => ({
      ...prev,
      currency: prev.currency || fallback,
    }));
  }, [currencyOptions]);

  useEffect(() => {
    if (!sameCurrency) return;
    setTransferForm((prev) => ({
      ...prev,
      destination_currency: prev.origin_currency,
      destination_amount: prev.origin_amount,
      fx_rate: "",
    }));
  }, [sameCurrency, transferForm.origin_currency, transferForm.origin_amount]);

  const handleSaveTransfer = async () => {
    if (!token) return;

    const originAmount = parseOptionalNumber(transferForm.origin_amount);
    const destinationAmount = sameCurrency
      ? originAmount
      : parseOptionalNumber(transferForm.destination_amount);

    if (!originAmount || !destinationAmount) {
      toast.error("Completá montos válidos en origen y destino.");
      return;
    }

    const originAccountId = parseOptionalInt(transferForm.origin_account_id);
    const destinationAccountId = parseOptionalInt(
      transferForm.destination_account_id,
    );
    const originMethodId = useMethods
      ? parseOptionalInt(transferForm.origin_method_id)
      : undefined;
    const destinationMethodId = useMethods
      ? parseOptionalInt(transferForm.destination_method_id)
      : undefined;

    if (!originAccountId && !originMethodId) {
      toast.error("Elegí al menos cuenta o método en origen.");
      return;
    }
    if (!destinationAccountId && !destinationMethodId) {
      toast.error("Elegí al menos cuenta o método en destino.");
      return;
    }

    const payload = {
      transfer_date: transferForm.transfer_date,
      note: transferForm.note.trim() || undefined,
      origin_account_id: originAccountId,
      origin_method_id: originMethodId,
      origin_currency: transferForm.origin_currency,
      origin_amount: originAmount,
      destination_account_id: destinationAccountId,
      destination_method_id: destinationMethodId,
      destination_currency: sameCurrency
        ? transferForm.origin_currency
        : transferForm.destination_currency,
      destination_amount: destinationAmount,
      fx_rate: sameCurrency ? undefined : parseOptionalNumber(transferForm.fx_rate),
      fee_amount: addFee ? parseOptionalNumber(transferForm.fee_amount) : undefined,
      fee_currency: addFee ? transferForm.fee_currency : undefined,
      fee_account_id: addFee
        ? parseOptionalInt(transferForm.fee_account_id)
        : undefined,
      fee_method_id: addFee
        ? parseOptionalInt(transferForm.fee_method_id)
        : undefined,
      fee_note: addFee ? transferForm.fee_note.trim() || undefined : undefined,
    };

    setSavingTransfer(true);
    try {
      const res = await authFetch(
        "/api/finance/transfers",
        { method: "POST", body: JSON.stringify(payload) },
        token,
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error || "No se pudo registrar el pase de saldo.");
      }

      toast.success("Pase de saldo registrado.");
      setTransferForm((prev) => ({
        ...prev,
        note: "",
        origin_amount: "",
        destination_amount: "",
        fx_rate: "",
        fee_amount: "",
        fee_note: "",
      }));
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar pase.");
    } finally {
      setSavingTransfer(false);
    }
  };

  const handleDeleteTransfer = async (id: number) => {
    if (!token) return;
    const reason = String(deleteReasonByTransfer[id] || "").trim();
    if (reason.length < 3) {
      toast.error("Ingresá un motivo (mínimo 3 caracteres).");
      return;
    }

    setDeletingTransferId(id);
    try {
      const res = await authFetch(
        `/api/finance/transfers/${id}`,
        { method: "DELETE", body: JSON.stringify({ reason }) },
        token,
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "No se pudo eliminar.");

      toast.success("Pase eliminado.");
      setDeleteReasonByTransfer((prev) => ({ ...prev, [id]: "" }));
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar.");
    } finally {
      setDeletingTransferId(null);
    }
  };

  const handlePreviewAudit = async () => {
    if (!token) return;
    const accountId = parseOptionalInt(auditForm.account_id);
    if (!accountId || !auditForm.currency) {
      toast.error("Elegí cuenta y moneda para calcular el saldo esperado.");
      return;
    }

    setPreviewLoading(true);
    setPreview(null);
    try {
      const qs = new URLSearchParams({
        preview: "1",
        account_id: String(accountId),
        currency: auditForm.currency,
        year: String(year),
        month: String(month),
      });
      const res = await authFetch(
        `/api/finance/account-audits?${qs.toString()}`,
        { cache: "no-store" },
        token,
      );
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        preview?: AuditPreview;
      } | null;
      if (!res.ok) throw new Error(body?.error || "No se pudo calcular.");
      setPreview(body?.preview ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al calcular.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveAudit = async () => {
    if (!token) return;
    const accountId = parseOptionalInt(auditForm.account_id);
    const actual = parseOptionalNumber(auditForm.actual_balance);
    if (!accountId || actual == null) {
      toast.error("Completá cuenta y saldo real.");
      return;
    }

    setSavingAudit(true);
    try {
      const res = await authFetch(
        "/api/finance/account-audits",
        {
          method: "POST",
          body: JSON.stringify({
            account_id: accountId,
            currency: auditForm.currency,
            year,
            month,
            actual_balance: actual,
            note: auditForm.note.trim() || undefined,
            create_adjustment: auditForm.create_adjustment,
            adjustment_reason: auditForm.adjustment_reason.trim() || undefined,
          }),
        },
        token,
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "No se pudo registrar auditoría.");

      toast.success("Auditoría registrada.");
      setAuditForm((prev) => ({
        ...prev,
        actual_balance: "",
        note: "",
        create_adjustment: false,
        adjustment_reason: "",
      }));
      setPreview(null);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar auditoría.");
    } finally {
      setSavingAudit(false);
    }
  };

  const handleLockAction = async (action: "lock" | "unlock") => {
    if (!token) return;
    setSavingLock(true);
    try {
      const res = await authFetch(
        "/api/finance/month-locks",
        {
          method: "POST",
          body: JSON.stringify({
            year,
            month,
            action,
            reason: lockReason.trim() || undefined,
          }),
        },
        token,
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "No se pudo actualizar el mes.");

      toast.success(action === "lock" ? "Mes bloqueado." : "Mes desbloqueado.");
      setLockReason("");
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar mes.");
    } finally {
      setSavingLock(false);
    }
  };

  return (
    <ProtectedRoute>
      <section className="text-sky-950 dark:text-white">
        <ToastContainer position="top-right" autoClose={3500} theme="dark" />

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Pases de saldo</h1>
            <p className="text-sm opacity-75">
              Registrá movimientos internos entre caja, bancos y wallets propias.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
              className="w-24 rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              className={BTN_SKY}
              onClick={() => void loadData()}
              disabled={refreshing || loading}
            >
              {refreshing ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-5">
            <div className={`${GLASS} p-4`}>
              <h2 className="text-base font-semibold">Ruta sugerida</h2>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                <li>
                  Cargá cuentas y métodos en{" "}
                  <Link className="underline" href="/finance/config?tab=accounts">
                    Configuración financiera
                  </Link>{" "}
                  (pestañas <b>Cuentas</b> y <b>Métodos</b>).
                </li>
                <li>Registrá el pase de saldo en esta pantalla.</li>
                <li>Auditá saldo real vs esperado al cierre del mes.</li>
                <li>Bloqueá el mes cuando esté conciliado.</li>
              </ol>
              <p className="mt-2 text-xs opacity-75">
                Las cuentas no se crean acá: se administran en Configuración de
                finanzas.
              </p>
            </div>

            {isLocked && (
              <div className={`${GLASS} border-rose-300/50 p-4`}>
                <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                  Mes bloqueado
                </p>
                <p className="text-xs text-rose-700/90 dark:text-rose-200/90">
                  Este período está cerrado. Para cargar o editar movimientos,
                  desbloquealo en el paso de bloqueo mensual.
                </p>
              </div>
            )}

            <div className={`${GLASS} p-4`}>
              <SectionToggle
                title="1) Registrar pase de saldo"
                description="Formulario simple, con opciones avanzadas opcionales."
                open={openTransfer}
                onToggle={() => setOpenTransfer((v) => !v)}
              />
              {openTransfer && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs opacity-70">Fecha</label>
                      <input
                        type="date"
                        value={transferForm.transfer_date}
                        onChange={(e) =>
                          setTransferForm((prev) => ({
                            ...prev,
                            transfer_date: e.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                        disabled={isLocked}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs opacity-70">Detalle / motivo</label>
                      <input
                        value={transferForm.note}
                        onChange={(e) =>
                          setTransferForm((prev) => ({ ...prev, note: e.target.value }))
                        }
                        placeholder="Ej: depósito de efectivo en banco"
                        className="w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                        disabled={isLocked}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/20 bg-white/5 px-3 py-2">
                    <Switch
                      checked={sameCurrency}
                      onChange={setSameCurrency}
                      label="Misma moneda (pase simple)"
                      disabled={isLocked}
                    />
                    <Switch
                      checked={addFee}
                      onChange={setAddFee}
                      label="Agregar comisión / costo"
                      disabled={isLocked}
                    />
                    <Switch
                      checked={useMethods}
                      onChange={setUseMethods}
                      label="Usar método de pago"
                      disabled={isLocked}
                    />
                    <Switch
                      checked={showAdvanced}
                      onChange={setShowAdvanced}
                      label="Ver campos avanzados"
                      disabled={isLocked}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/20 p-3">
                      <h3 className="mb-2 text-sm font-semibold">Origen (sale)</h3>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <select
                          value={transferForm.origin_account_id}
                          onChange={(e) =>
                            setTransferForm((prev) => ({
                              ...prev,
                              origin_account_id: e.target.value,
                            }))
                          }
                          className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                          disabled={isLocked}
                        >
                          <option value="">Cuenta…</option>
                          {accounts.map((a) => (
                            <option key={a.id_account} value={a.id_account}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        {useMethods && (
                          <select
                            value={transferForm.origin_method_id}
                            onChange={(e) =>
                              setTransferForm((prev) => ({
                                ...prev,
                                origin_method_id: e.target.value,
                              }))
                            }
                            className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                            disabled={isLocked}
                          >
                            <option value="">Método…</option>
                            {methods.map((m) => (
                              <option key={m.id_method} value={m.id_method}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <select
                          value={transferForm.origin_currency}
                          onChange={(e) =>
                            setTransferForm((prev) => ({
                              ...prev,
                              origin_currency: e.target.value,
                            }))
                          }
                          className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                          disabled={isLocked}
                        >
                          {currencyOptions.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                        </select>
                        <input
                          value={transferForm.origin_amount}
                          onChange={(e) =>
                            setTransferForm((prev) => ({
                              ...prev,
                              origin_amount: e.target.value,
                            }))
                          }
                          className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                          placeholder="Monto"
                          disabled={isLocked}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/20 p-3">
                      <h3 className="mb-2 text-sm font-semibold">Destino (entra)</h3>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <select
                          value={transferForm.destination_account_id}
                          onChange={(e) =>
                            setTransferForm((prev) => ({
                              ...prev,
                              destination_account_id: e.target.value,
                            }))
                          }
                          className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                          disabled={isLocked}
                        >
                          <option value="">Cuenta…</option>
                          {accounts.map((a) => (
                            <option key={a.id_account} value={a.id_account}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        {useMethods && (
                          <select
                            value={transferForm.destination_method_id}
                            onChange={(e) =>
                              setTransferForm((prev) => ({
                                ...prev,
                                destination_method_id: e.target.value,
                              }))
                            }
                            className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                            disabled={isLocked}
                          >
                            <option value="">Método…</option>
                            {methods.map((m) => (
                              <option key={m.id_method} value={m.id_method}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {sameCurrency ? (
                          <div className="rounded-2xl border border-white/30 bg-white/5 px-3 py-2 text-sm">
                            Moneda: {transferForm.origin_currency}
                          </div>
                        ) : (
                          <select
                            value={transferForm.destination_currency}
                            onChange={(e) =>
                              setTransferForm((prev) => ({
                                ...prev,
                                destination_currency: e.target.value,
                              }))
                            }
                            className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                            disabled={isLocked}
                          >
                            {currencyOptions.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code}
                              </option>
                            ))}
                          </select>
                        )}
                        {sameCurrency ? (
                          <div className="rounded-2xl border border-white/30 bg-white/5 px-3 py-2 text-sm">
                            Monto: {transferForm.origin_amount || "0"}
                          </div>
                        ) : (
                          <input
                            value={transferForm.destination_amount}
                            onChange={(e) =>
                              setTransferForm((prev) => ({
                                ...prev,
                                destination_amount: e.target.value,
                              }))
                            }
                            className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                            placeholder="Monto destino"
                            disabled={isLocked}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {!sameCurrency && (
                    <div className="max-w-sm">
                      <label className="mb-1 block text-xs opacity-70">
                        Tipo de cambio (opcional)
                      </label>
                      <input
                        value={transferForm.fx_rate}
                        onChange={(e) =>
                          setTransferForm((prev) => ({ ...prev, fx_rate: e.target.value }))
                        }
                        placeholder="Ej: 1234.50"
                        className="w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                        disabled={isLocked}
                      />
                    </div>
                  )}

                  {addFee && (
                    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-white/20 p-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs opacity-70">Comisión</label>
                        <input
                          value={transferForm.fee_amount}
                          onChange={(e) =>
                            setTransferForm((prev) => ({ ...prev, fee_amount: e.target.value }))
                          }
                          placeholder="Monto"
                          className="w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                          disabled={isLocked}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs opacity-70">Moneda comisión</label>
                        <select
                          value={transferForm.fee_currency}
                          onChange={(e) =>
                            setTransferForm((prev) => ({ ...prev, fee_currency: e.target.value }))
                          }
                          className="w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                          disabled={isLocked}
                        >
                          {currencyOptions.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs opacity-70">Cuenta comisión</label>
                        <select
                          value={transferForm.fee_account_id}
                          onChange={(e) =>
                            setTransferForm((prev) => ({ ...prev, fee_account_id: e.target.value }))
                          }
                          className="w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                          disabled={isLocked}
                        >
                          <option value="">Sin cuenta</option>
                          {accounts.map((a) => (
                            <option key={a.id_account} value={a.id_account}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {useMethods && (
                        <div>
                          <label className="mb-1 block text-xs opacity-70">Método comisión</label>
                          <select
                            value={transferForm.fee_method_id}
                            onChange={(e) =>
                              setTransferForm((prev) => ({ ...prev, fee_method_id: e.target.value }))
                            }
                            className="w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                            disabled={isLocked}
                          >
                            <option value="">Sin método</option>
                            {methods.map((m) => (
                              <option key={m.id_method} value={m.id_method}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {showAdvanced && (
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs opacity-70">Nota comisión</label>
                          <input
                            value={transferForm.fee_note}
                            onChange={(e) =>
                              setTransferForm((prev) => ({ ...prev, fee_note: e.target.value }))
                            }
                            className="w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                            placeholder="Ej: comisión bancaria"
                            disabled={isLocked}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      className={BTN_EMERALD}
                      disabled={savingTransfer || isLocked}
                      onClick={() => void handleSaveTransfer()}
                    >
                      {savingTransfer ? "Guardando..." : "Registrar pase"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className={`${GLASS} p-4`}>
              <SectionToggle
                title="2) Auditoría de saldo mensual"
                description="Compará saldo esperado vs saldo real y ajustá si hace falta."
                open={openAudit}
                onToggle={() => setOpenAudit((v) => !v)}
              />
              {openAudit && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <select
                      value={auditForm.account_id}
                      onChange={(e) =>
                        setAuditForm((prev) => ({ ...prev, account_id: e.target.value }))
                      }
                      className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                      disabled={isLocked}
                    >
                      <option value="">Cuenta…</option>
                      {accounts.map((a) => (
                        <option key={a.id_account} value={a.id_account}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={auditForm.currency}
                      onChange={(e) =>
                        setAuditForm((prev) => ({ ...prev, currency: e.target.value }))
                      }
                      className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                      disabled={isLocked}
                    >
                      {currencyOptions.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                    <input
                      value={auditForm.actual_balance}
                      onChange={(e) =>
                        setAuditForm((prev) => ({
                          ...prev,
                          actual_balance: e.target.value,
                        }))
                      }
                      className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                      placeholder="Saldo real"
                      disabled={isLocked}
                    />
                    <button
                      type="button"
                      className={BTN_SKY}
                      onClick={() => void handlePreviewAudit()}
                      disabled={previewLoading || isLocked}
                    >
                      {previewLoading ? "Calculando..." : "Calcular esperado"}
                    </button>
                  </div>

                  {preview && (
                    <div className="rounded-2xl border border-white/20 bg-white/5 p-3 text-sm">
                      <p>
                        Esperado:{" "}
                        <b>{formatAmount(preview.expected_balance, preview.currency)}</b>
                      </p>
                      <p>
                        Saldo base:{" "}
                        <b>{formatAmount(preview.opening_amount, preview.currency)}</b>{" "}
                        ({preview.opening_date ? formatDate(preview.opening_date) : "sin base"})
                      </p>
                      {parseOptionalNumber(auditForm.actual_balance) != null && (
                        <p>
                          Diferencia estimada:{" "}
                          <b>
                            {formatAmount(
                              (parseOptionalNumber(auditForm.actual_balance) || 0) -
                                preview.expected_balance,
                              preview.currency,
                            )}
                          </b>
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input
                      value={auditForm.note}
                      onChange={(e) =>
                        setAuditForm((prev) => ({ ...prev, note: e.target.value }))
                      }
                      className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none md:col-span-2"
                      placeholder="Nota / contexto de auditoría"
                      disabled={isLocked}
                    />
                    <label className="flex items-center gap-2 rounded-2xl border border-white/30 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={auditForm.create_adjustment}
                        onChange={(e) =>
                          setAuditForm((prev) => ({
                            ...prev,
                            create_adjustment: e.target.checked,
                          }))
                        }
                        disabled={isLocked}
                      />
                      Crear ajuste de saldo
                    </label>
                  </div>

                  {auditForm.create_adjustment && (
                    <input
                      value={auditForm.adjustment_reason}
                      onChange={(e) =>
                        setAuditForm((prev) => ({
                          ...prev,
                          adjustment_reason: e.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                      placeholder="Motivo del ajuste (opcional)"
                      disabled={isLocked}
                    />
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      className={BTN_EMERALD}
                      disabled={savingAudit || isLocked}
                      onClick={() => void handleSaveAudit()}
                    >
                      {savingAudit ? "Guardando..." : "Registrar auditoría"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className={`${GLASS} p-4`}>
              <SectionToggle
                title="3) Bloqueo mensual"
                description="Cerrá o reabrí el mes manualmente."
                open={openLock}
                onToggle={() => setOpenLock((v) => !v)}
              />
              {openLock && (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        isLocked
                          ? "bg-rose-500/15 text-rose-800 dark:bg-rose-500/25 dark:text-rose-100"
                          : "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-100"
                      }`}
                    >
                      {isLocked ? "Mes bloqueado" : "Mes abierto"}
                    </span>
                    <span className="text-xs opacity-75">
                      Período: {String(month).padStart(2, "0")}/{year}
                    </span>
                  </div>

                  <input
                    value={lockReason}
                    onChange={(e) => setLockReason(e.target.value)}
                    className="w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm outline-none"
                    placeholder="Motivo de bloqueo/desbloqueo"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={BTN_DANGER}
                      disabled={savingLock || isLocked}
                      onClick={() => void handleLockAction("lock")}
                    >
                      Bloquear mes
                    </button>
                    <button
                      type="button"
                      className={BTN_EMERALD}
                      disabled={savingLock || !isLocked}
                      onClick={() => void handleLockAction("unlock")}
                    >
                      Desbloquear mes
                    </button>
                  </div>

                  <div className="space-y-1 text-xs opacity-80">
                    {lockEvents.slice(0, 6).map((e) => (
                      <p key={e.id_event}>
                        {formatDate(e.acted_at)} • {e.action.toUpperCase()} •{" "}
                        {e.reason || "Sin motivo"}
                      </p>
                    ))}
                    {lockEvents.length === 0 && (
                      <p className="opacity-70">Sin eventos para este período.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className={`${GLASS} p-4`}>
              <SectionToggle
                title="4) Historial del período"
                description="Pases, auditorías y ajustes del mes."
                open={openHistory}
                onToggle={() => setOpenHistory((v) => !v)}
              />
              {openHistory && (
                <div className="mt-4 space-y-4">
                  <details open className="rounded-2xl border border-white/20 p-3">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Pases de saldo ({transfers.length})
                    </summary>
                    <div className="mt-3 space-y-3">
                      {transfers.length === 0 ? (
                        <p className="text-sm opacity-70">No hay pases cargados.</p>
                      ) : (
                        transfers.map((t) => (
                          <article
                            key={t.id_transfer}
                            className="rounded-2xl border border-white/20 p-3"
                          >
                            <p className="text-sm font-semibold">
                              #{t.id_transfer} • {formatDate(t.transfer_date)}
                            </p>
                            <p className="mt-1 text-xs opacity-80">
                              {t.note || "Sin detalle"}
                            </p>
                            <p className="mt-1 text-xs">
                              Sale{" "}
                              <b>{formatAmount(t.origin_amount, t.origin_currency)}</b>{" "}
                              ({t.origin_account_name || "Sin cuenta"}) y entra{" "}
                              <b>
                                {formatAmount(
                                  t.destination_amount,
                                  t.destination_currency,
                                )}
                              </b>{" "}
                              ({t.destination_account_name || "Sin cuenta"}).
                            </p>
                            {t.fee_amount != null && t.fee_currency && (
                              <p className="text-xs">
                                Comisión:{" "}
                                <b>{formatAmount(t.fee_amount, t.fee_currency)}</b>
                              </p>
                            )}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <input
                                value={deleteReasonByTransfer[t.id_transfer] || ""}
                                onChange={(e) =>
                                  setDeleteReasonByTransfer((prev) => ({
                                    ...prev,
                                    [t.id_transfer]: e.target.value,
                                  }))
                                }
                                className="min-w-[260px] flex-1 rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-xs outline-none"
                                placeholder="Motivo para eliminar"
                                disabled={isLocked}
                              />
                              <button
                                type="button"
                                className={BTN_DANGER}
                                disabled={isLocked || deletingTransferId === t.id_transfer}
                                onClick={() => void handleDeleteTransfer(t.id_transfer)}
                              >
                                {deletingTransferId === t.id_transfer
                                  ? "Eliminando..."
                                  : "Eliminar"}
                              </button>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </details>

                  <details className="rounded-2xl border border-white/20 p-3">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Auditorías ({audits.length})
                    </summary>
                    <div className="mt-3 space-y-2">
                      {audits.length === 0 ? (
                        <p className="text-sm opacity-70">No hay auditorías.</p>
                      ) : (
                        audits.map((a) => (
                          <div
                            key={a.id_audit}
                            className="rounded-2xl border border-white/20 p-2 text-sm"
                          >
                            <p className="font-semibold">
                              {a.account_name || `Cuenta ${a.account_id}`} • {a.currency}
                            </p>
                            <p className="text-xs opacity-80">
                              Esperado {formatAmount(a.expected_balance, a.currency)} •
                              Real {formatAmount(a.actual_balance, a.currency)} •
                              Dif. {formatAmount(a.difference, a.currency)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </details>

                  <details className="rounded-2xl border border-white/20 p-3">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Ajustes ({adjustments.length})
                    </summary>
                    <div className="mt-3 space-y-2">
                      {adjustments.length === 0 ? (
                        <p className="text-sm opacity-70">No hay ajustes.</p>
                      ) : (
                        adjustments.map((a) => (
                          <div
                            key={a.id_adjustment}
                            className="rounded-2xl border border-white/20 p-2 text-sm"
                          >
                            <p className="font-semibold">
                              {a.account_name || `Cuenta ${a.account_id}`} • {a.currency}
                            </p>
                            <p className="text-xs opacity-80">
                              {formatAmount(a.amount, a.currency)} • {a.reason}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </details>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </ProtectedRoute>
  );
}
