// src/pages/api/agency/transfer-fee/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";

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

const JWT_SECRET = process.env.JWT_SECRET!;
const DEFAULT_TRANSFER_PCT = 0.024; // fallback si no hay nada en DB

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const a = req.headers.authorization || "";
  if (a.startsWith("Bearer ")) return a.slice(7);
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = (req.cookies as Record<string, string | undefined>)?.[k];
    if (v) return v;
  }
  return null;
}

async function getAuth(req: NextApiRequest) {
  const tok = getTokenFromRequest(req);
  if (!tok) return null;
  const { payload } = await jwtVerify(
    tok,
    new TextEncoder().encode(JWT_SECRET),
  );
  const p = payload as TokenPayload;

  const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
  const role = String(p.role ?? "").toLowerCase();

  if (!id_agency) return null;
  return { id_agency, role };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: "No autenticado" });

    if (req.method === "GET") {
      const agency = await prisma.agency.findUnique({
        where: { id_agency: auth.id_agency },
        select: { transfer_fee_pct: true },
      });

      const pct =
        agency?.transfer_fee_pct != null
          ? Number(agency.transfer_fee_pct)
          : DEFAULT_TRANSFER_PCT;

      return res.status(200).json({ transfer_fee_pct: pct });
    }

    if (req.method === "PUT") {
      // Solo perfiles con permisos
      if (!["gerente", "administrativo", "desarrollador"].includes(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      const body = req.body ?? {};
      // Acepta "2.4" (porcentaje) o "0.024" (proporción) —nos quedamos con proporción
      let pct = Number(body.transfer_fee_pct);
      if (!Number.isFinite(pct)) {
        return res.status(400).json({ error: "transfer_fee_pct inválido" });
      }
      // Si viene en % (>=1), lo paso a proporción
      if (pct > 1) pct = pct / 100;

      const updated = await prisma.agency.update({
        where: { id_agency: auth.id_agency },
        data: { transfer_fee_pct: pct },
        select: { transfer_fee_pct: true },
      });

      return res
        .status(200)
        .json({ transfer_fee_pct: Number(updated.transfer_fee_pct) });
    }

    res.setHeader("Allow", ["GET", "PUT"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (e) {
    console.error("[agency-settings]", e);
    return res.status(500).json({ error: "Error en agency-settings" });
  }
}
