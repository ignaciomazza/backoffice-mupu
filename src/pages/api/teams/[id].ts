// src/pages//api/teams/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  const { method } = req;

  switch (method) {
    case "GET":
      try {
        const team = await prisma.salesTeam.findUnique({
          where: { id_team: Number(id) },
          include: {
            user_teams: {
              include: { user: true },
            },
          },
        });
        if (!team) {
          return res.status(404).json({ error: "Team not found" });
        }
        res.status(200).json(team);
      } catch (error) {
        console.error("Error fetching team:", error);
        res.status(500).json({ error: "Failed to retrieve team" });
      }
      break;

    case "DELETE":
      try {
        await prisma.salesTeam.delete({
          where: { id_team: Number(id) },
        });
        res.status(204).end();
      } catch (error) {
        console.error("Error deleting team:", error);
        res.status(500).json({ error: "Failed to delete team" });
      }
      break;

    case "PUT":
      try {
        const { name, userIds } = req.body;

        const updatedTeam = await prisma.salesTeam.update({
          where: { id_team: Number(id) },
          data: {
            name,
            user_teams: {
              deleteMany: {}, // Elimina relaciones existentes
              create: userIds.map((userId: number) => ({
                user: { connect: { id_user: userId } },
              })),
            },
          },
          include: { user_teams: { include: { user: true } } },
        });

        res.status(200).json(updatedTeam);
      } catch (error) {
        console.error("Error al editar el equipo:", error);
        res.status(500).json({ error: "Error al editar el equipo" });
      }
      break;

    default:
      res.setHeader("Allow", ["GET", "DELETE"]);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
