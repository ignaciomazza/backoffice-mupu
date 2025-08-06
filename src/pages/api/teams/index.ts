// src/pages/api/teams/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // ---------------------------
    // GET /api/teams?agencyId=...
    // ---------------------------
    if (req.method === "GET") {
      // 1) Leemos agencyId desde la query string
      const agencyId = Array.isArray(req.query.agencyId)
        ? Number(req.query.agencyId[0])
        : req.query.agencyId
          ? Number(req.query.agencyId)
          : null;

      if (!agencyId) {
        return res
          .status(400)
          .json({ error: "El parámetro agencyId es obligatorio." });
      }

      // 2) Recuperamos solo los equipos de esa agencia
      const teams = await prisma.salesTeam.findMany({
        where: { id_agency: agencyId },
        include: {
          user_teams: { include: { user: true } },
        },
      });

      return res.status(200).json(teams);
    }

    // ---------------------------
    // POST /api/teams
    // ---------------------------
    if (req.method === "POST") {
      const { name, userIds, id_agency } = req.body;

      // 1) Validaciones
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
      if (new Set(userIds).size !== userIds.length) {
        return res
          .status(400)
          .json({ error: "No se permiten IDs duplicados en los miembros." });
      }
      if (typeof id_agency !== "number") {
        return res
          .status(400)
          .json({
            error: "El campo id_agency es obligatorio y debe ser número.",
          });
      }

      // 2) Creamos el equipo para la agencia indicada
      const newTeam = await prisma.salesTeam.create({
        data: {
          name,
          id_agency, // lo toma directamente del body
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
    }

    // Métodos no permitidos
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error(
      "Error en /api/teams:",
      error instanceof Error ? error.message : error,
    );
    return res.status(500).json({ error: "Error interno" });
  }
}
