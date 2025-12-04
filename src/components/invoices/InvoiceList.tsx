// src/components/invoices/InvoiceList.tsx
import InvoiceCard from "./InvoiceCard";
import Spinner from "@/components/Spinner";
import { Invoice } from "@/types";

interface InvoiceListProps {
  invoices: Invoice[];
  loading?: boolean; // carga del pipeline/endpoint
  ready?: boolean; // el contenedor ya terminó las requests iniciales
}

export default function InvoiceList({
  invoices,
  loading = false,
  ready = true, // ✅ default: listo para renderizar
}: InvoiceListProps) {
  // Aún no listo: no renderizar nada (espera al container si ALGUIEN lo usa así)
  if (!ready) return null;

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!invoices || invoices.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-center text-sm opacity-80">
        No hay facturas para esta reserva.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {invoices.map((invoice) => (
        <InvoiceCard key={invoice.id_invoice} invoice={invoice} />
      ))}
    </div>
  );
}
