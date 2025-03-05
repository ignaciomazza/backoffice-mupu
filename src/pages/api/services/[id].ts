// src/pages/api/services/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "ID de servicio inválido" });
  }

  if (req.method === "PUT") {
    const {
      type,
      description,
      sale_price,
      cost_price,
      destination,
      reference,
      tax_21,
      tax_105,
      exempt,
      other_taxes,
      not_computable,
      taxable_21,
      taxable_105,
      currency,
      payment_due_date,
      departure_date,
      return_date,
      id_operator,
    } = req.body;

    if (
      !type ||
      sale_price === undefined ||
      cost_price === undefined ||
      !payment_due_date
    ) {
      return res.status(400).json({
        error: "Todos los campos obligatorios deben ser completados.",
      });
    }

    try {
      const service = await prisma.service.update({
        where: { id_service: Number(id) },
        data: {
          type,
          description: description || null,
          sale_price,
          cost_price,
          destination: destination || "",
          reference: reference || "",
          tax_21: tax_21 || null,
          tax_105: tax_105 || null,
          exempt: exempt || null,
          other_taxes: other_taxes || null,
          not_computable: not_computable || null,
          taxable_21: taxable_21 || null,
          taxable_105: taxable_105 || null,
          currency,
          payment_due_date: new Date(payment_due_date),
          departure_date: departure_date ? new Date(departure_date) : null,
          return_date: return_date ? new Date(return_date) : null,
          id_operator: Number(id_operator),
        },
      });

      return res.status(200).json(service);
    } catch (error) {
      console.error("Error al actualizar servicio:", error);
      return res.status(500).json({ error: "Error al actualizar servicio." });
    }
  } else if (req.method === "DELETE") {
    try {
      await prisma.service.delete({ where: { id_service: Number(id) } });
      return res.status(200).json({ message: "Servicio eliminado con éxito." });
    } catch (error) {
      console.error("Error al eliminar servicio:", error);
      return res.status(500).json({ error: "Error al eliminar servicio." });
    }
  } else {
    res.setHeader("Allow", ["PUT", "DELETE"]);
    return res.status(405).end(`Método ${req.method} no permitido.`);
  }
}
