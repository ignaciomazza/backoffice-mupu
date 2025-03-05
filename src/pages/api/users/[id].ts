// src/pages/api/users/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      const userId = Number(id);
      // Eliminar relaciones en UserTeam si existen
      await prisma.userTeam.deleteMany({
        where: { id_user: userId },
      });
      await prisma.user.delete({
        where: { id_user: userId },
      });
      return res.status(200).json({ message: "Usuario eliminado con éxito" });
    } catch (error: unknown) {
      console.error(
        "Error deleting user:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error al eliminar el usuario" });
    }
  } else if (req.method === "PUT") {
    const { email, password, first_name, last_name, position, role } = req.body;

    // Validar campos obligatorios
    if (!email || !first_name || !last_name) {
      return res.status(400).json({
        error:
          "Los campos 'email', 'first_name' y 'last_name' son obligatorios.",
      });
    }

    try {
      // Verificar duplicados: si se actualiza el email, chequear que no haya otro usuario con el mismo email
      const duplicate = await prisma.user.findFirst({
        where: {
          email,
          id_user: { not: Number(id) },
        },
      });
      if (duplicate) {
        return res
          .status(400)
          .json({ error: "Ya existe otro usuario con ese email." });
      }

      const updatedData: Partial<{
        email: string;
        first_name: string;
        last_name: string;
        position: string;
        role: string;
        password: string;
      }> = { email, first_name, last_name, position, role };
      if (password) {
        updatedData.password = await bcrypt.hash(password, 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id_user: Number(id) },
        data: updatedData,
      });
      return res.status(200).json(updatedUser);
    } catch (error: unknown) {
      console.error(
        "Error updating user:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error al actualizar el usuario" });
    }
  } else {
    res.setHeader("Allow", ["DELETE", "PUT"]);
    return res.status(405).end(`Método ${req.method} no permitido`);
  }
}
