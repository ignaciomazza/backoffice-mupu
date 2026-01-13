// src/pages/api/finance/config/index.ts
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
  role?: string;
  email?: string;
};

const putSchema = z.object({
  default_currency_code: z.string().trim().min(2),
  hide_operator_expenses_in_investments: z.boolean().optional(),
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
  // query tiene prioridad si viene bien formado
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

    // fallback por email o id_user si faltara agency
    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
    const email = p.email || "";
    if (id_user || email) {
      const u = await prisma.user.findFirst({
        where: id_user ? { id_user } : { email },
        select: { id_agency: true },
      });
      if (u?.id_agency) return u.id_agency;
    }
  } catch {
    /* ignore */
  }
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

      const config = await prisma.financeConfig.findFirst({
        where: { id_agency },
      });
      return res.status(200).json(config ?? null);
    } catch (e) {
      console.error("[finance/config][GET]", reqId, e);
      return res.status(500).json({ error: "Error obteniendo configuración" });
    }
  }

  if (req.method === "PUT") {
    try {
      const id_agency = await resolveAgencyId(req);
      if (!id_agency) return res.status(401).json({ error: "Unauthorized" });

      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const parsed = putSchema.safeParse(body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.message });

      const { default_currency_code, hide_operator_expenses_in_investments } =
        parsed.data;

      await prisma.$transaction(async (tx) => {
        const existing = await tx.financeConfig.findUnique({
          where: { id_agency },
          select: { id_config: true },
        });
        if (existing) {
          await tx.financeConfig.update({
            where: { id_agency },
            data: {
              default_currency_code,
              hide_operator_expenses_in_investments:
                !!hide_operator_expenses_in_investments,
            },
          });
          return;
        }
        const agencyConfigId = await getNextAgencyCounter(
          tx,
          id_agency,
          "finance_config",
        );
        await tx.financeConfig.create({
          data: {
            id_agency,
            agency_finance_config_id: agencyConfigId,
            default_currency_code,
            hide_operator_expenses_in_investments:
              !!hide_operator_expenses_in_investments,
          },
        });
      });

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("[finance/config][PUT]", reqId, e);
      return res.status(500).json({ error: "Error guardando configuración" });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
