// src/pages/api/bookings/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
              operator: true, // Incluye la información completa del operador
            },
          },
        },
      });
      res.status(200).json(bookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Error fetching bookings" });
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

    // Validación inicial
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
      // Validar duplicados en los IDs de acompañantes
      if (clients_ids.includes(titular_id)) {
        return res.status(400).json({
          error: "El titular no puede estar en la lista de acompañantes",
        });
      }

      const uniqueClients = new Set(clients_ids);
      if (uniqueClients.size !== clients_ids.length) {
        return res
          .status(400)
          .json({ error: "IDs duplicados en los acompañantes" });
      }

      // Validar existencia de todos los IDs en la base de datos
      const allClientIds = [titular_id, ...clients_ids];
      const existingClients = await prisma.client.findMany({
        where: { id_client: { in: allClientIds } },
        select: { id_client: true },
      });

      const existingClientIds = existingClients.map(
        (client) => client.id_client
      );
      const missingIds = allClientIds.filter(
        (id) => !existingClientIds.includes(id)
      );

      if (missingIds.length > 0) {
        return res.status(400).json({
          error: `IDs no válidos: ${missingIds.join(", ")}`,
        });
      }

      // Crear la reserva
      const booking = await prisma.booking.create({
        data: {
          status,
          details,
          titular: { connect: { id_client: titular_id } },
          user: { connect: { id_user } },
          agency: { connect: { id_agency } },
          departure_date: new Date(departure_date),
          return_date: new Date(return_date),
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

      res.status(201).json(booking);
    } catch (error) {
      console.error("Error creando la reserva:", error);

      // Detectar errores específicos
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return res.status(400).json({ error: "Datos duplicados detectados" });
        }
      }

      res.status(500).json({ error: "Error creando la reserva" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
