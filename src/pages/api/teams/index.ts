// src/pages//api/teams/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    const { name, userIds } = req.body;

    // Validar campos requeridos
    if (!name) {
      return res
        .status(400)
        .json({ error: "El nombre del equipo es obligatorio." });
    }
    if (!Array.isArray(userIds)) {
      return res
        .status(400)
        .json({ error: "Los userIds deben ser un arreglo." });
    }
    // Opcional: Validar duplicados en userIds
    if (new Set(userIds).size !== userIds.length) {
      return res
        .status(400)
        .json({ error: "No se permiten IDs duplicados en los miembros." });
    }

    try {
      const newTeam = await prisma.salesTeam.create({
        data: {
          name,
          user_teams: {
            create: userIds.map((userId: number) => ({
              user: { connect: { id_user: userId } },
            })),
          },
        },
        include: {
          user_teams: { include: { user: true } },
        },
      });
      return res.status(201).json(newTeam);
    } catch (error) {
      console.error(
        "Error al crear el equipo:",
        error instanceof Error ? error.message : error
      );
      return res.status(500).json({ error: "Error al crear el equipo" });
    }
  } else if (req.method === "GET") {
    try {
      const teams = await prisma.salesTeam.findMany({
        include: { user_teams: { include: { user: true } } },
      });
      return res.status(200).json(teams);
    } catch (error) {
      console.error(
        "Error al obtener los equipos:",
        error instanceof Error ? error.message : error
      );
      return res.status(500).json({ error: "Error al obtener los equipos" });
    }
  } else {
    res.setHeader("Allow", ["POST", "GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
