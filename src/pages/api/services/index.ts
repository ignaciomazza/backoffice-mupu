// src/pages/api/services/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    const { bookingId, page = 1, limit = 10 } = req.query;

    if (!bookingId || Array.isArray(bookingId)) {
      return res.status(400).json({ error: "ID de reserva inválido" });
    }

    try {
      const services = await prisma.service.findMany({
        where: { booking_id: Number(bookingId) },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { booking: true, operator: true },
      });

      const total = await prisma.service.count({
        where: { booking_id: Number(bookingId) },
      });

      return res.status(200).json({ services, total });
    } catch (error) {
      console.error("Error al obtener servicios:", error);
      return res.status(500).json({ error: "Error al obtener servicios." });
    }
  } else if (req.method === "POST") {
    const {
      type,
      description,
      sale_price,
      cost_price,
      destination,
      reference,
      tax_21,
      tax_105,
      exempt,
      other_taxes,
      not_computable,
      taxable_21,
      taxable_105,
      currency,
      payment_due_date,
      departure_date,
      return_date,
      id_operator,
      booking_id,
    } = req.body;

    try {
      if (
        !type ||
        sale_price === undefined ||
        cost_price === undefined ||
        !id_operator ||
        !payment_due_date ||
        !booking_id
      ) {
        return res.status(400).json({
          error:
            "Faltan campos obligatorios: tipo, precios, moneda, fecha de pago o ID de reserva.",
        });
      }

      const parsedPaymentDueDate = new Date(payment_due_date);
      const parsedDepartureDate = departure_date
        ? new Date(departure_date)
        : null;
      const parsedReturnDate = return_date ? new Date(return_date) : null;

      if (isNaN(parsedPaymentDueDate.getTime())) {
        return res.status(400).json({ error: "Fecha de pago no válida." });
      }

      const bookingExists = await prisma.booking.findUnique({
        where: { id_booking: Number(booking_id) },
      });
      if (!bookingExists) {
        return res.status(404).json({ error: "Reserva no encontrada." });
      }

      const operatorExists = await prisma.operator.findUnique({
        where: { id_operator: Number(id_operator) },
      });
      if (!operatorExists) {
        return res.status(404).json({ error: "Operador no encontrado." });
      }

      const service = await prisma.service.create({
        data: {
          type,
          description: description || null,
          sale_price,
          cost_price,
          destination: destination || "",
          reference: reference || "",
          tax_21: tax_21 || null,
          tax_105: tax_105 || null,
          exempt: exempt || null,
          other_taxes: other_taxes || null,
          not_computable: not_computable || null,
          taxable_21: taxable_21 || null,
          taxable_105: taxable_105 || null,
          currency,
          payment_due_date: parsedPaymentDueDate,
          departure_date: parsedDepartureDate,
          return_date: parsedReturnDate,
          booking: { connect: { id_booking: Number(booking_id) } },
          operator: { connect: { id_operator: Number(id_operator) } },
        },
        include: { booking: true, operator: true }, // Incluye operador
      });

      return res.status(201).json(service);
    } catch (error) {
      console.error("Error al crear servicio:", error);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return res.status(400).json({
            error: "Datos duplicados detectados en la base de datos.",
          });
        }
      }

      return res.status(500).json({ error: "Error al crear servicio." });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Método ${req.method} no permitido.`);
  }
}
