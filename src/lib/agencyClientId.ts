import type { Prisma } from "@prisma/client";

import {
  ensureAgencyCounterAtLeast,
  getNextAgencyCounter,
} from "@/lib/agencyCounters";

export async function getNextAvailableAgencyClientId(
  tx: Prisma.TransactionClient,
  id_agency: number,
): Promise<number> {
  const maxClient = await tx.client.aggregate({
    where: { id_agency },
    _max: { agency_client_id: true },
  });

  const maxUsed = maxClient._max.agency_client_id ?? 0;
  await ensureAgencyCounterAtLeast(tx, id_agency, "client", maxUsed + 1);

  return getNextAgencyCounter(tx, id_agency, "client");
}
