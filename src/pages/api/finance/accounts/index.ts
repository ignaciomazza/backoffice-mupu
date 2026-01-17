// src/pages/api/finance/accounts/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";
import { getFinancePicksAccess } from "@/lib/accessControl";

const createSchema = z.object({
  name: z.string().trim().min(2),
  alias: z.string().trim().min(1).nullable().optional(),
  type: z.string().trim().min(1).nullable().optional(),
  cbu: z.string().trim().min(1).nullable().optional(),
  currency: z.string().trim().min(2).nullable().optional(),
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
    const items = await prisma.financeAccount.findMany({
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
      const agencyAccountId = await getNextAgencyCounter(
        tx,
        auth.id_agency,
        "finance_account",
      );
      return tx.financeAccount.create({
        data: {
          ...parsed.data,
          id_agency: auth.id_agency,
          agency_finance_account_id: agencyAccountId,
        },
      });
    });
    return res.status(201).json(created);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
