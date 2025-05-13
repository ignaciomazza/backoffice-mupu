// src/pages/api/receipts/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // -- Logs de entrada --
  console.log("=== Receipts API llamado ===");
  console.log("Método:", req.method);
  console.log("Body inicial:", req.body);

  try {
    if (req.method === "POST") {
      // 1) valida que venga un JSON
      if (!req.body || typeof req.body !== "object") {
        console.log("Body inválido o vacío:", req.body);
        return res.status(400).json({ error: "Body inválido o vacío" });
      }

      // 2) extrae y loguea el payload
      const {
        booking,
        concept,
        currency,
        amountString,
        amountCurrency,
        serviceIds,
        amount,
      } = req.body as {
        booking: { id_booking: number; services?: { id_service: number }[] };
        concept: string;
        currency: string;
        amountString: string;
        amountCurrency: string;
        serviceIds: number[];
        amount: number;
      };
      console.log("Payload parseado:", {
        booking: { id_booking: booking?.id_booking },
        concept,
        currency,
        amountString,
        amountCurrency,
        serviceIds,
        amount,
      });

      // 3) valida campos obligatorios
      if (
        !booking?.id_booking ||
        !concept ||
        !currency ||
        !amountString ||
        !serviceIds?.length
      ) {
        console.log("Validación de campos fallida:", {
          bookingId: booking?.id_booking,
          concept,
          currency,
          amountString,
          serviceIds,
        });
        return res.status(400).json({
          error:
            "Faltan datos requeridos: booking.id_booking, concept, currency, amountString, serviceIds",
        });
      }

      // 4) valida que cada serviceId exista en booking.services (opcional)
      const serviciosEnBooking = booking.services;
      if (
        serviciosEnBooking &&
        serviceIds.some(
          (id) => !serviciosEnBooking.find((s) => s.id_service === id),
        )
      ) {
        console.log("ServiceId no encontrado en booking.services", {
          serviceIds,
          serviciosEnBooking,
        });
        return res
          .status(400)
          .json({ error: "Algún servicio no pertenece a la reserva" });
      }

      // 5) calcula el próximo índice de recibo buscando los existentes
      const existing = await prisma.receipt.findMany({
        where: { receipt_number: { startsWith: `${booking.id_booking}-` } },
        select: { receipt_number: true },
      });
      const used = existing.map((r) => {
        const parts = r.receipt_number.split("-");
        return parseInt(parts[1], 10) || 0;
      });
      const nextIdx = used.length ? Math.max(...used) + 1 : 1;
      const receiptNumber = `${booking.id_booking}-${nextIdx}`;
      console.log("Nuevo receipt_number:", receiptNumber);

      // 6) crea en la base
      console.log("Antes de prisma.receipt.create:", {
        receiptNumber,
        amount,
        amountString,
        amountCurrency,
        concept,
        currency,
        serviceIds,
      });
      const receipt = await prisma.receipt.create({
        data: {
          receipt_number: receiptNumber,
          amount,
          amount_string: amountString,
          amount_currency: amountCurrency,
          concept,
          currency,
          booking: { connect: { id_booking: booking.id_booking } },
          serviceIds,
        },
      });
      console.log("Después de create:", receipt);

      return res.status(201).json({ receipt });
    } else if (req.method === "GET") {
      console.log("=== GET recibos para bookingId:", req.query.bookingId);
      const bookingId = parseInt(req.query.bookingId as string, 10);
      if (isNaN(bookingId)) {
        console.log("bookingId inválido:", req.query.bookingId);
        return res.status(400).json({ error: "bookingId inválido" });
      }
      const receipts = await prisma.receipt.findMany({
        where: { bookingId_booking: bookingId },
        orderBy: { issue_date: "desc" },
      });
      console.log("Receipts encontrados:", receipts);
      return res.status(200).json({ receipts });
    } else {
      console.log("Método no permitido:", req.method);
      res.setHeader("Allow", ["POST", "GET"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (err: unknown) {
    // -- Log de error --
    console.log("Error en receipts API:", (err as Error)?.message ?? err);
    return res
      .status(500)
      .json({
        error: (err as Error)?.message ?? "Error interno al procesar recibo",
      });
  }
}
