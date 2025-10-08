// src/pages/api/finance/currencies/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { jwtVerify, type JWTPayload } from "jose";
import prisma from "@/lib/prisma";
import { z } from "zod";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

type TokenPayload = JWTPayload & {
  id_agency?: number;
  agencyId?: number;
  aid?: number;
};

const updateSchema = z.object({
  code: z.string().trim().min(2).max(6).optional(),
  name: z.string().trim().min(2).optional(),
  symbol: z.string().trim().min(1).max(4).optional(),
  enabled: z.boolean().optional(),
  is_primary: z.boolean().optional(),
});

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = (req.cookies || {})[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}
async function resolveAgencyId(req: NextApiRequest): Promise<number | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;
    const byToken = Number(p.id_agency ?? p.agencyId ?? p.aid) || 0;
    return byToken > 0 ? byToken : null;
  } catch {
    return null;
  }
}

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

  const id_agency = await resolveAgencyId(req);
  if (!id_agency) return res.status(401).json({ error: "Unauthorized" });

  // Asegurar pertenencia a la agencia
  const where = { id_currency: id, id_agency };

  if (req.method === "GET") {
    const item = await prisma.financeCurrency.findFirst({ where });
    if (!item) return res.status(404).json({ error: "No encontrado" });
    return res.status(200).json(item);
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.message });

    // si marcan is_primary=true, ponemos el resto en false dentro de la misma agencia
    if (parsed.data.is_primary === true) {
      await prisma.$transaction([
        prisma.financeCurrency.updateMany({
          where: { id_agency },
          data: { is_primary: false },
        }),
        prisma.financeCurrency.update({
          where: { id_currency: id },
          data: { ...parsed.data, id_agency },
        }),
      ]);
    } else {
      await prisma.financeCurrency.update({
        where: { id_currency: id },
        data: { ...parsed.data, id_agency },
      });
    }
    const updated = await prisma.financeCurrency.findFirst({ where });
    return res.status(200).json(updated);
  }

  if (req.method === "DELETE") {
    await prisma.financeCurrency.delete({ where: { id_currency: id } });
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PUT, PATCH, DELETE");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
