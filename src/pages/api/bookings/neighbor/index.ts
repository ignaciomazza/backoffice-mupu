// src/pages/api/bookings/neighbor/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import prisma from "@/lib/prisma";
import { decodePublicId, encodePublicId } from "@/lib/publicIds";

type DecodedUser = {
  id_user?: number;
  role?: string;
  id_agency?: number;
  email?: string;
};

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

// ───────────────── Handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const AUTH_SOURCE = "api:bookings/neighbor";

  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ── Auth guard (unificado con /api/bookings)
    const user = await getUserFromAuth(req);
    if (!user) {
      res.setHeader("x-auth-source", AUTH_SOURCE);
      res.setHeader("x-auth-reason", "invalid-or-expired-token");
      return res.status(401).json({ error: "Token inválido o expirado" });
    }

    // ── bookingId por query (?bookingId=) con fallback a ?id=
    const bookingIdParamRaw =
      (Array.isArray(req.query.bookingId)
        ? req.query.bookingId[0]
        : req.query.bookingId) ??
      (Array.isArray(req.query.id) ? req.query.id[0] : req.query.id);

    const rawId = bookingIdParamRaw ? String(bookingIdParamRaw) : "";
    const bookingId = Number(rawId);
    const decoded =
      Number.isFinite(bookingId) && bookingId > 0
        ? null
        : decodePublicId(rawId);
    if (decoded && decoded.t !== "booking") {
      return res.status(400).json({ error: "bookingId inválido" });
    }
    if (!decoded && (!Number.isFinite(bookingId) || bookingId <= 0)) {
      return res.status(400).json({ error: "bookingId inválido" });
    }

    if (decoded && decoded.a !== user.id_agency) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    const current = await prisma.booking.findFirst({
      where: decoded
        ? { id_agency: user.id_agency, agency_booking_id: decoded.i }
        : { id_booking: bookingId, id_agency: user.id_agency },
      select: {
        id_booking: true,
        id_agency: true,
        agency_booking_id: true,
      },
    });
    if (!current) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    // ── Autorización por agencia
    const userAgencyId = user.id_agency;
    if (!userAgencyId || userAgencyId !== current.id_agency) {
      res.setHeader("x-auth-source", AUTH_SOURCE);
      res.setHeader("x-auth-reason", "agency-mismatch");
      return res.status(403).json({ error: "No autorizado" });
    }

    // ── Vecinos dentro de la misma agencia
    const orderingField = current.agency_booking_id
      ? "agency_booking_id"
      : "id_booking";

    const prev = await prisma.booking.findFirst({
      where: {
        id_agency: current.id_agency,
        [orderingField]: {
          lt:
            orderingField === "agency_booking_id"
              ? current.agency_booking_id ?? current.id_booking
              : current.id_booking,
        },
      },
      select: { id_booking: true, agency_booking_id: true },
      orderBy: { [orderingField]: "desc" },
    });

    const next = await prisma.booking.findFirst({
      where: {
        id_agency: current.id_agency,
        [orderingField]: {
          gt:
            orderingField === "agency_booking_id"
              ? current.agency_booking_id ?? current.id_booking
              : current.id_booking,
        },
      },
      select: { id_booking: true, agency_booking_id: true },
      orderBy: { [orderingField]: "asc" },
    });

    const prevId =
      prev?.agency_booking_id != null
        ? encodePublicId({
            t: "booking",
            a: current.id_agency,
            i: prev.agency_booking_id,
          })
        : prev?.id_booking ?? null;

    const nextId =
      next?.agency_booking_id != null
        ? encodePublicId({
            t: "booking",
            a: current.id_agency,
            i: next.agency_booking_id,
          })
        : next?.id_booking ?? null;

    return res.status(200).json({
      prevId,
      nextId,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("neighbor error", e);
    return res.status(500).json({ error: "Error interno" });
  }
}
