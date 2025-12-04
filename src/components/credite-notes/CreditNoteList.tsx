// src/components/credit-notes/CreditNoteList.tsx
import CreditNoteCard from "./CreditNoteCard";
import Spinner from "@/components/Spinner";
import type { CreditNoteWithItems } from "@/services/creditNotes";

interface CreditNoteListProps {
  creditNotes: CreditNoteWithItems[];
}

export default function CreditNoteList({ creditNotes }: CreditNoteListProps) {
  // 1) Todavía no hay data (ej: contenedor está cargando) → spinner
  if (!creditNotes) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // 2) Listo pero vacío → mensaje amigable (igual que InvoiceList)
  if (creditNotes.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-center text-sm opacity-80">
        No hay notas de crédito para esta reserva.
      </div>
    );
  }

  // 3) Hay notas → grilla de tarjetas
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {creditNotes.map((cn) => (
        <CreditNoteCard key={cn.id_credit_note} creditNote={cn} />
      ))}
    </div>
  );
}
