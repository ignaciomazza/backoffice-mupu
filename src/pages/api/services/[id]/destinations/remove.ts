// src/pages/api/services/destinations/remove.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { z } from "zod";

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
    const { serviceId, destinationId } = Body.parse(req.body);

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
