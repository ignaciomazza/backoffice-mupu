// src/pages/api/resources/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "POST") {
    const { title } = req.body;

    try {
      const newResource = await prisma.resources.create({
        data: {
          title,
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
  } else if (req.method === "GET") {
    try {
      const resources = await prisma.resources.findMany();
      return res.status(200).json(resources);
    } catch (error) {
      console.error(
        "Error fetching resources:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error al obtener recursos" });
    }
  } else {
    res.setHeader("Allow", ["POST", "GET"]);
    return res.status(405).end(`Método ${req.method} no permitido`);
  }
}
