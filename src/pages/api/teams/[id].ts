// src/pages//api/teams/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "ID de equipo inválido." });
  }

  const { method } = req;

  switch (method) {
    case "GET":
      try {
        const team = await prisma.salesTeam.findUnique({
          where: { id_team: Number(id) },
          include: { user_teams: { include: { user: true } } },
        });
        if (!team) {
          return res.status(404).json({ error: "Equipo no encontrado." });
        }
        return res.status(200).json(team);
      } catch (error) {
        console.error(
          "Error fetching team:",
          error instanceof Error ? error.message : error
        );
        return res.status(500).json({ error: "Error al obtener el equipo" });
      }
    case "PUT":
      try {
        const { name, userIds } = req.body;
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
        return res.status(200).json(updatedTeam);
      } catch (error) {
        console.error(
          "Error al editar el equipo:",
          error instanceof Error ? error.message : error
        );
        return res.status(500).json({ error: "Error al editar el equipo" });
      }
    case "DELETE":
      try {
        await prisma.salesTeam.delete({
          where: { id_team: Number(id) },
        });
        return res.status(204).end();
      } catch (error) {
        console.error(
          "Error deleting team:",
          error instanceof Error ? error.message : error
        );
        return res.status(500).json({ error: "Error al eliminar el equipo" });
      }
    default:
      res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
      return res.status(405).end(`Method ${method} Not Allowed`);
  }
}
