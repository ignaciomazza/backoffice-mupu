// src/pages/api/users/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    const {
      email,
      password,
      first_name,
      last_name,
      position,
      id_agency,
      role,
    } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          first_name,
          last_name,
          position,
          id_agency,
          role,
        },
      });

      res.status(201).json(newUser);
    } catch (error) {
      console.error("User Registration API: Error creating user:", error);
      res.status(500).json({ error: "Error al crear el usuario" });
    }
  } else if (req.method === "GET") {
    try {
      const users = await prisma.user.findMany();
      res.status(200).json(users);
    } catch (error) {
      console.error("User Registration API: Error fetching users:", error);
      res.status(500).json({ error: "Error al obtener usuarios" });
    }
  } else {
    res.setHeader("Allow", ["POST", "GET"]);
    res.status(405).end(`Método ${req.method} no permitido`);
  }
}
