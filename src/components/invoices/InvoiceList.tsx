// src/components/invoices/InvoiceList.tsx

import { Invoice } from "@/types";
import InvoiceCard from "./InvoiceCard";
import Spinner from "@/components/Spinner";
import "react-toastify/dist/ReactToastify.css";

interface InvoiceListProps {
  invoices: Invoice[];
}

export default function InvoiceList({ invoices }: InvoiceListProps) {
  if (!invoices || invoices.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {invoices
        .filter((invoice) => invoice && invoice.id_invoice)
        .map((invoice) => (
          <InvoiceCard key={invoice.id_invoice} invoice={invoice} />
        ))}
    </div>
  );
}
