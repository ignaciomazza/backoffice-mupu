// src/pages/api/login/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // console.log("[Login] Método:", req.method);
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    console.log("[Login] Método no permitido:", req.method);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  const { email, password } = req.body;
  // console.log("[Login] Datos recibidos:", email);
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // console.log("[Login] Usuario no encontrado para email:", email);
      return res.status(401).json({ error: "Credenciales inválidas" });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // console.log("[Login] Contraseña inválida para:", email);
      return res.status(401).json({ error: "Credenciales inválidas" });
    }
    const token = jwt.sign(
      { userId: user.id_user, role: user.role },
      JWT_SECRET,
      { expiresIn: "12h" },
    );
    // console.log("[Login] Token generado:", token);

    // Configuramos la cookie según el entorno
    let cookieOptions = "HttpOnly; Path=/; Max-Age=43200; SameSite=Lax";
    if (process.env.NODE_ENV === "production") {
      cookieOptions += "; Secure";
    }
    const cookieHeader = `token=${token}; ${cookieOptions}`;
    // console.log("[Login] Set-Cookie header:", cookieHeader);

    res.setHeader("Set-Cookie", cookieHeader);
    return res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    console.error("[Login] Error during login:", error);
    return res.status(500).json({ error: "Error al iniciar sesión" });
  }
}
