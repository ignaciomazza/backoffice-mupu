// src/pages/api/receipts/[id]/verify.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { decodePublicId } from "@/lib/publicIds";
import { jwtVerify, JWTPayload } from "jose";

type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  email?: string;
};

type DecodedUser = {
  id_user?: number;
  role?: string;
  id_agency?: number;
  email?: string;
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

const ALLOWED_ROLES = new Set(["desarrollador", "gerente", "administrativo"]);

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    if (c[k]) return c[k]!;
  }
  return null;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedUser | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = (p.role || "") as string | undefined;
    const email = p.email;

    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role,
          email: u.email,
        };
    }
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user,
          id_agency: u.id_agency,
          role: role ?? u.role,
          email: email ?? u.email ?? undefined,
        };
    }
    return { id_user, id_agency, role, email };
  } catch {
    return null;
  }
}

function normalizeStatus(raw: unknown): "PENDING" | "VERIFIED" | null {
  const value = String(raw || "")
    .trim()
    .toUpperCase();
  if (value === "PENDING" || value === "VERIFIED") return value;
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", ["PATCH"]);
    return res.status(405).end();
  }

  const authUser = await getUserFromAuth(req);
  const authUserId = authUser?.id_user;
  const authAgencyId = authUser?.id_agency;
  const role = String(authUser?.role || "").toLowerCase();

  if (!authUserId || !authAgencyId) {
    return res.status(401).json({ error: "No autenticado" });
  }

  if (!ALLOWED_ROLES.has(role)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!rawId) {
    return res.status(400).json({ error: "ID invalido" });
  }
  const rawIdStr = String(rawId);
  const parsedId = Number(rawIdStr);
  const decoded =
    Number.isFinite(parsedId) && parsedId > 0
      ? null
      : decodePublicId(rawIdStr);
  if (decoded && decoded.t !== "receipt") {
    return res.status(400).json({ error: "ID invalido" });
  }
  if (!decoded && (!Number.isFinite(parsedId) || parsedId <= 0)) {
    return res.status(400).json({ error: "ID invalido" });
  }

  const status = normalizeStatus((req.body as Record<string, unknown>)?.status);
  if (!status) {
    return res
      .status(400)
      .json({ error: "status invalido (PENDING | VERIFIED)" });
  }

  const receipt = await prisma.receipt.findFirst({
    where: decoded
      ? {
          id_agency: authAgencyId,
          agency_receipt_id: decoded.i,
        }
      : {
          id_receipt: parsedId,
          OR: [
            { id_agency: authAgencyId },
            { booking: { id_agency: authAgencyId } },
          ],
        },
    select: { id_receipt: true },
  });

  if (!receipt) {
    return res.status(404).json({ error: "Recibo no encontrado" });
  }

  const nextData =
    status === "VERIFIED"
      ? {
          verification_status: status,
          verified_at: new Date(),
          verified_by: authUserId,
        }
      : {
          verification_status: status,
          verified_at: null,
          verified_by: null,
        };

  const updated = await prisma.receipt.update({
    where: { id_receipt: receipt.id_receipt },
    data: nextData,
    select: {
      id_receipt: true,
      verification_status: true,
      verified_at: true,
      verified_by: true,
    },
  });

  return res.status(200).json({ receipt: updated });
}
