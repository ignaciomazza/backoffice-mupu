// src/pages/api/bookings/neighbor/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const bookingIdParam = req.query.bookingId;
    const bookingId = Number(bookingIdParam);
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: "bookingId inválido" });
    }

    const current = await prisma.booking.findUnique({
      where: { id_booking: bookingId },
      select: { id_booking: true, id_agency: true },
    });
    if (!current)
      return res.status(404).json({ error: "Reserva no encontrada" });

    const prev = await prisma.booking.findFirst({
      where: {
        id_agency: current.id_agency,
        id_booking: { lt: current.id_booking },
      },
      select: { id_booking: true },
      orderBy: { id_booking: "desc" },
    });

    const next = await prisma.booking.findFirst({
      where: {
        id_agency: current.id_agency,
        id_booking: { gt: current.id_booking },
      },
      select: { id_booking: true },
      orderBy: { id_booking: "asc" },
    });

    return res.status(200).json({
      prevId: prev?.id_booking ?? null,
      nextId: next?.id_booking ?? null,
    });
  } catch (e) {
    console.error("neighbor error", e);
    return res.status(500).json({ error: "Error interno" });
  }
}
