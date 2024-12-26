// src/pages/api/bookings/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "ID de reserva inválido." });
  }

  if (req.method === "GET") {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id_booking: Number(id) },
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
          services: true,
        },
      });

      if (!booking) {
        return res.status(404).json({ error: "Reserva no encontrada." });
      }

      return res.status(200).json(booking);
    } catch (error) {
      console.error("Error al obtener la reserva:", error);
      return res.status(500).json({ error: "Error al obtener la reserva." });
    }
  } else if (req.method === "PUT") {
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
      return res.status(400).json({
        error: "Todos los campos obligatorios deben ser completados.",
      });
    }

    try {
      // Validar duplicados en los IDs de acompañantes
      if (clients_ids.includes(titular_id)) {
        return res.status(400).json({
          error: "El titular no puede estar en la lista de acompañantes.",
        });
      }

      const uniqueClients = new Set(clients_ids);
      if (uniqueClients.size !== clients_ids.length) {
        return res
          .status(400)
          .json({ error: "IDs duplicados en los acompañantes." });
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

      // Actualizar la reserva
      const booking = await prisma.booking.update({
        where: { id_booking: Number(id) },
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
            set: clients_ids.map((id: number) => ({ id_client: id })), // Actualizar acompañantes
          },
        },
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
        },
      });

      res.status(200).json(booking);
    } catch (error) {
      console.error("Error actualizando la reserva:", error);
      res.status(500).json({ error: "Error actualizando la reserva." });
    }
  } else if (req.method === "DELETE") {
    try {
      await prisma.booking.delete({ where: { id_booking: Number(id) } });
      res.status(200).json({ message: "Reserva eliminada con éxito." });
    } catch (error) {
      console.error("Error eliminando la reserva:", error);
      res.status(500).json({ error: "Error eliminando la reserva." });
    }
  } else {
    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed.`);
  }
}
