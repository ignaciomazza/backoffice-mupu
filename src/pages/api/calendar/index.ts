// src/pages/api/calendar/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Desestructuramos userId (single) y userIds (CSV)
  const { userId, userIds, clientStatus, from, to } = req.query;
  const whereBooking: Prisma.BookingWhereInput = {};

  // 1) Si viene userIds (p.ej. "5,12,27"), filtramos con IN
  if (typeof userIds === "string") {
    const ids = userIds
      .split(",")
      .map((idStr) => parseInt(idStr, 10))
      .filter((n) => !isNaN(n));
    if (ids.length) {
      whereBooking.id_user = { in: ids };
    }
  }
  // 2) Si viene solo un userId, filtramos por igualdad
  else if (typeof userId === "string") {
    const idNum = parseInt(userId, 10);
    if (!isNaN(idNum)) {
      whereBooking.id_user = idNum;
    }
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

  // Traemos las reservas ya filtradas
  const bookings = await prisma.booking.findMany({
    where: whereBooking,
    include: { titular: true },
  });

  const bookingEvents = bookings.map((b) => ({
    id: `b-${b.id_booking}`,
    title: `${b.titular.first_name} ${b.titular.last_name}: ${b.details}`,
    start: b.departure_date,
  }));

  // Notas siempre completas
  const notes = await prisma.calendarNote.findMany({
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
}
