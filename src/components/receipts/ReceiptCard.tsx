"use client";
import { useState } from "react";
import { Receipt, Booking } from "@/types";
import { toast } from "react-toastify";
import Spinner from "@/components/Spinner";

interface ReceiptCardProps {
  receipt: Receipt;
  booking: Booking;
}

export default function ReceiptCard({ receipt, booking }: ReceiptCardProps) {
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
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
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white/50 dark:bg-black dark:text-white">
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

      <button
        onClick={downloadPDF}
        disabled={loading}
        className={`mt-3 w-full rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black ${
          loading ? "cursor-not-allowed opacity-50" : ""
        }`}
      >
        {loading ? <Spinner /> : "Descargar PDF"}
      </button>
    </div>
  );
}
