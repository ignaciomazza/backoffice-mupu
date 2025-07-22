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

  const { userId, clientStatus, from, to } = req.query;
  const whereBooking: Prisma.BookingWhereInput = {};

  if (typeof userId === "string") {
    whereBooking.id_user = Number(userId);
  }

  if (typeof clientStatus === "string" && clientStatus !== "Todas") {
    whereBooking.clientStatus = clientStatus;
  }

  if (typeof from === "string" && typeof to === "string") {
    const fDate = new Date(from);
    const tDate = new Date(to);
    tDate.setHours(23, 59, 59, 999);
    whereBooking.departure_date = { gte: fDate, lte: tDate };
  }

  const bookings = await prisma.booking.findMany({
    where: whereBooking,
    include: { titular: true },
  });

  const bookingEvents = bookings.map((b) => ({
    id: `b-${b.id_booking}`,
    title: `${b.titular.first_name} ${b.titular.last_name}: ${b.details}`,
    start: b.departure_date,
  }));

  const notes = await prisma.calendarNote.findMany({
    include: { creator: { select: { first_name: true, last_name: true } } },
  });
  const noteEvents = notes.map((n) => ({
    id: `n-${n.id}`,
    title: `${n.title}`,
    start: n.date,
    extendedProps: {
      content: n.content,
      creator: `${n.creator.first_name} ${n.creator.last_name}`,
    },
  }));

  return res.status(200).json([...bookingEvents, ...noteEvents]);
}
