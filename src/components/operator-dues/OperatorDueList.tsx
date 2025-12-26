import { useMemo } from "react";
import { Booking, Operator, OperatorDue } from "@/types";
import Spinner from "@/components/Spinner";
import OperatorDueCard from "@/components/operator-dues/OperatorDueCard";

interface Props {
  dues: OperatorDue[] | undefined;
  booking: Booking;
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
  if (!key) return "-";
  const dt = new Date(`${key}T00:00:00.000Z`);
  return dt.toLocaleDateString("es-AR", { timeZone: "UTC" });
};

export default function OperatorDueList({
  dues,
  booking,
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
      <div className="rounded-3xl border border-white/10 bg-white/10 p-6 text-center shadow-md backdrop-blur dark:border-white/10 dark:bg-white/10">
        No hay vencimientos registrados
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {validDues.map((due) => (
          <OperatorDueCard
            key={due.id_due}
            due={due}
            booking={booking}
            operators={operators}
            role={role}
            onDueDeleted={onDueDeleted}
            onStatusChanged={onStatusChanged}
          />
        ))}
      </div>

      <div>
        <div className="mb-4 mt-8 flex justify-center">
          <p className="text-2xl font-medium">Resumen</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-sky-950 shadow-md shadow-sky-950/10 dark:text-white">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs opacity-70">Vencimientos</p>
              <p className="text-base font-medium tabular-nums">
                {statusCounts.total}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs opacity-70">Pendientes</p>
              <p className="text-base font-medium tabular-nums">
                {statusCounts.pending}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs opacity-70">Pagadas</p>
              <p className="text-base font-medium tabular-nums">
                {statusCounts.paid}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs opacity-70">Vencidas</p>
              <p className="text-base font-medium tabular-nums">
                {overdueCount}
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
            {nextDueKey && (
              <span className="rounded-full bg-white/30 px-3 py-1 text-xs font-medium dark:bg-white/10">
                Proximo vencimiento: {formatDateKey(nextDueKey)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
