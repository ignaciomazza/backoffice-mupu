// src/pages/api/calendar/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { jwtVerify, type JWTPayload } from "jose";

/** ----------------- helpers multi-agencia ----------------- */
type MyJWTPayload = JWTPayload & { userId?: number; id_user?: number };

async function resolveUserFromRequest(
  req: NextApiRequest,
): Promise<{ id_user: number; id_agency: number; role: string }> {
  // 1) Header inyectado por middleware
  const h = req.headers["x-user-id"];
  const uidFromHeader =
    typeof h === "string"
      ? parseInt(h, 10)
      : Array.isArray(h)
        ? parseInt(h[0] ?? "", 10)
        : NaN;
  let uid: number | null =
    Number.isFinite(uidFromHeader) && uidFromHeader > 0 ? uidFromHeader : null;

  // 2) Authorization / Cookie
  if (!uid) {
    let token: string | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) token = auth.slice(7);
    if (!token) {
      const cookieToken = req.cookies?.token;
      if (typeof cookieToken === "string" && cookieToken.length > 0) {
        token = cookieToken;
      }
    }
    if (token) {
      try {
        const secret = process.env.JWT_SECRET || "tu_secreto_seguro";
        const { payload } = await jwtVerify(
          token,
          new TextEncoder().encode(secret),
        );
        const p = payload as MyJWTPayload;
        uid = Number(p.userId ?? p.id_user ?? 0) || null;
      } catch {
        uid = null;
      }
    }
  }

  if (!uid) throw new Error("No se pudo resolver el usuario.");

  const user = await prisma.user.findUnique({
    where: { id_user: uid },
    select: { id_user: true, id_agency: true, role: true },
  });
  if (!user?.id_agency)
    throw new Error("El usuario no tiene agencia asociada.");

  return { id_user: user.id_user, id_agency: user.id_agency, role: user.role };
}
/** --------------------------------------------------------- */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { id_agency } = await resolveUserFromRequest(req);

    // Desestructuramos userId (single) y userIds (CSV)
    const { userId, userIds, clientStatus, from, to } = req.query;
    const whereBooking: Prisma.BookingWhereInput = { id_agency };

    // 1) Si viene userIds (p.ej. "5,12,27"), filtramos con IN
    if (typeof userIds === "string") {
      const ids = userIds
        .split(",")
        .map((idStr) => parseInt(idStr, 10))
        .filter((n) => !isNaN(n));
      if (ids.length) whereBooking.id_user = { in: ids };
    }
    // 2) Si viene solo un userId, filtramos por igualdad
    else if (typeof userId === "string") {
      const idNum = parseInt(userId, 10);
      if (!isNaN(idNum)) whereBooking.id_user = idNum;
    }

    // Filtrado por estado de cliente
    if (typeof clientStatus === "string" && clientStatus !== "Todas") {
      whereBooking.clientStatus = clientStatus;
    }

    // Filtrado por rango de fechas
    if (typeof from === "string" && typeof to === "string") {
      const fDate = new Date(from);
      const tDate = new Date(to);
      tDate.setHours(23, 59, 59, 999);
      whereBooking.departure_date = { gte: fDate, lte: tDate };
    }

    // Traemos las reservas de la agencia
    const bookings = await prisma.booking.findMany({
      where: whereBooking,
      include: { titular: true },
    });

    const bookingEvents = bookings.map((b) => ({
      id: `b-${b.id_booking}`,
      title: `${b.titular.first_name} ${b.titular.last_name}: ${b.details}`,
      start: b.departure_date,
    }));

    // Notas SOLO de la misma agencia (vía relación al creador)
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
    return res.status(400).json({ error: msg });
  }
}
