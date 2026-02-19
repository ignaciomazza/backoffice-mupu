import { useMemo } from "react";
import { Booking, Operator, OperatorDue } from "@/types";
import Spinner from "@/components/Spinner";
import GroupOperatorDueCard from "@/components/groups/payments/GroupOperatorDueCard";
import {
  formatDateInBuenosAires,
  toDateKeyInBuenosAires,
  todayDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";

interface Props {
  dues: OperatorDue[] | undefined;
  booking: Booking;
  groupId?: string;
  role: string;
  onDueDeleted?: (id: number) => void;
  onStatusChanged?: (id: number, status: OperatorDue["status"]) => void;
  loading?: boolean; // nuevo flag
  operators: Operator[];
}

const normalizeStatus = (status?: string) => {
  const normalized = (status || "").trim().toUpperCase();
  if (normalized === "PAGO" || normalized === "PAGADA") return "PAGADA";
  if (normalized === "CANCELADA" || normalized === "CANCELADO")
    return "CANCELADA";
  return "PENDIENTE";
};

const toAmount = (value: number | string | null | undefined): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const normalizeCurrency = (code?: string | null): string => {
  const c = String(code || "ARS").trim().toUpperCase();
  return c || "ARS";
};

const formatMoney = (value: number, currency: string): string => {
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
};

const todayKey = () => todayDateKeyInBuenosAires();

const dateKeyFrom = (d?: string | Date | null): string | null =>
  toDateKeyInBuenosAires(d ?? null);

const formatDateKey = (key: string | null): string =>
  key ? formatDateInBuenosAires(key) : "-";

export default function GroupOperatorDueList({
  dues,
  booking,
  groupId,
  role,
  onDueDeleted,
  onStatusChanged,
  loading = false,
  operators,
}: Props) {
  const validDues = useMemo(
    () =>
      (dues ?? []).filter((d) => d && typeof d.id_due === "number"),
    [dues],
  );

  const totalsByCurrency = useMemo(() => {
    const acc = new Map<string, number>();
    for (const due of validDues) {
      const cur = normalizeCurrency(due.currency);
      const amount = toAmount(due.amount);
      acc.set(cur, (acc.get(cur) ?? 0) + amount);
    }
    return Array.from(acc.entries());
  }, [validDues]);

  const statusCounts = useMemo(() => {
    return validDues.reduce(
      (acc, due) => {
        const status = normalizeStatus(due.status);
        if (status === "PAGADA") acc.paid += 1;
        else if (status === "CANCELADA") acc.cancelled += 1;
        else acc.pending += 1;
        acc.total += 1;
        return acc;
      },
      { total: 0, pending: 0, paid: 0, cancelled: 0 },
    );
  }, [validDues]);

  const overdueCount = useMemo(() => {
    const today = todayKey();
    return validDues.reduce((count, due) => {
      const dueKey = dateKeyFrom(due.due_date);
      if (!dueKey) return count;
      if (dueKey < today && normalizeStatus(due.status) === "PENDIENTE") {
        return count + 1;
      }
      return count;
    }, 0);
  }, [validDues]);

  const nextDueKey = useMemo(() => {
    const today = todayKey();
    const keys = validDues
      .filter((due) => normalizeStatus(due.status) === "PENDIENTE")
      .map((due) => dateKeyFrom(due.due_date))
      .filter((key): key is string => !!key)
      .sort();
    const upcoming = keys.find((key) => key >= today);
    return upcoming ?? keys[0] ?? null;
  }, [validDues]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (validDues.length === 0) {
    return (
      <div className="rounded-2xl border border-sky-200/80 bg-white/75 p-5 text-center text-[13px] text-slate-700 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-300 md:text-sm">
        No hay vencimientos registrados
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {validDues.map((due) => (
          <GroupOperatorDueCard
            key={due.id_due}
            due={due}
            booking={booking}
            groupId={groupId}
            operators={operators}
            role={role}
            onDueDeleted={onDueDeleted}
            onStatusChanged={onStatusChanged}
          />
        ))}
      </div>

      <div className="space-y-4 border-t border-sky-200/70 pt-6 dark:border-sky-900/40">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 md:text-sm">
          Resumen de vencimientos
        </p>
        <div className="rounded-2xl border border-sky-200/80 bg-white/75 p-5 text-slate-700 shadow-sm shadow-sky-100/40 dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-300">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 p-3 dark:border-sky-900/40 dark:bg-slate-900/55">
              <p className="text-[11px] opacity-70 md:text-xs">Vencimientos</p>
              <p className="text-sm font-medium tabular-nums md:text-base">
                {statusCounts.total}
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
              <p className="text-[11px] opacity-70 md:text-xs">Vencidas</p>
              <p className="text-sm font-medium tabular-nums md:text-base">
                {overdueCount}
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
            {nextDueKey && (
              <span className="rounded-full border border-sky-200/70 bg-sky-50/45 px-3 py-1 text-[11px] font-medium dark:border-sky-900/40 dark:bg-slate-900/55 md:text-xs">
                Proximo vencimiento: {formatDateKey(nextDueKey)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
