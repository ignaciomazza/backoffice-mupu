// src/pages/api/credit-notes/[id].ts

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { decodePublicId, encodePublicId } from "@/lib/publicIds";
import { jwtVerify, type JWTPayload } from "jose";
import { getBookingComponentGrants } from "@/lib/accessControl";
import { canAccessBookingComponent } from "@/utils/permissions";

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
  id_agency?: number;
  role?: string;
  email?: string;
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

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
    const role = p.role;
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // console.info(`[CreditNotes API] ${req.method} ${req.url}`);

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ success: false, message: "No autenticado" });
  }
  const bookingGrants = await getBookingComponentGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canBilling = canAccessBookingComponent(
    auth.role,
    bookingGrants,
    "billing",
  );
  if (!canBilling) {
    return res.status(403).json({ success: false, message: "Sin permisos" });
  }

  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!rawId) {
    return res.status(400).json({ success: false, message: "ID inválido" });
  }
  const rawIdStr = String(rawId);
  const parsedId = Number(rawIdStr);
  const decoded =
    Number.isFinite(parsedId) && parsedId > 0
      ? null
      : decodePublicId(rawIdStr);
  if (decoded && decoded.t !== "credit_note") {
    return res.status(400).json({ success: false, message: "ID inválido" });
  }
  if (!decoded && (!Number.isFinite(parsedId) || parsedId <= 0)) {
    return res.status(400).json({ success: false, message: "ID inválido" });
  }
  if (decoded && decoded.a !== auth.id_agency) {
    return res.status(404).json({ success: false, message: "ID inválido" });
  }

  const creditNote = await prisma.creditNote.findFirst({
    where: decoded
      ? { id_agency: decoded.a, agency_credit_note_id: decoded.i }
      : { id_credit_note: parsedId, id_agency: auth.id_agency },
    include: {
      items: true,
      invoice: {
        include: {
          booking: {
            include: {
              titular: true,
              agency: true,
            },
          },
          client: {
            select: { first_name: true, last_name: true },
          },
        },
      },
    },
  });

  if (!creditNote) {
    return res
      .status(404)
      .json({ success: false, message: "Nota de crédito no encontrada" });
  }

  const public_id =
    creditNote.agency_credit_note_id != null
      ? encodePublicId({
          t: "credit_note",
          a: creditNote.id_agency,
          i: creditNote.agency_credit_note_id,
        })
      : null;

  return res
    .status(200)
    .json({ success: true, creditNote: { ...creditNote, public_id } });
}
