// src/pages//api/teams/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";

const MANAGER_ROLES = new Set(["desarrollador", "gerente"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "N° de equipo inválido." });
  }
  const teamId = Number(id);
  if (!Number.isFinite(teamId) || teamId <= 0) {
    return res.status(400).json({ error: "N° de equipo inválido." });
  }

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!MANAGER_ROLES.has(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const { method } = req;

  switch (method) {
    case "GET":
      try {
        const team = await prisma.salesTeam.findFirst({
          where: { id_team: teamId, id_agency: auth.id_agency },
          include: { user_teams: { include: { user: true } } },
        });
        if (!team) {
          return res.status(404).json({ error: "Equipo no encontrado." });
        }
        return res.status(200).json(team);
      } catch (error) {
        console.error(
          "Error fetching team:",
          error instanceof Error ? error.message : error,
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

        const existing = await prisma.salesTeam.findFirst({
          where: { id_team: teamId, id_agency: auth.id_agency },
          select: { id_team: true },
        });
        if (!existing) {
          return res.status(404).json({ error: "Equipo no encontrado." });
        }

        const members = await prisma.user.findMany({
          where: { id_user: { in: userIds }, id_agency: auth.id_agency },
          select: { id_user: true },
        });
        if (members.length !== userIds.length) {
          return res.status(400).json({
            error: "Hay usuarios que no pertenecen a tu agencia.",
          });
        }

        const updatedTeam = await prisma.salesTeam.update({
          where: { id_team: teamId },
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
          error instanceof Error ? error.message : error,
        );
        return res.status(500).json({ error: "Error al editar el equipo" });
      }
    case "DELETE":
      try {
        const existing = await prisma.salesTeam.findFirst({
          where: { id_team: teamId, id_agency: auth.id_agency },
          select: { id_team: true },
        });
        if (!existing) {
          return res.status(404).json({ error: "Equipo no encontrado." });
        }

        await prisma.salesTeam.delete({
          where: { id_team: teamId },
        });
        return res.status(204).end();
      } catch (error) {
        console.error(
          "Error deleting team:",
          error instanceof Error ? error.message : error,
        );
        return res.status(500).json({ error: "Error al eliminar el equipo" });
      }
    default:
      res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
      return res.status(405).end(`Method ${method} Not Allowed`);
  }
}
