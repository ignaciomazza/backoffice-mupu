// src/components/receipts/ReceiptCard.tsx
"use client";
import { useState, useCallback } from "react";
import { Receipt, Booking } from "@/types";
import { toast } from "react-toastify";
import Spinner from "@/components/Spinner";

interface ReceiptCardProps {
  receipt: Receipt;
  booking: Booking;
  role: string;
  onReceiptDeleted?: (id: number) => void;
}

export default function ReceiptCard({
  receipt,
  booking,
  role,
  onReceiptDeleted,
}: ReceiptCardProps) {
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  // formateo de moneda
  const fmt = useCallback((v?: number, curr?: string) => {
    const currency = curr === "DOL" ? "USD" : "ARS";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(v ?? 0);
  }, []);

  // obtiene nombre de cliente por ID
  const getClientName = (id: number): string => {
    if (booking.titular.id_client === id) {
      return `${booking.titular.first_name} ${booking.titular.last_name} N° ${booking.titular.id_client}`;
    }
    const found = booking.clients?.find((c) => c.id_client === id);
    return found
      ? `${found.first_name} ${found.last_name} N° ${id}`
      : `N° ${id}`;
  };

  if (!receipt?.id_receipt) {
    return (
      <div className="flex h-40 items-center justify-center dark:text-white">
        <Spinner />
      </div>
    );
  }

  const downloadPDF = async () => {
    setLoadingPDF(true);
    try {
      const res = await fetch(`/api/receipts/${receipt.id_receipt}/pdf`, {
        headers: { Accept: "application/pdf" },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // slugify para filename
      const rawName =
        booking.titular.company_name ||
        `${booking.titular.first_name} ${booking.titular.last_name}`;
      const clientSlug = rawName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      link.download = `Recibo_${clientSlug}_${booking.id_booking}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Recibo descargado exitosamente.");
    } catch {
      toast.error("No se pudo descargar el recibo.");
    } finally {
      setLoadingPDF(false);
    }
  };

  const deleteReceipt = async () => {
    if (!confirm("¿Seguro querés eliminar este recibo?")) return;
    setLoadingDelete(true);
    try {
      const res = await fetch(`/api/receipts/${receipt.id_receipt}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error();
      toast.success("Recibo eliminado.");
      onReceiptDeleted?.(receipt.id_receipt);
    } catch {
      toast.error("No se pudo eliminar el recibo.");
    } finally {
      setLoadingDelete(false);
    }
  };

  return (
    <div className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-sky-950 shadow-md shadow-sky-950/10 backdrop-blur dark:text-white">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            N° {receipt.receipt_number}
          </p>
        </div>
        <time className="text-sm text-gray-500 dark:text-gray-400">
          {receipt.issue_date
            ? new Date(receipt.issue_date).toLocaleDateString("es-AR")
            : "–"}
        </time>
      </header>

      {/* GRID DATOS */}
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <p className="font-semibold">Cliente</p>
          <p className="mt-1">
            {receipt.clientIds?.length
              ? receipt.clientIds.map(getClientName).join(", ")
              : `${booking.titular.first_name} ${booking.titular.last_name} N° ${booking.titular.id_client}`}
          </p>
        </div>
        <div>
          <p className="font-semibold">Moneda / Monto</p>
          <p className="mt-1">{fmt(receipt.amount, receipt.currency)}</p>
        </div>
        <div className="col-span-2">
          <p className="font-semibold">Concepto</p>
          <p className="mt-1">{receipt.concept}</p>
        </div>
        <div className="col-span-2">
          <p className="font-semibold">Monto en letras</p>
          <p className="mt-1">{receipt.amount_string}</p>
        </div>
        <div className="col-span-2">
          <p className="font-semibold">Servicios (N°)</p>
          <p className="mt-1">
            {receipt.serviceIds?.length ? receipt.serviceIds.join(", ") : "–"}
          </p>
        </div>
      </div>

      {/* FOOTER BOTONES */}
      <footer className="mt-6 flex justify-end space-x-2">
        <button
          onClick={downloadPDF}
          disabled={loadingPDF}
          className="rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
        >
          {loadingPDF ? (
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
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          )}
        </button>
        {(role === "administrativo" ||
          role === "desarrollador" ||
          role === "gerente") && (
          <button
            onClick={deleteReceipt}
            disabled={loadingDelete || loadingPDF}
            className="rounded-full bg-red-600 px-6 py-2 text-center text-red-100 shadow-sm shadow-red-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-red-800"
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
