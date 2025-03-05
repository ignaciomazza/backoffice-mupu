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

    // Validar campos obligatorios
    if (!email || !password || !first_name || !last_name) {
      return res
        .status(400)
        .json({
          error:
            "Los campos 'email', 'password', 'first_name' y 'last_name' son obligatorios.",
        });
    }

    try {
      // Verificar duplicados por email
      const duplicate = await prisma.user.findUnique({ where: { email } });
      if (duplicate) {
        return res
          .status(400)
          .json({ error: "Ya existe un usuario con ese email." });
      }

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

      return res.status(201).json(newUser);
    } catch (error) {
      console.error(
        "Error creating user:",
        error instanceof Error ? error.message : error
      );
      return res.status(500).json({ error: "Error al crear el usuario" });
    }
  } else if (req.method === "GET") {
    try {
      const users = await prisma.user.findMany();
      return res.status(200).json(users);
    } catch (error) {
      console.error(
        "Error fetching users:",
        error instanceof Error ? error.message : error
      );
      return res.status(500).json({ error: "Error al obtener usuarios" });
    }
  } else {
    res.setHeader("Allow", ["POST", "GET"]);
    return res.status(405).end(`Método ${req.method} no permitido`);
  }
}
