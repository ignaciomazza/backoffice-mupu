// src/pages/api/login/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const JWT_SECRET = process.env.JWT_SECRET || "tu_secreto_seguro";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const { email, password } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign({ userId: user.id_user }, JWT_SECRET);

      res.setHeader("Set-Cookie", `token=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax; Secure=${process.env.NODE_ENV === 'production'}`);
      
      res.status(200).json({ message: "Login successful", token });
    } catch (error) {
      console.error("Login API: Error during login:", error);
      res.status(500).json({ error: "Login error" });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
