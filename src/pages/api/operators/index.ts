// drc/pages/api/operators/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    try {
      const operators = await prisma.operator.findMany();
      return res.status(200).json(operators);
    } catch (error) {
      console.error(
        "Error fetching operators:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Failed to fetch operators" });
    }
  } else if (req.method === "POST") {
    const {
      name,
      email,
      phone,
      website,
      address,
      postal_code,
      city,
      state,
      country,
      vat_status,
      legal_name,
      tax_id,
    } = req.body;

    // Validar campos requeridos
    if (!name || !email || !tax_id) {
      return res.status(400).json({
        error: "Los campos 'name', 'email' y 'tax_id' son obligatorios.",
      });
    }

    try {
      // Verificar duplicados: se busca por email o tax_id
      const duplicate = await prisma.operator.findFirst({
        where: {
          OR: [{ email }, { tax_id }],
        },
      });
      if (duplicate) {
        return res.status(400).json({
          error: "Ya existe un operador con el mismo email o tax_id.",
        });
      }

      const newOperator = await prisma.operator.create({
        data: {
          name,
          email,
          phone,
          website,
          address,
          postal_code,
          city,
          state,
          country,
          vat_status,
          legal_name,
          tax_id,
        },
      });
      return res.status(201).json(newOperator);
    } catch (error) {
      console.error(
        "Error creating operator:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Failed to create operator" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
