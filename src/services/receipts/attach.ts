// src/services/receipts/attach.ts
import { authFetch } from "@/utils/authFetch";

export async function attachExistingReceipt(args: {
  token: string;
  receiptId: number;
  bookingId: number;
  serviceIds: number[];
}) {
  const res = await authFetch(
    `/api/receipts/${args.receiptId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        booking: { id_booking: args.bookingId },
        serviceIds: args.serviceIds,
      }),
    },
    args.token,
  );

  if (!res.ok) throw new Error("No se pudo asociar el recibo.");
}
