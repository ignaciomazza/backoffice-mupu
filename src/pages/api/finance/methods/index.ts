// src/pages/api/finance/methods/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";
import { getFinancePicksAccess } from "@/lib/accessControl";

const createSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(1).max(16),
  requires_account: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { canRead, canWrite } = await getFinancePicksAccess(
    auth.id_agency,
    auth.id_user,
    auth.role,
  );

  if (req.method === "GET") {
    if (!canRead) return res.status(403).json({ error: "Sin permisos" });
    const items = await prisma.financePaymentMethod.findMany({
      where: { id_agency: auth.id_agency },
      orderBy: [{ name: "asc" }],
    });
    return res.status(200).json(items);
  }

  if (req.method === "POST") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.message });

    const created = await prisma.$transaction(async (tx) => {
      const agencyMethodId = await getNextAgencyCounter(
        tx,
        auth.id_agency,
        "finance_payment_method",
      );
      return tx.financePaymentMethod.create({
        data: {
          ...parsed.data,
          id_agency: auth.id_agency,
          agency_finance_payment_method_id: agencyMethodId,
        },
      });
    });
    return res.status(201).json(created);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
