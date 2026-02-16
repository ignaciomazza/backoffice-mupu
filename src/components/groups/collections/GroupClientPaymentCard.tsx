"use client";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Booking, ClientPayment } from "@/types";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/utils/authFetch";

interface Props {
  payment: ClientPayment;
  booking: Booking;
  groupId?: string;
  role: string;
  onPaymentDeleted?: (id: number) => void;
}

type ChipProps = {
  children: ReactNode;
  tone?: "neutral" | "success" | "warn" | "danger";
};

type StatProps = {
  label: string;
  value: string;
};

const Chip = ({ children, tone = "neutral" }: ChipProps) => {
  const palette =
    tone === "success"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/40"
      : tone === "warn"
      ? "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-800/40"
      : tone === "danger"
        ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800/40"
          : "bg-sky-50/60 text-slate-700 border-sky-200/70 dark:bg-slate-900/55 dark:text-slate-200 dark:border-sky-900/40";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium md:text-xs ${palette}`}
    >
      {children}
    </span>
  );
};

const Stat = ({ label, value }: StatProps) => (
  <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 px-3 py-2 dark:border-sky-900/40 dark:bg-slate-900/55">
    <p className="text-[11px] opacity-70 md:text-xs">{label}</p>
    <p className="text-sm font-medium tabular-nums md:text-base">{value}</p>
  </div>
);

const pad2 = (n: number) => String(n).padStart(2, "0");

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const dateKeyFrom = (d?: string | Date | null): string | null => {
  if (!d) return null;
  if (d instanceof Date) {
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
  }
  const raw = String(d).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt.toISOString().slice(0, 10) : null;
};

const formatDateKey = (key: string | null): string => {
  if (!key) return "–";
  const dt = new Date(`${key}T00:00:00.000Z`);
  return dt.toLocaleDateString("es-AR", { timeZone: "UTC" });
};

const normalizeStatus = (status?: string) => {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "PAGADA") return "PAGADA";
  if (normalized === "CANCELADA") return "CANCELADA";
  return "PENDIENTE";
};

export default function GroupClientPaymentCard({
  payment,
  booking,
  groupId,
  role,
  onPaymentDeleted,
}: Props) {
  const [loadingDelete, setLoadingDelete] = useState(false);
  const { token } = useAuth();

  const fmtMoney = useCallback((v?: number | string | null, curr?: string) => {
    const n =
      typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
    const c = (curr || "ARS").toUpperCase();
    const safe = Number.isFinite(n) ? n : 0;
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: c,
        minimumFractionDigits: 2,
      }).format(safe);
    } catch {
      return `${safe.toFixed(2)} ${c}`;
    }
  }, []);

  const dueKey = useMemo(
    () => dateKeyFrom(payment?.due_date),
    [payment?.due_date],
  );

  const createdKey = useMemo(
    () => dateKeyFrom(payment?.created_at),
    [payment?.created_at],
  );

  const isOverdue = useMemo(() => {
    if (!dueKey) return false;
    if (normalizeStatus(payment?.status) !== "PENDIENTE") return false;
    return dueKey < todayKey();
  }, [dueKey, payment?.status]);

  const isDueToday = useMemo(() => {
    if (!dueKey) return false;
    if (normalizeStatus(payment?.status) !== "PENDIENTE") return false;
    return dueKey === todayKey();
  }, [dueKey, payment?.status]);

  const dueLabel = useMemo(() => formatDateKey(dueKey), [dueKey]);
  const createdLabel = useMemo(
    () => formatDateKey(createdKey),
    [createdKey],
  );

  const clientName = useMemo(() => {
    const fromPayment = payment?.client;
    if (fromPayment) {
      const full = `${fromPayment.first_name ?? ""} ${fromPayment.last_name ?? ""}`.trim();
      const num = fromPayment.agency_client_id ?? fromPayment.id_client;
      if (full) return `${full} · N° ${num}`;
    }
    if (!payment?.client_id) return "—";
    const tid = booking.titular?.id_client;
    const tnum =
      booking.titular?.agency_client_id ?? booking.titular?.id_client ?? tid;
    if (payment.client_id === tid) {
      return `${booking.titular.first_name} ${booking.titular.last_name} · N° ${tnum}`;
    }
    const found = booking.clients?.find(
      (c) => c.id_client === payment.client_id,
    );
    return found
      ? `${found.first_name} ${found.last_name} · N° ${
          found.agency_client_id ?? found.id_client
        }`
      : `N° ${payment.client_id}`;
  }, [
    payment?.client,
    payment?.client_id,
    booking.titular,
    booking.clients,
  ]);

  const currencyCode = useMemo(
    () => (payment?.currency || "ARS").toUpperCase(),
    [payment?.currency],
  );

  const persistedStatus = useMemo(
    () => normalizeStatus(payment?.status),
    [payment?.status],
  );

  const derivedStatus = useMemo(() => {
    const rawDerived = String(payment?.derived_status || "")
      .trim()
      .toUpperCase();
    if (rawDerived === "VENCIDA") return "VENCIDA";
    if (rawDerived === "PAGADA") return "PAGADA";
    if (rawDerived === "CANCELADA") return "CANCELADA";
    if (persistedStatus === "PAGADA") return "PAGADA";
    if (persistedStatus === "CANCELADA") return "CANCELADA";
    return isOverdue ? "VENCIDA" : "PENDIENTE";
  }, [payment?.derived_status, persistedStatus, isOverdue]);

  const statusBadge = useMemo(() => {
    if (derivedStatus === "PAGADA") {
      return {
        label: "Pagada",
        tone: "success" as const,
      };
    }
    if (derivedStatus === "CANCELADA") {
      return {
        label: "Cancelada",
        tone: "neutral" as const,
      };
    }
    if (derivedStatus === "VENCIDA") {
      return {
        label: "Vencida",
        tone: "danger" as const,
      };
    }
    if (!dueKey) {
      return {
        label: "Pendiente",
        tone: "warn" as const,
      };
    }
    if (isDueToday) {
      return {
        label: "Vence hoy",
        tone: "warn" as const,
      };
    }
    return {
      label: "Pendiente",
      tone: "warn" as const,
    };
  }, [derivedStatus, dueKey, isDueToday]);

  if (typeof payment?.id_payment !== "number") {
    return (
      <div className="flex h-40 items-center justify-center dark:text-slate-100">
        <Spinner />
      </div>
    );
  }

  const deletePayment = async () => {
    if (!confirm("¿Seguro querés eliminar este pago?")) return;
    if (!token) {
      toast.error("Sesión expirada. Volvé a iniciar sesión.");
      return;
    }
    setLoadingDelete(true);
    try {
      const endpoint = groupId
        ? `/api/groups/${encodeURIComponent(groupId)}/finance/client-payments/${payment.id_payment}`
        : `/api/client-payments/${payment.id_payment}`;
      const res = await authFetch(
        endpoint,
        { method: "DELETE" },
        token,
      );
      if (!res.ok && res.status !== 204) throw new Error();
      toast.success("Pago eliminado.");
      onPaymentDeleted?.(payment.id_payment);
    } catch {
      toast.error("No se pudo eliminar el pago.");
    } finally {
      setLoadingDelete(false);
    }
  };

  const paymentNumber =
    payment.agency_client_payment_id ?? payment.id_payment;

  return (
    <div className="h-fit space-y-6 overflow-hidden rounded-2xl border border-sky-200/80 bg-white/75 p-5 text-slate-900 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-100">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:text-xs">
            Pago N° {paymentNumber}
          </p>
          <p className="mt-2 text-xl font-semibold md:text-2xl">
            {fmtMoney(payment.amount, payment.currency)}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 md:text-sm">
            {clientName}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-[11px] md:text-xs">
          <Chip tone={statusBadge.tone}>{statusBadge.label}</Chip>
          <time className="text-slate-500 dark:text-slate-400">
            Creado {createdLabel}
          </time>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 text-[13px] md:text-sm">
        <Stat label="Vence" value={dueLabel} />
        <Stat label="Moneda" value={currencyCode} />
      </div>

      {(payment.service || payment.receipt || payment.paid_at) && (
        <div className="space-y-1 rounded-xl border border-sky-200/70 bg-sky-50/40 p-3 text-[11px] leading-relaxed dark:border-sky-900/40 dark:bg-slate-900/55 md:text-xs">
          {payment.service && (
            <p>
              Servicio: {payment.service.description || payment.service.type || "—"}
            </p>
          )}
          {payment.receipt && (
            <p>Recibo: {payment.receipt.receipt_number || payment.receipt.id_receipt}</p>
          )}
          {payment.paid_at && (
            <p>
              Pagada:{" "}
              {new Date(payment.paid_at).toLocaleDateString("es-AR", {
                timeZone: "UTC",
              })}
            </p>
          )}
        </div>
      )}

      <footer className="flex justify-end">
        {(role === "administrativo" ||
          role === "desarrollador" ||
          role === "gerente") &&
          persistedStatus !== "PAGADA" && (
          <button
            onClick={deletePayment}
            disabled={loadingDelete}
            className="rounded-full border border-amber-300/80 bg-amber-100/90 px-4 py-2 text-center text-[13px] text-amber-800 shadow-sm shadow-amber-900/20 transition-transform hover:scale-95 active:scale-90 disabled:opacity-60 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200 md:text-sm"
            title="Eliminar pago"
          >
            {loadingDelete ? (
              <Spinner />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
            )}
          </button>
        )}
      </footer>
    </div>
  );
}
