// src/pages/api/user/role.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log("API Role: Request recibido");
  const userIdHeader = req.headers["x-user-id"];
  if (!userIdHeader) {
    console.log("API Role: Falta el header x-user-id");
    return res.status(400).json({ error: "Falta el user id" });
  }

  const userId = Number(userIdHeader);
  console.log("API Role: Buscando usuario con id:", userId);
  try {
    const user = await prisma.user.findUnique({
      where: { id_user: userId },
      select: { role: true },
    });
    if (!user) {
      console.log("API Role: Usuario no encontrado para id:", userId);
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    console.log("API Role: Usuario encontrado, rol:", user.role);
    return res.status(200).json({ role: user.role });
  } catch (error) {
    console.error("API Role: Error al obtener el rol del usuario:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
