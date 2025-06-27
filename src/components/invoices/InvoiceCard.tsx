// src/components/invoices/InvoiceCard.tsx

"use client";
import { Invoice } from "@/types";
import { toast } from "react-toastify";
import Spinner from "../Spinner";
import { useState } from "react";

type InvoiceApi = Invoice & { bookingId_booking?: number };

interface InvoiceCardProps {
  invoice: InvoiceApi;
}

export default function InvoiceCard({ invoice }: InvoiceCardProps) {
  const [loading, setLoading] = useState(false);

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

  const slugify = (text: string): string =>
    text
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
      .replace(/[^a-z0-9]+/g, "_") // Reemplazar no alfanuméricos por guión bajo
      .replace(/^_+|_+$/g, ""); // Quitar guiones bajos al inicio o fin

  const downloadPDF = async () => {
    setLoading(true);
    try {
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

      const clientName = invoice.recipient
        ? slugify(invoice.recipient)
        : `cliente_${invoice.client_id}`;

      // Aquí no usamos any, sino la propiedad opcional que definimos
      const bookingId =
        invoice.bookingId_booking ?? invoice.booking?.id_booking ?? "reserva";

      const filename = `Factura_${clientName}_${bookingId}.pdf`.trim();
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Factura descargada exitosamente.");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo descargar la factura.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-fit space-y-3 rounded-3xl border border-white/10 bg-white/10 p-6 text-black shadow-md backdrop-blur dark:text-white">
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
      <div className="mt-3 flex justify-end">
        <button
          onClick={downloadPDF}
          disabled={loading}
          className={`rounded-full bg-sky-100 px-6 py-2 text-black transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur ${
            loading ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          {loading ? (
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
      </div>
    </div>
  );
}
