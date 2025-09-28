// src/pages/api/services/[id]/destinations/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = Number(req.query.id ?? "");
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "serviceId inválido" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const exists = await prisma.service.findUnique({
    where: { id_service: id },
    select: { id_service: true },
  });
  if (!exists) return res.status(404).json({ error: "Servicio no encontrado" });

  const items = await prisma.serviceDestination.findMany({
    where: { service_id: id },
    orderBy: { added_at: "asc" }, // si luego agregamos `position`, cambiamos aquí
    include: {
      destination: {
        select: {
          id_destination: true,
          name: true,
          slug: true,
          country: { select: { id_country: true, name: true, iso2: true } },
        },
      },
    },
  });

  return res.status(200).json({
    serviceId: id,
    count: items.length,
    items: items.map((x) => ({
      destinationId: x.destination_id,
      name: x.destination.name,
      slug: x.destination.slug,
      country: x.destination.country,
      added_at: x.added_at,
    })),
  });
}
