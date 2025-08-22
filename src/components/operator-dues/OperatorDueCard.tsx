"use client";
import { useCallback, useMemo, useState } from "react";
import { Booking, OperatorDue, Service } from "@/types";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";

interface Props {
  due: OperatorDue;
  booking: Booking;
  role: string;
  onDueDeleted?: (id: number) => void;
  onStatusChanged?: (id: number, status: OperatorDue["status"]) => void;
}

const STATUS_OPTIONS: OperatorDue["status"][] = [
  "PENDIENTE",
  "PAGADA",
  "CANCELADA",
];

type ServiceWithOperator = Service & {
  operator?: { id_operator: number; name?: string };
};

function hasEmbeddedOperator(
  s: Service | ServiceWithOperator | undefined,
): s is ServiceWithOperator {
  return !!s && "operator" in s && typeof s.operator === "object";
}

export default function OperatorDueCard({
  due,
  booking,
  role,
  onDueDeleted,
  onStatusChanged,
}: Props) {
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [localStatus, setLocalStatus] = useState<OperatorDue["status"]>(
    (due.status as OperatorDue["status"]) || "PENDIENTE",
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

  // Buscar servicio por ID
  const service = useMemo(
    () => booking.services?.find((s) => s.id_service === due.service_id),
    [booking.services, due.service_id],
  );

  // Nombre del operador:
  // - Si el servicio viene con operator embebido, usarlo.
  // - Si no, usar el id_operator del servicio.
  const operatorName = useMemo(() => {
    if (!service) return "Operador";
    if (hasEmbeddedOperator(service) && service.operator?.name) {
      return service.operator.name;
    }
    // Si no viene embebido, al menos mostramos que hay un id_operator
    if (service.id_operator) return `Operador #${service.id_operator}`;
    return "Operador";
  }, [service]);

  const statusColor = useMemo(() => {
    const s = (localStatus || "PENDIENTE").toUpperCase();
    if (s === "PAGADA")
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200";
    if (s === "CANCELADA")
      return "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200";
    return "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200";
  }, [localStatus]);

  if (typeof due.id_due !== "number") {
    return (
      <div className="flex h-40 items-center justify-center dark:text-white">
        <Spinner />
      </div>
    );
  }

  const deleteDue = async () => {
    if (!confirm("¿Seguro querés eliminar esta cuota al operador?")) return;
    setLoadingDelete(true);
    try {
      const res = await fetch(`/api/operator-dues/${due.id_due}`, {
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

  const updateStatus = async (next: OperatorDue["status"]) => {
    if (next === localStatus) return;
    setUpdatingStatus(true);
    const prev = localStatus;
    setLocalStatus(next);
    try {
      const res = await fetch(`/api/operator-dues/${due.id_due}`, {
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
    <div className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
      {/* Header */}
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cuota N° {due.id_due}
          </p>
          <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor}`}>
            {(localStatus || "PENDIENTE").toUpperCase()}
          </span>
        </div>
        <time className="text-sm text-gray-500 dark:text-gray-400">
          {due.due_date
            ? new Date(due.due_date).toLocaleDateString("es-AR")
            : "–"}
        </time>
      </header>

      {/* Body */}
      <div className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="font-semibold">Servicio</p>
            <p className="mt-1">N° {due.service_id}</p>
          </div>
          <div>
            <p className="font-semibold">Operador</p>
            <p className="mt-1">{operatorName}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="font-semibold">Monto</p>
            <p className="mt-1">{fmtMoney(due.amount, due.currency)}</p>
          </div>
          <div>
            <p className="font-semibold">Moneda</p>
            <p className="mt-1">{(due.currency || "ARS").toUpperCase()}</p>
          </div>
        </div>

        <div className="col-span-2">
          <p className="font-semibold">Concepto</p>
          <p className="mt-1">{due.concept || "–"}</p>
        </div>
      </div>

      {/* Footer acciones */}
      <footer className="mt-6 flex items-center justify-between gap-2">
        {/* Selector de estado */}
        {(role === "administrativo" ||
          role === "desarrollador" ||
          role === "gerente") && (
          <div className="flex items-center gap-2">
            <label className="text-sm opacity-70">Estado</label>
            <select
              className="cursor-pointer appearance-none rounded-full border border-white/20 bg-transparent px-3 py-1 text-center text-sm outline-none dark:text-white"
              value={localStatus}
              onChange={(e) =>
                updateStatus(e.target.value as OperatorDue["status"])
              }
              disabled={updatingStatus}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {updatingStatus && <Spinner />}
          </div>
        )}

        {/* Borrar */}
        {(role === "administrativo" ||
          role === "desarrollador" ||
          role === "gerente") && (
          <button
            onClick={deleteDue}
            disabled={loadingDelete || updatingStatus}
            className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
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
        )}
      </footer>
    </div>
  );
}
