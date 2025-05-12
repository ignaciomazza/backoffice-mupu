// src/pages/api/receipts/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import { Booking, Service } from "@/types";

const prisma = new PrismaClient();

interface PostReceiptBody {
  booking: Booking;
  concept: string;
  currency: string;
  amountString: string;
  serviceIds: number[];
  amount: number;
  amountCurrency: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // POST: crear un nuevo recibo
  if (req.method === "POST") {
    const {
      booking,
      concept,
      currency,
      amountString,
      serviceIds,
      amount,
      amountCurrency,
    } = req.body as PostReceiptBody;

    // Validación de campos obligatorios
    if (
      !booking ||
      !concept ||
      !currency ||
      !amountString ||
      !serviceIds?.length
    ) {
      return res.status(400).json({
        error:
          "Faltan datos requeridos: booking, concept, currency, amountString, serviceIds, amount",
      });
    }

    // Validar que los IDs existan dentro de booking.services
    const selectedServices = booking.services?.filter((s: Service) =>
      serviceIds.includes(s.id_service),
    );
    if (!selectedServices || selectedServices.length !== serviceIds.length) {
      return res
        .status(400)
        .json({ error: "Algún servicio no fue encontrado en la reserva" });
    }

    try {
      // Contar recibos existentes de esta reserva para numeración secuencial
      const existingCount = await prisma.receipt.count({
        where: { bookingId_booking: booking.id_booking },
      });
      const nextIndex = existingCount + 1;

      // Generación de número de recibo: "{bookingId}-{secuencia}"
      const receiptNumber = `${booking.id_booking}-${nextIndex}`;

      const receipt = await prisma.receipt.create({
        data: {
          receipt_number: receiptNumber,
          amount, // importe manual o calculado
          amount_string: amountString,
          amount_currency: amountCurrency,
          concept,
          currency,
          booking: { connect: { id_booking: booking.id_booking } },
          serviceIds, // campo tipo Int[] en tu esquema Prisma
        },
      });

      return res.status(201).json({ receipt });
    } catch (error: unknown) {
      console.error("Prisma Error al crear recibo:", error);
      return res.status(500).json({ error: "Error guardando recibo" });
    }
  }

  // GET: listar recibos de una reserva (por query bookingId)
  if (req.method === "GET") {
    const bookingId = parseInt(req.query.bookingId as string, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({ error: "bookingId inválido" });
    }

    try {
      const receipts = await prisma.receipt.findMany({
        where: { bookingId_booking: bookingId },
        orderBy: { issue_date: "desc" },
      });
      return res.status(200).json({ receipts });
    } catch (error: unknown) {
      console.error("Prisma Error al listar recibos:", error);
      return res.status(500).json({ error: "Error obteniendo recibos" });
    }
  }

  // Métodos no permitidos
  res.setHeader("Allow", ["POST", "GET"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
