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
      <div className="flex h-40 items-center justify-center dark:text-white">
        <Spinner />
      </div>
    );
  }

  const formatCurrency = (
    value: number | undefined,
    currency: string | undefined,
  ): string => {
    if (value == null || !currency) return "N/A";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
    }).format(value);
  };

  const downloadPDF = async () => {
    try {
      // 🔑 Aquí era /api/receipts/... y debe ser /api/invoices/...
      const response = await fetch(`/api/invoices/${invoice.id_invoice}/pdf`, {
        headers: { Accept: "application/pdf" },
      });
      if (!response.ok) {
        throw new Error(`Error al descargar factura ID: ${invoice.id_invoice}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `factura_${invoice.id_invoice}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Factura descargada exitosamente.");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo descargar la factura.");
    }
  };

  return (
    <div className="space-y-3 rounded-3xl bg-white p-6 text-black shadow-md dark:border dark:border-white/50 dark:bg-black dark:text-white">
      <p className="font-semibold">
        Número de Factura:{" "}
        <span className="font-light">{invoice.invoice_number || "N/A"}</span>
      </p>
      <p className="font-semibold">
        Destinatario/a:{" "}
        <span className="font-light">
          {invoice.recipient || "N/A"} – ID {invoice.client_id}
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
        className="mt-3 block rounded-full bg-black px-6 py-2 text-center text-white transition-transform hover:scale-95 active:scale-90 dark:bg-white dark:text-black"
      >
        Descargar PDF
      </button>
    </div>
  );
}
