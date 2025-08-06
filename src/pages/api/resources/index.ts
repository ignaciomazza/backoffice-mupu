// src/pages/api/resources/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const raw = req.query.agencyId;
    const agencyId = Array.isArray(raw) ? Number(raw[0]) : Number(raw);

    if (Number.isNaN(agencyId)) {
      return res
        .status(400)
        .json({ error: "El parámetro agencyId debe ser un número válido." });
    }

    try {
      const resources = await prisma.resources.findMany({
        where: { id_agency: agencyId },
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json(resources);
    } catch (error) {
      console.error(
        "Error fetching resources:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error al obtener recursos" });
    }
  }

  if (req.method === "POST") {
    const { title, id_agency } = req.body;

    if (!title || typeof id_agency !== "number") {
      return res
        .status(400)
        .json({ error: "Title y id_agency son obligatorios." });
    }

    try {
      const newResource = await prisma.resources.create({
        data: {
          title,
          id_agency,
        },
      });
      return res.status(201).json(newResource);
    } catch (error) {
      console.error(
        "Error creating resource:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error al crear el recurso" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Método ${req.method} no permitido`);
}
