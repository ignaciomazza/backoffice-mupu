// src/pages/api/bookings/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "N° de reserva inválido." });
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
      console.error(
        "Error al obtener la reserva:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error al obtener la reserva." });
    }
  } else if (req.method === "PUT") {
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
      return res.status(400).json({
        error: "Todos los campos obligatorios deben ser completados.",
      });
    }

    try {
      // Validar que el titular no esté en la lista de acompañantes
      if (clients_ids.includes(titular_id)) {
        return res.status(400).json({
          error: "El titular no puede estar en la lista de acompañantes.",
        });
      }

      // Validar duplicados en los IDs de acompañantes
      const uniqueClients = new Set(clients_ids);
      if (uniqueClients.size !== clients_ids.length) {
        return res
          .status(400)
          .json({ error: "IDs duplicados en los acompañantes." });
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

      const booking = await prisma.booking.update({
        where: { id_booking: Number(id) },
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
            set: clients_ids.map((id: number) => ({ id_client: id })),
          },
        },
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
        },
      });

      return res.status(200).json(booking);
    } catch (error) {
      console.error(
        "Error actualizando la reserva:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error actualizando la reserva." });
    }
  } else if (req.method === "DELETE") {
    try {
      await prisma.booking.delete({ where: { id_booking: Number(id) } });
      return res.status(200).json({ message: "Reserva eliminada con éxito." });
    } catch (error) {
      console.error(
        "Error eliminando la reserva:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error eliminando la reserva." });
    }
  } else {
    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
