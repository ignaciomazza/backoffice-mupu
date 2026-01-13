// src/pages/api/finance/methods/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { jwtVerify, type JWTPayload } from "jose";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { z } from "zod";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");
type TokenPayload = JWTPayload & {
  id_agency?: number;
  agencyId?: number;
  aid?: number;
};

const createSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(1).max(16),
  requires_account: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
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
  const id_agency = await resolveAgencyId(req);
  if (!id_agency) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const items = await prisma.financePaymentMethod.findMany({
      where: { id_agency },
      orderBy: [{ name: "asc" }],
    });
    return res.status(200).json(items);
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.message });

    const created = await prisma.$transaction(async (tx) => {
      const agencyMethodId = await getNextAgencyCounter(
        tx,
        id_agency,
        "finance_payment_method",
      );
      return tx.financePaymentMethod.create({
        data: {
          ...parsed.data,
          id_agency,
          agency_finance_payment_method_id: agencyMethodId,
        },
      });
    });
    return res.status(201).json(created);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
