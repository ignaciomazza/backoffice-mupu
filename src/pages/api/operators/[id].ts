// drc/pages/api/operators/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";

const MANAGER_ROLES = new Set(["desarrollador", "gerente", "administrativo"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "N° de operador inválido." });
  }
  const operatorId = Number(id);
  if (!Number.isFinite(operatorId) || operatorId <= 0) {
    return res.status(400).json({ error: "N° de operador inválido." });
  }

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!MANAGER_ROLES.has(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  if (req.method === "DELETE") {
    try {
      const existing = await prisma.operator.findFirst({
        where: { id_operator: operatorId, id_agency: auth.id_agency },
        select: { id_operator: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "Operador no encontrado." });
      }

      await prisma.operator.delete({
        where: { id_operator: operatorId },
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
                id_agency: auth.id_agency,
              },
              {
                id_operator: { not: operatorId },
              },
            ],
          },
        });
      if (duplicate) {
        return res.status(400).json({
          error: "Ya existe otro operador con el mismo email o tax_id.",
        });
      }

      const existing = await prisma.operator.findFirst({
        where: { id_operator: operatorId, id_agency: auth.id_agency },
        select: { id_operator: true },
      });
      if (!existing) {
        return res.status(404).json({ error: "Operador no encontrado." });
      }

      const updatedOperator = await prisma.operator.update({
        where: { id_operator: operatorId },
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
