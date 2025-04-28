// src/pages/api/services/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
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
      currency,
      departure_date,
      return_date,
      id_operator,
      booking_id,
      nonComputable,
      taxableBase21,
      taxableBase10_5,
      commissionExempt,
      commission21,
      commission10_5,
      vatOnCommission21,
      vatOnCommission10_5,
      totalCommissionWithoutVAT,
      impIVA,
      card_interest,
      card_interest_21,
      taxableCardInterest,
      vatOnCardInterest,
    } = req.body;

    if (
      !type ||
      sale_price === undefined ||
      cost_price === undefined ||
      !id_operator ||
      !booking_id
    ) {
      return res.status(400).json({
        error:
          "Faltan campos obligatorios: tipo, precios, moneda o ID de reserva.",
      });
    }

    // Parseamos las fechas
    const parsedDepartureDate = new Date(departure_date);
    const parsedReturnDate = new Date(return_date);

    // Verificamos que exista la reserva y el operador
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

    try {
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
          currency,
          departure_date: parsedDepartureDate,
          return_date: parsedReturnDate,
          booking: { connect: { id_booking: Number(booking_id) } },
          operator: { connect: { id_operator: Number(id_operator) } },
          nonComputable: nonComputable || null,
          taxableBase21: taxableBase21 || null,
          taxableBase10_5: taxableBase10_5 || null,
          commissionExempt: commissionExempt || null,
          commission21: commission21 || null,
          commission10_5: commission10_5 || null,
          vatOnCommission21: vatOnCommission21 || null,
          vatOnCommission10_5: vatOnCommission10_5 || null,
          totalCommissionWithoutVAT: totalCommissionWithoutVAT || null,
          impIVA: impIVA || null,
          card_interest: card_interest || null,
          card_interest_21: card_interest_21 || null,
          taxableCardInterest: taxableCardInterest || null,
          vatOnCardInterest: vatOnCardInterest || null,
        },
        include: { booking: true, operator: true },
      });

      return res.status(201).json(service);
    } catch (error) {
      console.error("Error al crear servicio:", error);
      // Ejemplo de manejo de error para duplicados con Prisma (código P2002)
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
