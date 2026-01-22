// src/pages/api/calendar/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { encodePublicId } from "@/lib/publicIds";

/** ====== Auth local al endpoint (sin helpers externos) ====== */
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
  // 1) Cookie "token" (lo más estable en prod)
  if (req.cookies?.token) return req.cookies.token;

  // 2) Authorization: Bearer <token>
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  // 3) Otros nombres de cookie comunes (compat)
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

async function getUserFromAuth(req: NextApiRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    // intentar obtener id_user / id_agency directamente del token
    let id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    let id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    let role = (p.role || "").toString();
    const email = p.email;

    // Completar agency si falta (por id_user)
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u) {
        id_agency = u.id_agency;
        if (!role) role = u.role;
      }
    }

    // Completar id_user por email si faltara (poco común, pero útil)
    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true },
      });
      if (u) {
        id_user = u.id_user;
        if (!id_agency) id_agency = u.id_agency;
        if (!role) role = u.role;
      }
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role };
  } catch {
    return null;
  }
}
/** ============================================================ */

function toDateAtStart(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (isNaN(+d)) return undefined;
  d.setHours(0, 0, 0, 0);
  return d;
}
function toDateAtEnd(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (isNaN(+d)) return undefined;
  d.setHours(23, 59, 59, 999);
  return d;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // coherencia con el resto de tu API: solo GET
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // evitar que algún proxy navegue con caché
  res.setHeader("Cache-Control", "no-store");

  try {
    const auth = await getUserFromAuth(req);
    if (!auth?.id_user || !auth.id_agency) {
      return res.status(401).json({ error: "No autenticado o token inválido" });
    }

    const { id_agency } = auth;

    // --------- parámetros ---------
    const { userId, userIds, clientStatus, from, to } = req.query;

    const whereBooking: Prisma.BookingWhereInput = { id_agency };

    // userIds CSV (p.ej. "5,12,27")
    if (typeof userIds === "string") {
      const ids = userIds
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n));
      if (ids.length) whereBooking.id_user = { in: ids };
    } else if (typeof userId === "string") {
      const n = parseInt(userId, 10);
      if (Number.isFinite(n)) whereBooking.id_user = n;
    }

    // estado de pax (siempre dentro de la agencia)
    if (typeof clientStatus === "string" && clientStatus !== "Todas") {
      whereBooking.clientStatus = clientStatus;
    }

    // rango por fecha de partida — extremos independientes
    const gte = toDateAtStart(typeof from === "string" ? from : undefined);
    const lte = toDateAtEnd(typeof to === "string" ? to : undefined);
    if (gte || lte) {
      whereBooking.departure_date = {
        ...(gte ? { gte } : {}),
        ...(lte ? { lte } : {}),
      };
    }

    // --------- datos ---------
    const bookings = await prisma.booking.findMany({
      where: whereBooking,
      include: { titular: true },
    });

    const bookingEvents = bookings.map((b) => {
      const publicId =
        b.agency_booking_id != null
          ? encodePublicId({
              t: "booking",
              a: b.id_agency,
              i: b.agency_booking_id,
            })
          : null;
      return {
        id: `b-${publicId ?? b.id_booking}`,
        title: `${b.titular.first_name} ${b.titular.last_name}: ${b.details}`,
        start: b.departure_date,
      };
    });

    // Notas de la misma agencia (se une por el creador)
    const notes = await prisma.calendarNote.findMany({
      where: { creator: { id_agency } },
      include: { creator: { select: { first_name: true, last_name: true } } },
    });

    const noteEvents = notes.map((n) => ({
      id: `n-${n.id}`,
      title: n.title,
      start: n.date,
      extendedProps: {
        content: n.content,
        creator: `${n.creator.first_name} ${n.creator.last_name}`,
      },
    }));

    return res.status(200).json([...bookingEvents, ...noteEvents]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return res.status(500).json({ error: msg });
  }
}
