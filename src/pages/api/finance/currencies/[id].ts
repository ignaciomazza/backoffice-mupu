// src/pages/api/finance/currencies/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";
import { getFinancePicksAccess } from "@/lib/accessControl";

const updateSchema = z.object({
  code: z.string().trim().min(2).max(6).optional(),
  name: z.string().trim().min(2).optional(),
  symbol: z.string().trim().min(1).max(4).optional(),
  enabled: z.boolean().optional(),
  is_primary: z.boolean().optional(),
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

  // Asegurar pertenencia a la agencia
  const where = { id_currency: id, id_agency: auth.id_agency };

  if (req.method === "GET") {
    if (!canRead) return res.status(403).json({ error: "Sin permisos" });
    const item = await prisma.financeCurrency.findFirst({ where });
    if (!item) return res.status(404).json({ error: "No encontrado" });
    return res.status(200).json(item);
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.message });

    const existing = await prisma.financeCurrency.findFirst({ where });
    if (!existing) return res.status(404).json({ error: "No encontrado" });

    // si marcan is_primary=true, ponemos el resto en false dentro de la misma agencia
    if (parsed.data.is_primary === true) {
      await prisma.$transaction([
        prisma.financeCurrency.updateMany({
          where: { id_agency: auth.id_agency },
          data: { is_primary: false },
        }),
        prisma.financeCurrency.update({
          where: { id_currency: id },
          data: { ...parsed.data, id_agency: auth.id_agency },
        }),
      ]);
    } else {
      await prisma.financeCurrency.update({
        where: { id_currency: id },
        data: { ...parsed.data, id_agency: auth.id_agency },
      });
    }
    const updated = await prisma.financeCurrency.findFirst({ where });
    return res.status(200).json(updated);
  }

  if (req.method === "DELETE") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    const existing = await prisma.financeCurrency.findFirst({ where });
    if (!existing) return res.status(404).json({ error: "No encontrado" });
    await prisma.financeCurrency.delete({ where: { id_currency: id } });
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PUT, PATCH, DELETE");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
