// src/components/groups/collections/GroupClientPaymentList.tsx
"use client";

import { useMemo } from "react";
import { Booking, ClientPayment } from "@/types";
import Spinner from "@/components/Spinner";
import GroupClientPaymentCard from "@/components/groups/collections/GroupClientPaymentCard";
import {
  formatDateInBuenosAires,
  toDateKeyInBuenosAiresLegacySafe,
  todayDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";

interface Props {
  payments: ClientPayment[] | undefined;
  booking: Booking;
  groupId?: string;
  role: string;
  onPaymentDeleted?: (id: number) => void;
  loading?: boolean;
}

function normalizeCurrency(code?: string | null): string {
  const c = String(code || "ARS").trim().toUpperCase();
  return c || "ARS";
}

const todayKey = () => todayDateKeyInBuenosAires();

const dateKeyFrom = (d?: string | Date | null): string | null =>
  toDateKeyInBuenosAiresLegacySafe(d ?? null);

const formatDateKey = (key: string | null): string =>
  key ? formatDateInBuenosAires(key) : "–";

function toAmount(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function formatMoney(value: number, currency: string): string {
  const safe = Number.isFinite(value) ? value : 0;
  const code = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${safe.toFixed(2)} ${code}`;
  }
}

function normalizeStatus(status?: string): "PENDIENTE" | "PAGADA" | "CANCELADA" {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "PAGADA") return "PAGADA";
  if (normalized === "CANCELADA") return "CANCELADA";
  return "PENDIENTE";
}

export default function GroupClientPaymentList({
  payments,
  booking,
  groupId,
  role,
  onPaymentDeleted,
  loading = false,
}: Props) {
  const validPayments = useMemo(
    () =>
      (payments ?? []).filter(
        (p) => p && typeof p.id_payment === "number",
      ),
    [payments],
  );

  const totalsByCurrency = useMemo(() => {
    const acc = new Map<string, number>();
    for (const payment of validPayments) {
      const cur = normalizeCurrency(payment.currency);
      const amount = toAmount(payment.amount);
      acc.set(cur, (acc.get(cur) ?? 0) + amount);
    }
    return Array.from(acc.entries());
  }, [validPayments]);

  const overdueCount = useMemo(() => {
    const today = todayKey();
    return validPayments.reduce((count, payment) => {
      if (normalizeStatus(payment.status) !== "PENDIENTE") return count;
      const dueKey = dateKeyFrom(payment.due_date);
      if (!dueKey) return count;
      return dueKey < today ? count + 1 : count;
    }, 0);
  }, [validPayments]);

  const statusCounts = useMemo(() => {
    return validPayments.reduce(
      (acc, payment) => {
        const status = normalizeStatus(payment.status);
        if (status === "PAGADA") acc.paid += 1;
        else if (status === "CANCELADA") acc.cancelled += 1;
        else acc.pending += 1;
        return acc;
      },
      { pending: 0, paid: 0, cancelled: 0 },
    );
  }, [validPayments]);

  const nextDueKey = useMemo(() => {
    const today = todayKey();
    const keys = validPayments
      .filter((payment) => normalizeStatus(payment.status) === "PENDIENTE")
      .map((payment) => dateKeyFrom(payment.due_date))
      .filter((key): key is string => !!key)
      .sort();
    const upcoming = keys.find((key) => key >= today);
    return upcoming ?? keys[0] ?? null;
  }, [validPayments]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (validPayments.length === 0) {
    return (
      <div className="rounded-2xl border border-sky-200/80 bg-white/75 p-5 text-center text-[13px] text-slate-700 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-300 md:text-sm">
        No hay pagos registrados
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {validPayments.map((payment) => (
          <GroupClientPaymentCard
            key={payment.id_payment}
            payment={payment}
            booking={booking}
            groupId={groupId}
            role={role}
            onPaymentDeleted={onPaymentDeleted}
          />
        ))}
      </div>

      <div className="space-y-4 border-t border-sky-200/70 pt-6 dark:border-sky-900/40">
        <div>
          <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 md:text-sm">
            Resumen de cuotas
          </p>
        </div>
        <div className="rounded-2xl border border-sky-200/80 bg-white/75 p-5 text-slate-700 shadow-sm shadow-sky-100/40 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-300">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 p-3 dark:border-sky-900/40 dark:bg-slate-900/55">
              <p className="text-[11px] opacity-70 md:text-xs">Cuotas</p>
              <p className="text-sm font-medium tabular-nums md:text-base">
                {validPayments.length}
              </p>
            </div>
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 p-3 dark:border-sky-900/40 dark:bg-slate-900/55">
              <p className="text-[11px] opacity-70 md:text-xs">Pendientes</p>
              <p className="text-sm font-medium tabular-nums md:text-base">
                {statusCounts.pending}
              </p>
            </div>
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 p-3 dark:border-sky-900/40 dark:bg-slate-900/55">
              <p className="text-[11px] opacity-70 md:text-xs">Pagadas</p>
              <p className="text-sm font-medium tabular-nums md:text-base">
                {statusCounts.paid}
              </p>
            </div>
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 p-3 dark:border-sky-900/40 dark:bg-slate-900/55">
              <p className="text-[11px] opacity-70 md:text-xs">Canceladas</p>
              <p className="text-sm font-medium tabular-nums md:text-base">
                {statusCounts.cancelled}
              </p>
            </div>
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 p-3 dark:border-sky-900/40 dark:bg-slate-900/55">
              <p className="text-[11px] opacity-70 md:text-xs">Vencidos</p>
              <p className="text-sm font-medium tabular-nums md:text-base">
                {overdueCount}
              </p>
            </div>
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 p-3 dark:border-sky-900/40 dark:bg-slate-900/55">
              <p className="text-[11px] opacity-70 md:text-xs">Proximo vencimiento</p>
              <p className="text-sm font-medium tabular-nums md:text-base">
                {nextDueKey ? formatDateKey(nextDueKey) : "—"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {totalsByCurrency.map(([cur, total]) => (
              <span
                key={cur}
                className="rounded-full border border-sky-200/70 bg-sky-50/45 px-3 py-1 text-[11px] font-medium dark:border-sky-900/40 dark:bg-slate-900/55 md:text-xs"
              >
                {formatMoney(total, cur)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
