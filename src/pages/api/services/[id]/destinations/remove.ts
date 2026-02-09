// src/pages/api/services/destinations/remove.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";
import { canAccessBookingByRole } from "@/lib/accessControl";

const Body = z.object({
  serviceId: z.number().int().positive(),
  destinationId: z.number().int().positive(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const auth = await resolveAuth(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { serviceId, destinationId } = Body.parse(req.body);
    const routeServiceId = Number(req.query.id ?? "");
    if (
      Number.isFinite(routeServiceId) &&
      routeServiceId > 0 &&
      routeServiceId !== serviceId
    ) {
      return res.status(400).json({ error: "serviceId inválido" });
    }

    const service = await prisma.service.findFirst({
      where: { id_service: serviceId, id_agency: auth.id_agency },
      select: { id_service: true, booking: { select: { id_user: true } } },
    });
    if (!service) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }
    const allowed = await canAccessBookingByRole(auth, {
      id_user: service.booking.id_user,
      id_agency: auth.id_agency,
    });
    if (!allowed) return res.status(403).json({ error: "No autorizado." });

    await prisma.serviceDestination.delete({
      where: {
        service_id_destination_id: {
          service_id: serviceId,
          destination_id: destinationId,
        },
      },
    });

    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    // Si no existe, Prisma tira error — lo tratamos como 404
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("Record to delete does not exist")) {
      return res.status(404).json({ error: "Relación no encontrada" });
    }
    return res.status(400).json({ error: msg });
  }
}
