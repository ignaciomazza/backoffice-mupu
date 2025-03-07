// src/pages/api/auth/session.ts
import { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("[Session] Revisando token");

  // Intentar obtener el token del header Authorization
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.cookies.token) {
    // Fallback a la cookie 'token'
    token = req.cookies.token;
  }

  if (!token) {
    console.log("[Session] No se encontró token");
    return res.status(401).json({ error: "No autenticado" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("[Session] Token válido:", decoded);
    return res.status(200).json({ token });
  } catch (error) {
    console.error("[Session] Token inválido o expirado:", error);
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}
