// drc/pages/api/operators/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "ID de operador inválido." });
  }

  if (req.method === "DELETE") {
    try {
      await prisma.operator.delete({
        where: { id_operator: Number(id) },
      });
      return res.status(200).json({ message: "Operador eliminado con éxito." });
    } catch (error) {
      console.error(
        "Error deleting operator:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Failed to delete operator" });
    }
  } else if (req.method === "PUT") {
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
      // Verificar duplicados excluyendo al operador que se está actualizando
      const duplicate = await prisma.operator.findFirst({
        where: {
          AND: [
            {
              OR: [{ email }, { tax_id }],
            },
            {
              id_operator: { not: Number(id) },
            },
          ],
        },
      });
      if (duplicate) {
        return res.status(400).json({
          error: "Ya existe otro operador con el mismo email o tax_id.",
        });
      }

      const updatedOperator = await prisma.operator.update({
        where: { id_operator: Number(id) },
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
      return res.status(200).json(updatedOperator);
    } catch (error) {
      console.error(
        "Error updating operator:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Failed to update operator" });
    }
  } else {
    res.setHeader("Allow", ["DELETE", "PUT"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
