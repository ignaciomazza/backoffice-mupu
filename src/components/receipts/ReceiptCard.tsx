"use client";
import { useState } from "react";
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

  if (!receipt || !receipt.id_receipt) {
    return (
      <div className="flex h-40 items-center justify-center dark:text-white">
        <Spinner />
      </div>
    );
  }

  const slugify = (text: string): string =>
    text
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
      .replace(/[^a-z0-9]+/g, "_") // No alfanum → underscore
      .replace(/^_+|_+$/g, ""); // Quitar underscores al final/inicio

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

      // Ahora sí tenemos booking.titular
      const rawName =
        booking.titular.company_name ||
        `${booking.titular.first_name} ${booking.titular.last_name}`;
      const clientName = slugify(rawName);
      const bookingId = booking.id_booking;

      link.download = `Recibo_${clientName}_${bookingId}.pdf`;
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
      if (onReceiptDeleted) {
        onReceiptDeleted(receipt.id_receipt);
      }
    } catch {
      toast.error("No se pudo eliminar el recibo.");
    } finally {
      setLoadingDelete(false);
    }
  };

  return (
    <div className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white">
      <div>
        <p className="font-semibold">N° Recibo:</p>
        <p className="font-light">{receipt.receipt_number}</p>
      </div>

      <div>
        <p className="font-semibold">Fecha:</p>
        <p className="font-light">
          {receipt.issue_date
            ? new Date(receipt.issue_date).toLocaleDateString("es-AR")
            : "N/A"}
        </p>
      </div>

      <div>
        <p className="font-semibold">Concepto:</p>
        <p className="font-light">{receipt.concept}</p>
      </div>

      <div>
        <p className="font-semibold">Monto numérico:</p>
        <p className="font-light">{receipt.amount}</p>
      </div>

      <div>
        <p className="font-semibold">Monto en letras:</p>
        <p className="font-light">{receipt.amount_string}</p>
      </div>

      <div>
        <p className="font-semibold">Moneda recibida:</p>
        <p className="font-light">{receipt.currency}</p>
      </div>

      <div>
        <p className="font-semibold">IDs de Servicio:</p>
        <p className="font-light">
          {receipt.serviceIds && receipt.serviceIds.length > 0
            ? receipt.serviceIds.join(", ")
            : "–"}
        </p>
      </div>

      {receipt.clientIds && receipt.clientIds.length > 0 && (
        <div>
          <p className="font-semibold">IDs de Cliente(s):</p>
          <p className="font-light">{receipt.clientIds.join(", ")}</p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={downloadPDF}
          disabled={loadingPDF}
          className={`w-full rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black ${
            loadingPDF ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          {loadingPDF ? <Spinner /> : "Descargar PDF"}
        </button>

        {(role === "administrativo" ||
          role === "desarrollador" ||
          role === "gerente") && (
          <button
            onClick={deleteReceipt}
            disabled={loadingDelete || loadingPDF}
            className={`w-fit rounded-full bg-red-600 px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-red-800 ${
              loadingDelete || loadingPDF ? "cursor-not-allowed opacity-50" : ""
            }`}
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
      </div>
    </div>
  );
}
