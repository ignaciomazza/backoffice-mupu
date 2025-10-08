// src/pages/api/finance/methods/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  code: z.string().trim().min(1).max(16).optional(),
  requires_account: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const id = Number(
    Array.isArray(req.query.id) ? req.query.id[0] : req.query.id,
  );
  if (!Number.isFinite(id) || id <= 0)
    return res.status(400).json({ error: "id inválido" });

  if (req.method === "GET") {
    const item = await prisma.financePaymentMethod.findUnique({
      where: { id_method: id },
    });
    if (!item) return res.status(404).json({ error: "No encontrado" });
    return res.status(200).json(item);
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.message });

    const updated = await prisma.financePaymentMethod.update({
      where: { id_method: id },
      data: parsed.data,
    });
    return res.status(200).json(updated);
  }

  if (req.method === "DELETE") {
    await prisma.financePaymentMethod.delete({ where: { id_method: id } });
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PUT, PATCH, DELETE");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
