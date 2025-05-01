// src/components/receipts/ReceiptList.tsx
import { Receipt } from "@/types";
import ReceiptCard from "./ReceiptCard";
import Spinner from "@/components/Spinner";
import "react-toastify/dist/ReactToastify.css";

interface ReceiptListProps {
  receipts: Receipt[];
}

export default function ReceiptList({ receipts }: ReceiptListProps) {
  if (!receipts || receipts.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {receipts
        .filter((r) => r && r.id_receipt)
        .map((receipt) => (
          <ReceiptCard key={receipt.id_receipt} receipt={receipt} />
        ))}
    </div>
  );
}
