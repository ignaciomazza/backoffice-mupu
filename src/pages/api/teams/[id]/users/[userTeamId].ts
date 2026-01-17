// src/pages/api/teams/[id]/users/[userTeamId].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";

const MANAGER_ROLES = new Set(["desarrollador", "gerente"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { userTeamId } = req.query;
  if (req.method === "DELETE") {
    try {
      const auth = await resolveAuth(req);
      if (!auth) return res.status(401).json({ error: "Unauthorized" });
      if (!MANAGER_ROLES.has(auth.role)) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      const id = Number(userTeamId);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const existing = await prisma.userTeam.findFirst({
        where: {
          id_user_team: id,
          sales_team: { id_agency: auth.id_agency },
        },
        select: { id_user_team: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "Relación no encontrada" });
      }

      await prisma.userTeam.delete({
        where: { id_user_team: id },
      });
      return res.status(204).end();
    } catch (error) {
      console.error(
        "Error al eliminar el usuario del equipo:",
        error instanceof Error ? error.message : error,
      );
      return res
        .status(500)
        .json({ error: "Error al eliminar el usuario del equipo" });
    }
  } else {
    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
