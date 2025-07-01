// src/components/credit-notes/CreditNoteList.tsx
import CreditNoteCard from "./CreditNoteCard";
import Spinner from "../Spinner";
import type { CreditNoteWithItems } from "@/services/creditNotes";

interface CreditNoteListProps {
  creditNotes: CreditNoteWithItems[];
}

export default function CreditNoteList({ creditNotes }: CreditNoteListProps) {
  if (!creditNotes || creditNotes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {creditNotes.map((cn) => (
        <CreditNoteCard key={cn.id_credit_note} creditNote={cn} />
      ))}
    </div>
  );
}
