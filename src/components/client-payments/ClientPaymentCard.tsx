"use client";
import { useCallback, useMemo, useState } from "react";
import { Booking, ClientPayment } from "@/types";
import Spinner from "@/components/Spinner";
import { toast } from "react-toastify";

interface Props {
  payment: ClientPayment;
  booking: Booking;
  role: string;
  onPaymentDeleted?: (id: number) => void;
}

export default function ClientPaymentCard({
  payment,
  booking,
  role,
  onPaymentDeleted,
}: Props) {
  const [loadingDelete, setLoadingDelete] = useState(false);

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

  const fmtDate = (d?: string | Date | null) => {
    if (!d) return "–";
    try {
      const dt = typeof d === "string" ? new Date(d) : d;
      return dt.toLocaleDateString("es-AR", {
        timeZone: "UTC",
      });
    } catch {
      return "–";
    }
  };

  const isOverdue = useMemo(() => {
    if (!payment?.due_date) return false;
    try {
      const due = new Date(payment.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      return due < today;
    } catch {
      return false;
    }
  }, [payment?.due_date]);

  const clientName = useMemo(() => {
    if (!payment?.client_id) return "—";
    const tid = booking.titular.id_client;
    if (payment.client_id === tid) {
      return `${booking.titular.first_name} ${booking.titular.last_name} · N° ${tid}`;
    }
    const found = booking.clients?.find(
      (c) => c.id_client === payment.client_id,
    );
    return found
      ? `${found.first_name} ${found.last_name} · N° ${found.id_client}`
      : `N° ${payment.client_id}`;
  }, [payment?.client_id, booking.titular, booking.clients]);

  if (typeof payment?.id_payment !== "number") {
    return (
      <div className="flex h-40 items-center justify-center dark:text-white">
        <Spinner />
      </div>
    );
  }

  const deletePayment = async () => {
    if (!confirm("¿Seguro querés eliminar este pago?")) return;
    setLoadingDelete(true);
    try {
      const res = await fetch(`/api/client-payments/${payment.id_payment}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error();
      toast.success("Pago eliminado.");
      onPaymentDeleted?.(payment.id_payment);
    } catch {
      toast.error("No se pudo eliminar el pago.");
    } finally {
      setLoadingDelete(false);
    }
  };

  return (
    <div className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
      {/* Header */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Pago N° {payment.id_payment}
          </p>
          {isOverdue && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-200">
              Vencido
            </span>
          )}
        </div>
        <time className="text-sm text-gray-500 dark:text-gray-400">
          Creado: {fmtDate(payment.created_at)}
        </time>
      </header>

      {/* Body */}
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <p className="font-semibold">Cliente</p>
          <p className="mt-1">{clientName}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="font-semibold">Monto</p>
            <p className="mt-1">{fmtMoney(payment.amount, payment.currency)}</p>
          </div>
          <div>
            <p className="font-semibold">Moneda</p>
            <p className="mt-1">{(payment.currency || "ARS").toUpperCase()}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="font-semibold">Vence</p>
            <p className="mt-1">{fmtDate(payment.due_date)}</p>
          </div>
          <div />
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-6 flex justify-end">
        {(role === "administrativo" ||
          role === "desarrollador" ||
          role === "gerente") && (
          <button
            onClick={deletePayment}
            disabled={loadingDelete}
            className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
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
