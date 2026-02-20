import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type BillingEventInput = {
  id_agency: number;
  subscription_id?: number | null;
  event_type: string;
  payload?: Prisma.InputJsonValue;
  created_by?: number | null;
};

type BillingEventClient = Prisma.TransactionClient | typeof prisma;

export async function logBillingEvent(
  input: BillingEventInput,
  tx?: BillingEventClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.agencyBillingEvent.create({
    data: {
      id_agency: input.id_agency,
      subscription_id: input.subscription_id ?? null,
      event_type: input.event_type,
      payload: input.payload,
      created_by: input.created_by ?? null,
    },
  });
}
