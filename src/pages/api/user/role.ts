// src/pages/api/user/role.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log("[User Role] Request recibido");

  // Intentar obtener el token del header o de la cookie
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    console.log("[User Role] No se encontró token");
    return res.status(401).json({ error: "No autenticado" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      role: string;
    };
    const userId = decoded.userId;
    console.log("[User Role] Buscando usuario con id:", userId);

    const user = await prisma.user.findUnique({
      where: { id_user: userId },
      select: { role: true },
    });

    if (!user) {
      console.log("[User Role] Usuario no encontrado para id:", userId);
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    console.log("[User Role] Usuario encontrado, rol:", user.role);
    return res.status(200).json({ role: user.role });
  } catch (error) {
    console.error("[User Role] Error al verificar token:", error);
    return res.status(401).json({ error: "Token inválido" });
  }
}
