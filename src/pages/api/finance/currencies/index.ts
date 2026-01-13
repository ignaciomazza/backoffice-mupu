// src/pages/api/finance/currencies/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { jwtVerify, type JWTPayload } from "jose";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { z } from "zod";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  email?: string;
};

const createSchema = z.object({
  code: z.string().trim().min(2).max(6),
  name: z.string().trim().min(2),
  symbol: z.string().trim().min(1).max(4),
  enabled: z.boolean().optional().default(true),
  is_primary: z.boolean().optional().default(false),
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
  const raw = Array.isArray(req.query.id_agency)
    ? req.query.id_agency[0]
    : req.query.id_agency;
  const n = raw != null ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return n;

  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;
    const byToken = Number(p.id_agency ?? p.agencyId ?? p.aid) || 0;
    if (byToken > 0) return byToken;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
    const email = p.email || "";
    if (id_user || email) {
      const u = await prisma.user.findFirst({
        where: id_user ? { id_user } : { email },
        select: { id_agency: true },
      });
      if (u?.id_agency) return u.id_agency;
    }
  } catch {}
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (req.method === "GET") {
    try {
      const id_agency = await resolveAgencyId(req);
      if (!id_agency) return res.status(401).json({ error: "Unauthorized" });

      const items = await prisma.financeCurrency.findMany({
        where: { id_agency },
        orderBy: [{ is_primary: "desc" }, { code: "asc" }],
      });
      return res.status(200).json(items);
    } catch (e) {
      console.error("[finance/currencies][GET]", reqId, e);
      return res.status(500).json({ error: "Error obteniendo monedas" });
    }
  }

  if (req.method === "POST") {
    try {
      const id_agency = await resolveAgencyId(req);
      if (!id_agency) return res.status(401).json({ error: "Unauthorized" });

      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const parsed = createSchema.safeParse(body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.message });

      const created = await prisma.$transaction(async (tx) => {
        const agencyCurrencyId = await getNextAgencyCounter(
          tx,
          id_agency,
          "finance_currency",
        );
        return tx.financeCurrency.create({
          data: {
            ...parsed.data,
            id_agency,
            agency_finance_currency_id: agencyCurrencyId,
          },
        });
      });
      return res.status(201).json(created);
    } catch (e) {
      console.error("[finance/currencies][POST]", reqId, e);
      return res.status(500).json({ error: "Error creando moneda" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
