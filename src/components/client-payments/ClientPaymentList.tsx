// src/components/client-payments/ClientPaymentList.tsx
"use client";

import { useMemo } from "react";
import { Booking, ClientPayment } from "@/types";
import Spinner from "@/components/Spinner";
import ClientPaymentCard from "./ClientPaymentCard";

interface Props {
  payments: ClientPayment[] | undefined;
  booking: Booking;
  role: string;
  onPaymentDeleted?: (id: number) => void;
  loading?: boolean;
}

function normalizeCurrency(code?: string | null): string {
  const c = String(code || "ARS").trim().toUpperCase();
  return c || "ARS";
}

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

export default function ClientPaymentList({
  payments,
  booking,
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
      const dueKey = dateKeyFrom(payment.due_date);
      if (!dueKey) return count;
      return dueKey < today ? count + 1 : count;
    }, 0);
  }, [validPayments]);

  const nextDueKey = useMemo(() => {
    const today = todayKey();
    const keys = validPayments
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
      <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-center shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10">
        No hay pagos registrados
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {validPayments.map((payment) => (
          <ClientPaymentCard
            key={payment.id_payment}
            payment={payment}
            booking={booking}
            role={role}
            onPaymentDeleted={onPaymentDeleted}
          />
        ))}
      </div>

      <div>
        <div className="mb-4 mt-8 flex justify-center">
          <p className="text-2xl font-medium">Resumen</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md shadow-sky-950/10 dark:text-white">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs opacity-70">Pagos</p>
              <p className="text-base font-medium tabular-nums">
                {validPayments.length}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs opacity-70">Vencidos</p>
              <p className="text-base font-medium tabular-nums">
                {overdueCount}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs opacity-70">Proximo vencimiento</p>
              <p className="text-base font-medium tabular-nums">
                {nextDueKey ? formatDateKey(nextDueKey) : "—"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {totalsByCurrency.map(([cur, total]) => (
              <span
                key={cur}
                className="rounded-full bg-white/30 px-3 py-1 text-xs font-medium dark:bg-white/10"
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
