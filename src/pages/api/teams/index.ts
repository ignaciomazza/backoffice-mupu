// src/pages//api/teams/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const { name, userIds } = req.body;

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

      res.status(201).json(newTeam);
    } catch (error) {
      console.error("Error al crear el equipo:", error);
      res.status(500).json({ error: "Error al crear el equipo" });
    }
  } else if (req.method === "GET") {
    // Obtener la lista de equipos existentes
    try {
      const teams = await prisma.salesTeam.findMany({
        include: {
          user_teams: { include: { user: true } },
        },
      });
      res.status(200).json(teams);
    } catch (error) {
      console.error("Error al obtener los equipos:", error);
      res.status(500).json({ error: "Error al obtener los equipos" });
    }
  } else {
    res.setHeader("Allow", ["POST", "GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
