// src/components/receipts/ReceiptCard.tsx
"use client";
import { Receipt } from "@/types";
import { toast } from "react-toastify";
import Spinner from "@/components/Spinner";

interface ReceiptCardProps {
  receipt: Receipt;
}

export default function ReceiptCard({ receipt }: ReceiptCardProps) {
  if (!receipt || !receipt.id_receipt) {
    return (
      <div className="flex h-40 items-center justify-center dark:text-white">
        <Spinner />
      </div>
    );
  }

  const downloadPDF = async () => {
    try {
      const response = await fetch(`/api/receipts/${receipt.id_receipt}/pdf`, {
        headers: { Accept: "application/pdf" },
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `recibo_${receipt.id_receipt}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Recibo descargado exitosamente.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo descargar el recibo.");
    }
  };

  return (
    <div className="space-y-3 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white/50 dark:bg-black dark:text-white">
      <p className="font-semibold">
        N° Recibo: <span className="font-light">{receipt.receipt_number}</span>
      </p>
      <p className="font-semibold">
        Fecha:{" "}
        <span className="font-light">
          {receipt.issue_date
            ? new Date(receipt.issue_date).toLocaleDateString("es-AR")
            : "N/A"}
        </span>
      </p>
      <p className="font-semibold">
        Concepto: <span className="font-light">{receipt.concept}</span>
      </p>
      <p className="font-semibold">
        Monto:{" "}
        <span className="font-light">{(receipt.amount, receipt.currency)}</span>
      </p>
      <button
        onClick={downloadPDF}
        className="mt-3 block rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
      >
        Descargar PDF
      </button>
    </div>
  );
}
