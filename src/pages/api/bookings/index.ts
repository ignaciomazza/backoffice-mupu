// src/pages/api/bookings/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // GET /api/bookings
  if (req.method === "GET") {
    try {
      // 1) Obtener userId igual que antes
      const userId = Array.isArray(req.query.userId)
        ? Number(req.query.userId[0])
        : req.query.userId
          ? Number(req.query.userId)
          : null;

      // 2) Parsear filtros mínimos
      const parseCSV = (v?: string | string[]) =>
        !v
          ? undefined
          : (Array.isArray(v) ? v.join(",") : v)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
      const clientStatusArr = parseCSV(req.query.clientStatus);
      const operatorStatusArr = parseCSV(req.query.operatorStatus);
      const from =
        typeof req.query.from === "string"
          ? new Date(req.query.from)
          : undefined;
      const to =
        typeof req.query.to === "string" ? new Date(req.query.to) : undefined;

      // 3) Construir where (añadir sólo si existen)
      const where: Prisma.BookingWhereInput = {};
      if (userId) where.id_user = userId;
      if (clientStatusArr?.length) {
        where.clientStatus = { in: clientStatusArr };
      }
      if (operatorStatusArr?.length) {
        where.operatorStatus = { in: operatorStatusArr };
      }
      if (from && to) {
        where.creation_date = { gte: from, lte: to };
      }

      // 4) Query original + Receipt para deuda
      const bookings = await prisma.booking.findMany({
        where,
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
          services: { include: { operator: true } },
          invoices: true,
          Receipt: true, // <— añadimos recibos
        },
      });

      // 5) Calcular totales y deuda
      const enhanced = bookings.map((b) => {
        const totalSale = b.services.reduce((sum, s) => sum + s.sale_price, 0);
        const totalCommission = b.services.reduce(
          (sum, s) => sum + (s.totalCommissionWithoutVAT ?? 0),
          0,
        );
        const totalReceipts = b.Receipt.reduce((sum, r) => sum + r.amount, 0);
        const debt = totalSale - totalReceipts;

        return {
          ...b,
          totalSale,
          totalCommission,
          debt,
        };
      });

      return res.status(200).json(enhanced);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      return res.status(500).json({ error: "Error fetching bookings" });
    }
  } else if (req.method === "POST") {
    const {
      clientStatus,
      operatorStatus,
      status,
      details,
      invoice_type,
      invoice_observation,
      observation,
      titular_id,
      id_agency,
      departure_date,
      return_date,
      pax_count,
      clients_ids,
      id_user,
    } = req.body;

    // Validación de campos obligatorios para la reserva
    if (
      !clientStatus ||
      !operatorStatus ||
      !status ||
      !details ||
      !invoice_type ||
      !invoice_observation ||
      !titular_id ||
      !id_agency ||
      !departure_date ||
      !return_date ||
      !id_user
    ) {
      return res
        .status(400)
        .json({ error: "Todos los campos obligatorios deben ser completados" });
    }

    try {
      // Validar que el titular no esté en la lista de acompañantes
      if (clients_ids.includes(titular_id)) {
        return res.status(400).json({
          error: "El titular no puede estar en la lista de acompañantes",
        });
      }

      // Validar duplicados en los IDs de acompañantes
      const uniqueClients = new Set(clients_ids);
      if (uniqueClients.size !== clients_ids.length) {
        return res
          .status(400)
          .json({ error: "IDs duplicados en los acompañantes" });
      }

      // Verificar existencia de todos los IDs en la BD
      const allClientIds = [titular_id, ...clients_ids];
      const existingClients = await prisma.client.findMany({
        where: { id_client: { in: allClientIds } },
        select: {
          id_client: true,
          address: true,
          postal_code: true,
          locality: true,
        },
      });
      const existingClientIds = existingClients.map(
        (client) => client.id_client,
      );
      const missingIds = allClientIds.filter(
        (id) => !existingClientIds.includes(id),
      );
      if (missingIds.length > 0) {
        return res.status(400).json({
          error: `IDs no válidos: ${missingIds.join(", ")}`,
        });
      }

      // Verificar que el titular tenga dirección, código postal y localidad
      const titularClient = existingClients.find(
        (client) => client.id_client === titular_id,
      );
      if (
        !titularClient ||
        !titularClient.address ||
        !titularClient.postal_code ||
        !titularClient.locality
      ) {
        return res.status(400).json({
          error:
            "El cliente titular debe tener dirección, código postal y localidad para asociarse a la reserva.",
        });
      }

      // Convertir y validar las fechas
      const parsedDeparture = new Date(departure_date);
      const parsedReturn = new Date(return_date);
      if (isNaN(parsedDeparture.getTime()) || isNaN(parsedReturn.getTime())) {
        return res.status(400).json({ error: "Fechas inválidas." });
      }

      const booking = await prisma.booking.create({
        data: {
          clientStatus,
          operatorStatus,
          status,
          details,
          invoice_type,
          invoice_observation,
          observation,
          titular: { connect: { id_client: titular_id } },
          user: { connect: { id_user } },
          agency: { connect: { id_agency } },
          departure_date: parsedDeparture,
          return_date: parsedReturn,
          pax_count,
          clients: {
            connect: clients_ids.map((id: number) => ({ id_client: id })),
          },
        },
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
        },
      });

      return res.status(201).json(booking);
    } catch (error) {
      console.error(
        "Error creando la reserva:",
        error instanceof Error ? error.message : error,
      );
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return res.status(400).json({ error: "Datos duplicados detectados" });
      }
      return res.status(500).json({ error: "Error creando la reserva" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
