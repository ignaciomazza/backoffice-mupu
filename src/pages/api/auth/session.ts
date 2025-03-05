// src/pages/api/auth/session.ts

import { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "No autenticado" });
  }
  try {
    jwt.verify(token, JWT_SECRET);
    // Retornamos el token para que el cliente lo pueda utilizar en el estado
    return res.status(200).json({ token });
  } catch (error) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}
