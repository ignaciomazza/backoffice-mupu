"use client";
import { useMemo, useState, useCallback, type ReactNode } from "react";
import { Booking, Operator, OperatorDue, Service } from "@/types";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";
import {
  formatDateInBuenosAires,
  toDateKeyInBuenosAiresLegacySafe,
  todayDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";

type ServiceWithOperator = Service & {
  operator?: { id_operator: number; agency_operator_id?: number | null; name?: string };
};

function hasEmbeddedOperator(
  s: Service | ServiceWithOperator | undefined,
): s is ServiceWithOperator {
  return !!s && "operator" in s && typeof s.operator === "object";
}

type ServiceWithIdOperator = Service & { id_operator?: number };

function hasIdOperator(
  s: Service | ServiceWithOperator | undefined,
): s is Service & { id_operator: number } {
  return !!s && typeof (s as ServiceWithIdOperator).id_operator === "number";
}

function getServiceOperatorId(
  s: Service | ServiceWithOperator | undefined,
): number | undefined {
  if (!s) return undefined;
  if (hasEmbeddedOperator(s) && typeof s.operator?.id_operator === "number") {
    return s.operator.id_operator;
  }
  if (hasIdOperator(s)) {
    return (s as ServiceWithIdOperator).id_operator!;
  }
  return undefined;
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

const STATUS_OPTIONS = [
  { value: "PENDIENTE", label: "Pendiente", tone: "warn" },
  { value: "PAGADA", label: "Pagada", tone: "success" },
  { value: "CANCELADA", label: "Cancelada", tone: "neutral" },
] as const;

type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];

const normalizeStatus = (status?: string): StatusValue => {
  const normalized = (status || "").trim().toUpperCase();
  if (normalized === "PAGO" || normalized === "PAGADA") return "PAGADA";
  if (normalized === "CANCELADA" || normalized === "CANCELADO")
    return "CANCELADA";
  return "PENDIENTE";
};

const todayKey = () => todayDateKeyInBuenosAires();

const dateKeyFrom = (d?: string | Date | null): string | null =>
  toDateKeyInBuenosAiresLegacySafe(d ?? null);

const formatDateKey = (key: string | null): string =>
  key ? formatDateInBuenosAires(key) : "-";

interface Props {
  due: OperatorDue;
  booking: Booking;
  groupId?: string;
  role: string;
  onDueDeleted?: (id: number) => void;
  onStatusChanged?: (id: number, status: OperatorDue["status"]) => void;
  operators: Operator[];
}

export default function GroupOperatorDueCard({
  due,
  booking,
  groupId,
  role,
  onDueDeleted,
  onStatusChanged,
  operators,
}: Props) {
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [localStatus, setLocalStatus] = useState<StatusValue>(() =>
    normalizeStatus(due.status),
  );

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

  const service = useMemo(
    () => booking.services?.find((s) => s.id_service === due.service_id),
    [booking.services, due.service_id],
  );

  const serviceLabel = useMemo(() => {
    const serviceNumber = service?.agency_service_id ?? due.service_id;
    const parts = [`N° ${serviceNumber}`];
    if (service?.type) parts.push(service.type);
    if (service?.destination) parts.push(service.destination);
    return `Servicio ${parts.join(" · ")}`;
  }, [
    due.service_id,
    service?.agency_service_id,
    service?.type,
    service?.destination,
  ]);

  const operatorIndex = useMemo(() => {
    const map = new Map<number, { name?: string; displayId: number }>();
    for (const op of operators || []) {
      if (op && typeof op.id_operator === "number") {
        map.set(op.id_operator, {
          name: op.name,
          displayId: op.agency_operator_id ?? op.id_operator,
        });
      }
    }
    return map;
  }, [operators]);

  const operatorName = useMemo(() => {
    if (!service) return "Operador";
    if (hasEmbeddedOperator(service) && service.operator?.name?.trim()) {
      return service.operator.name!;
    }
    const operatorId = getServiceOperatorId(service);
    if (typeof operatorId !== "number") return "Operador";
    const entry = operatorIndex.get(operatorId);
    if (entry?.name?.trim()) return entry.name;
    return `Operador N° ${entry?.displayId ?? operatorId}`;
  }, [service, operatorIndex]);

  const statusMeta = useMemo(
    () => STATUS_OPTIONS.find((opt) => opt.value === localStatus),
    [localStatus],
  );

  const statusTone = statusMeta?.tone ?? "warn";
  const statusLabel = statusMeta?.label ?? localStatus;

  const dueKey = useMemo(
    () => dateKeyFrom(due?.due_date),
    [due?.due_date],
  );

  const createdKey = useMemo(
    () => dateKeyFrom(due?.created_at),
    [due?.created_at],
  );

  const dueLabel = useMemo(() => formatDateKey(dueKey), [dueKey]);
  const createdLabel = useMemo(
    () => formatDateKey(createdKey),
    [createdKey],
  );

  const isOverdue = useMemo(() => {
    if (!dueKey) return false;
    return dueKey < todayKey();
  }, [dueKey]);

  const showOverdue = isOverdue && localStatus === "PENDIENTE";

  const currencyCode = useMemo(
    () => (due?.currency || "ARS").toString().toUpperCase(),
    [due?.currency],
  );

  const canEdit =
    role === "administrativo" ||
    role === "desarrollador" ||
    role === "gerente";
  const dueEndpoint = groupId
    ? `/api/groups/${encodeURIComponent(groupId)}/finance/operator-dues/${due.id_due}`
    : `/api/operator-dues/${due.id_due}`;

  const deleteDue = async () => {
    if (!confirm("¿Seguro querés eliminar esta cuota al operador?")) return;
    setLoadingDelete(true);
    try {
      const res = await fetch(dueEndpoint, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error();
      toast.success("Cuota eliminada.");
      onDueDeleted?.(due.id_due);
    } catch {
      toast.error("No se pudo eliminar la cuota.");
    } finally {
      setLoadingDelete(false);
    }
  };

  const updateStatus = async (next: StatusValue) => {
    if (next === localStatus) return;
    setUpdatingStatus(true);
    const prev = localStatus;
    setLocalStatus(next);
    try {
      const res = await fetch(dueEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      toast.success("Estado actualizado.");
      onStatusChanged?.(due.id_due, next);
    } catch {
      setLocalStatus(prev);
      toast.error("No se pudo actualizar el estado.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="h-fit space-y-6 overflow-hidden rounded-2xl border border-sky-200/80 bg-white/75 p-5 text-slate-900 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-100">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:text-xs">
            Vencimiento N° {due.id_due}
          </p>
          <p className="mt-2 text-xl font-semibold md:text-2xl">
            {fmtMoney(due.amount, due.currency)}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 md:text-sm">
            {operatorName} · {serviceLabel}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-[11px] md:text-xs">
          <Chip tone={statusTone}>{statusLabel}</Chip>
          {showOverdue && <Chip tone="danger">Vencido</Chip>}
          <time className="text-slate-500 dark:text-slate-400">
            Creado {createdLabel}
          </time>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 text-[13px] md:text-sm">
        <Stat label="Vence" value={dueLabel} />
        <Stat label="Moneda" value={currencyCode} />
      </div>

      <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 px-3 py-2 text-[13px] dark:border-sky-900/40 dark:bg-slate-900/55 md:text-sm">
        <p className="text-[11px] opacity-70 md:text-xs">Concepto</p>
        <p className="mt-1 text-[13px] leading-relaxed md:text-sm">{due.concept || "-"}</p>
      </div>

      {canEdit && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-sky-200/70 pt-4 dark:border-sky-900/40">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 md:text-xs">
              Estado
            </label>
            <select
              className="min-w-[140px] cursor-pointer appearance-none rounded-full border border-sky-200/80 bg-sky-50/70 px-3 py-1 text-center text-[11px] font-medium outline-none dark:border-sky-900/40 dark:bg-slate-900/65 md:text-xs"
              value={localStatus}
              onChange={(e) => updateStatus(e.target.value as StatusValue)}
              disabled={updatingStatus}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {updatingStatus && <Spinner />}
          </div>

          <button
            onClick={deleteDue}
            disabled={loadingDelete || updatingStatus}
            className="rounded-full border border-amber-300/80 bg-amber-100/90 px-4 py-2 text-center text-[13px] text-amber-800 transition hover:border-amber-400 disabled:opacity-60 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200 md:text-sm"
            title="Eliminar cuota"
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
        </footer>
      )}
    </div>
  );
}
