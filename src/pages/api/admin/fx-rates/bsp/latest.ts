import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveBillingAuth, isBillingAdminRole } from "@/lib/billingAuth";
import { toDateKeyInBuenosAires } from "@/lib/buenosAiresDate";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveBillingAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!isBillingAdminRole(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const item = await prisma.billingFxRate.findFirst({
    where: { fx_type: "DOLAR_BSP" },
    orderBy: [{ rate_date: "desc" }, { id_fx_rate: "desc" }],
  });

  if (!item) return res.status(200).json({ item: null });

  return res.status(200).json({
    item: {
      id_fx_rate: item.id_fx_rate,
      fx_type: item.fx_type,
      rate_date: toDateKeyInBuenosAires(item.rate_date),
      ars_per_usd: Number(item.ars_per_usd ?? 0),
      note: item.note,
      created_at: item.created_at,
      updated_at: item.updated_at,
    },
  });
}
