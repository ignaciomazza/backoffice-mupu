// src/pages/api/users/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      const userId = Number(id);

      // Eliminar relaciones en UserTeam primero
      await prisma.userTeam.deleteMany({
        where: { id_user: userId },
      });

      // Luego eliminar el usuario
      await prisma.user.delete({
        where: { id_user: userId },
      });

      res.status(200).json({ message: "Usuario eliminado con éxito" });
    } catch (error) {
      console.error("Error al eliminar el usuario:", error);
      res.status(500).json({ error: "Error al eliminar el usuario" });
    }
  } else if (req.method === "PUT") {
    const { email, password, first_name, last_name, position, role } = req.body;

    try {
      const updatedData: any = { email, first_name, last_name, position, role };

      // Solo hacer hash si se proporciona una nueva contraseña
      if (password) {
        updatedData.password = await bcrypt.hash(password, 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id_user: Number(id) },
        data: updatedData,
      });
      res.status(200).json(updatedUser);
    } catch (error) {
      res.status(500).json({ error: "Error al actualizar el usuario" });
    }
  } else {
    res.setHeader("Allow", ["DELETE", "PUT"]);
    res.status(405).end(`Método ${req.method} no permitido`);
  }
}
