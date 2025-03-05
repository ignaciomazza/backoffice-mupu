// src/pages/api/bookings/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    try {
      const bookings = await prisma.booking.findMany({
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
          services: {
            include: {
              operator: true,
            },
          },
        },
      });
      return res.status(200).json(bookings);
    } catch (error) {
      console.error(
        "Error fetching bookings:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error fetching bookings" });
    }
  } else if (req.method === "POST") {
    const {
      status,
      details,
      titular_id,
      id_agency,
      departure_date,
      return_date,
      observation,
      pax_count,
      clients_ids,
      id_user,
    } = req.body;

    // Validación de campos obligatorios
    if (
      !status ||
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
        select: { id_client: true },
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

      // Convertir y validar las fechas
      const parsedDeparture = new Date(departure_date);
      const parsedReturn = new Date(return_date);
      if (isNaN(parsedDeparture.getTime()) || isNaN(parsedReturn.getTime())) {
        return res.status(400).json({ error: "Fechas inválidas." });
      }

      const booking = await prisma.booking.create({
        data: {
          status,
          details,
          titular: { connect: { id_client: titular_id } },
          user: { connect: { id_user } },
          agency: { connect: { id_agency } },
          departure_date: parsedDeparture,
          return_date: parsedReturn,
          observation,
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
