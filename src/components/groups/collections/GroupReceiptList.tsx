// src/components/groups/collections/GroupReceiptList.tsx

import { Receipt, Booking, Service } from "@/types";
import GroupReceiptCard from "@/components/groups/collections/GroupReceiptCard";
import "react-toastify/dist/ReactToastify.css";

interface ReceiptListProps {
  token: string | null;
  receipts: Receipt[];
  booking: Booking;
  groupId?: string;
  services: Service[];
  role: string;
  onReceiptDeleted?: (id: number) => void;
  onReceiptEdit?: (receipt: Receipt) => void;
}

export default function GroupReceiptList({
  token,
  receipts,
  booking,
  groupId,
  services,
  role,
  onReceiptDeleted,
  onReceiptEdit,
}: ReceiptListProps) {
  if (!receipts || receipts.length === 0) {
    return (
      <div className="rounded-2xl border border-sky-200/80 bg-white/75 p-5 text-center text-[13px] text-slate-700 shadow-sm shadow-sky-100/40 backdrop-blur-sm dark:border-sky-900/40 dark:bg-slate-900/55 dark:text-slate-300 md:text-sm">
        No hay recibos registrados
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {receipts
        .filter((r) => r && r.id_receipt)
        .map((receipt) => (
          <GroupReceiptCard
            key={receipt.id_receipt}
            token={token}
            receipt={receipt}
            booking={booking}
            groupId={groupId}
            services={services}
            role={role}
            onReceiptDeleted={onReceiptDeleted}
            onReceiptEdit={onReceiptEdit}
          />
        ))}
    </div>
  );
}
