// src/components/invoices/InvoiceCard.tsx

"use client";
import { Invoice } from "@/types";
import { toast } from "react-toastify";
import Spinner from "../Spinner";

interface InvoiceCardProps {
  invoice: Invoice;
}

export default function InvoiceCard({ invoice }: InvoiceCardProps) {
  if (!invoice || !invoice.id_invoice) {
    return (
      <div className="flex justify-center items-center h-40 dark:text-white">
        <Spinner />
      </div>
    );
  }

  const formatCurrency = (
    value: number | undefined,
    currency: string | undefined
  ): string => {
    if (value === undefined || value === null || !currency) return "N/A";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(value);
  };

  const downloadPDF = async () => {
    try {
      const response = await fetch(`/api/invoices/${invoice.id_invoice}`, {
        headers: { Accept: "application/pdf" },
      });

      if (!response.ok) {
        throw new Error(
          `Error al descargar la factura ID: ${invoice.id_invoice}`
        );
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `factura_${invoice.id_invoice}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Factura descargada exitosamente.");
    } catch (error) {
      toast.error("No se pudo descargar la factura.");
    }
  };

  return (
    <div className="bg-white dark:bg-black text-black dark:text-white shadow-md rounded-3xl p-6 space-y-3 dark:border dark:border-opacity-50 dark:border-white">
      <p className="font-semibold">
        Número de Factura:{" "}
        <span className="font-light">{invoice.invoice_number || "N/A"}</span>
      </p>
      <p className="font-semibold">
        Destinatario/a:{" "}
        <span className="font-light">
          {invoice.recipient || "N/A"} - ID {invoice.client_id}
        </span>
      </p>
      <p className="font-semibold">
        Fecha:{" "}
        <span className="font-light">
          {invoice.issue_date
            ? new Date(invoice.issue_date).toLocaleDateString("es-AR")
            : "N/A"}
        </span>
      </p>
      <p className="font-semibold">
        Monto Total:{" "}
        <span className="font-light">
          {formatCurrency(invoice.total_amount, invoice.currency)}
        </span>
      </p>
      <p className="font-semibold">
        Estado: <span className="font-light">{invoice.status || "N/A"}</span>
      </p>
      <button
        onClick={downloadPDF}
        className="mt-3 block py-2 px-6 rounded-full transition-transform hover:scale-105 active:scale-100 text-center bg-black text-white dark:bg-white dark:text-black"
      >
        Descargar PDF
      </button>
    </div>
  );
}
