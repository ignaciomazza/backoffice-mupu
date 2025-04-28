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
      currency,
      departure_date,
      return_date,
      id_operator,
      nonComputable,
      taxableBase21,
      taxableBase10_5,
      commissionExempt,
      commission21,
      commission10_5,
      vatOnCommission21,
      vatOnCommission10_5,
      totalCommissionWithoutVAT,
      impIVA,
      card_interest,
      card_interest_21,
      taxableCardInterest,
      vatOnCardInterest,
    } = req.body;

    if (!type || sale_price === undefined || cost_price === undefined) {
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
          currency,
          departure_date: new Date(departure_date),
          return_date: new Date(return_date),
          id_operator: Number(id_operator),
          nonComputable: nonComputable || null,
          taxableBase21: taxableBase21 || null,
          taxableBase10_5: taxableBase10_5 || null,
          commissionExempt: commissionExempt || null,
          commission21: commission21 || null,
          commission10_5: commission10_5 || null,
          vatOnCommission21: vatOnCommission21 || null,
          vatOnCommission10_5: vatOnCommission10_5 || null,
          totalCommissionWithoutVAT: totalCommissionWithoutVAT || null,
          impIVA: impIVA || null,
          card_interest: card_interest || null,
          card_interest_21: card_interest_21 || null,
          taxableCardInterest: taxableCardInterest || null,
          vatOnCardInterest: vatOnCardInterest || null,
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
      return res
        .status(500)
        .json({
          error: "No se pudo eliminar el servicio. Inténtalo nuevamente.",
        });
    }
  } else {
    res.setHeader("Allow", ["PUT", "DELETE"]);
    return res.status(405).end(`Método ${req.method} no permitido.`);
  }
}
