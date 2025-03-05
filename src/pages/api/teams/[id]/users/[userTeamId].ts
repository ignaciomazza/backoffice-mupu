// src/pages/api/teams/[id]/users/[userTeamId].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id, userTeamId } = req.query;
  if (req.method === "DELETE") {
    try {
      await prisma.userTeam.delete({
        where: { id_user_team: Number(userTeamId) },
      });
      return res.status(204).end();
    } catch (error) {
      console.error(
        "Error al eliminar el usuario del equipo:",
        error instanceof Error ? error.message : error
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
