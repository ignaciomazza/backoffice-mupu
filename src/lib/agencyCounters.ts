import type { AgencyCounterKey, Prisma } from "@prisma/client";

export const COUNTER_KEYS: AgencyCounterKey[] = [
  "booking",
  "client",
  "service",
  "receipt",
  "client_payment",
  "investment",
  "operator_due",
];

export async function getNextAgencyCounter(
  tx: Prisma.TransactionClient,
  id_agency: number,
  key: AgencyCounterKey,
): Promise<number> {
  const counter = await tx.agencyCounter.upsert({
    where: { id_agency_key: { id_agency, key } },
    update: { next_value: { increment: 1 } },
    create: { id_agency, key, next_value: 2 },
    select: { next_value: true },
  });

  return counter.next_value - 1;
}
