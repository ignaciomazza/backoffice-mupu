// src/pages/api/finance/categories/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  requires_operator: z.boolean().optional(),
  requires_user: z.boolean().optional(),
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
    const item = await prisma.expenseCategory.findUnique({
      where: { id_category: id },
    });
    if (!item) return res.status(404).json({ error: "No encontrado" });
    return res.status(200).json(item);
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.message });

    const updated = await prisma.expenseCategory.update({
      where: { id_category: id },
      data: parsed.data,
    });
    return res.status(200).json(updated);
  }

  if (req.method === "DELETE") {
    await prisma.expenseCategory.delete({ where: { id_category: id } });
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PUT, PATCH, DELETE");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
