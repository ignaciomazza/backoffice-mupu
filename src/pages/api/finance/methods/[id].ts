// src/pages/api/finance/methods/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";
import { getFinancePicksAccess } from "@/lib/accessControl";

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

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { canRead, canWrite } = await getFinancePicksAccess(
    auth.id_agency,
    auth.id_user,
    auth.role,
  );
  const where = { id_method: id, id_agency: auth.id_agency };

  if (req.method === "GET") {
    if (!canRead) return res.status(403).json({ error: "Sin permisos" });
    const item = await prisma.financePaymentMethod.findFirst({ where });
    if (!item) return res.status(404).json({ error: "No encontrado" });
    return res.status(200).json(item);
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.message });

    const existing = await prisma.financePaymentMethod.findFirst({ where });
    if (!existing) return res.status(404).json({ error: "No encontrado" });

    const updated = await prisma.financePaymentMethod.update({
      where: { id_method: id },
      data: parsed.data,
    });
    return res.status(200).json(updated);
  }

  if (req.method === "DELETE") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    const existing = await prisma.financePaymentMethod.findFirst({ where });
    if (!existing) return res.status(404).json({ error: "No encontrado" });
    await prisma.financePaymentMethod.delete({ where: { id_method: id } });
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PUT, PATCH, DELETE");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
