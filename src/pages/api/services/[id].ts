// src/pages/api/services/[id].ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { resolveAuth } from "@/lib/auth";
import { canAccessBookingByRole } from "@/lib/accessControl";

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "N° de servicio inválido" });
  }
  const serviceId = Number(id);
  if (!Number.isFinite(serviceId) || serviceId <= 0) {
    return res.status(400).json({ error: "N° de servicio inválido" });
  }

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "PUT") {
    const {
      type,
      description,
      note,
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
      transfer_fee_pct,
      transfer_fee_amount,
      billing_override,
      extra_costs_amount,
      extra_taxes_amount,
      extra_adjustments,
    } = req.body;

    if (!type || sale_price === undefined || cost_price === undefined) {
      return res.status(400).json({
        error: "Todos los campos obligatorios deben ser completados.",
      });
    }
    const salePriceNum = toNullableNumber(sale_price);
    const costPriceNum = toNullableNumber(cost_price);
    if (salePriceNum == null || costPriceNum == null) {
      return res.status(400).json({ error: "Precios inválidos." });
    }

    try {
      const existing = await prisma.service.findFirst({
        where: { id_service: serviceId, id_agency: auth.id_agency },
        select: {
          id_service: true,
          booking: { select: { id_user: true } },
        },
      });
      if (!existing) {
        return res.status(404).json({ error: "Servicio no encontrado." });
      }
      const allowed = await canAccessBookingByRole(auth, {
        id_user: existing.booking.id_user,
        id_agency: auth.id_agency,
      });
      if (!allowed) {
        return res.status(403).json({ error: "No autorizado." });
      }

      const operatorId = Number(id_operator);
      if (!Number.isFinite(operatorId) || operatorId <= 0) {
        return res.status(400).json({ error: "Operador inválido." });
      }
      const operator = await prisma.operator.findFirst({
        where: { id_operator: operatorId, id_agency: auth.id_agency },
        select: { id_operator: true },
      });
      if (!operator) {
        return res.status(404).json({ error: "Operador no encontrado." });
      }

      const service = await prisma.service.update({
        where: { id_service: serviceId },
        data: {
          type,
          description: description || null,
          note: note || null,
          sale_price: salePriceNum,
          cost_price: costPriceNum,
          destination: destination || "",
          reference: reference || "",
          tax_21: toNullableNumber(tax_21),
          tax_105: toNullableNumber(tax_105),
          exempt: toNullableNumber(exempt),
          other_taxes: toNullableNumber(other_taxes),
          currency,
          departure_date: new Date(departure_date),
          return_date: new Date(return_date),
          id_operator: Number(id_operator),
          nonComputable: toNullableNumber(nonComputable),
          taxableBase21: toNullableNumber(taxableBase21),
          taxableBase10_5: toNullableNumber(taxableBase10_5),
          commissionExempt: toNullableNumber(commissionExempt),
          commission21: toNullableNumber(commission21),
          commission10_5: toNullableNumber(commission10_5),
          vatOnCommission21: toNullableNumber(vatOnCommission21),
          vatOnCommission10_5: toNullableNumber(vatOnCommission10_5),
          totalCommissionWithoutVAT: toNullableNumber(totalCommissionWithoutVAT),
          impIVA: toNullableNumber(impIVA),
          card_interest: toNullableNumber(card_interest),
          card_interest_21: toNullableNumber(card_interest_21),
          taxableCardInterest: toNullableNumber(taxableCardInterest),
          vatOnCardInterest: toNullableNumber(vatOnCardInterest),
          transfer_fee_pct: toNullableNumber(transfer_fee_pct),
          transfer_fee_amount: toNullableNumber(transfer_fee_amount),
          ...(billing_override !== undefined
            ? {
                billing_override:
                  billing_override == null ? Prisma.DbNull : billing_override,
              }
            : {}),
          extra_costs_amount: toNullableNumber(extra_costs_amount),
          extra_taxes_amount: toNullableNumber(extra_taxes_amount),
          ...(extra_adjustments !== undefined
            ? { extra_adjustments: extra_adjustments ?? null }
            : {}),
        },
      });
      return res.status(200).json(service);
    } catch (error) {
      console.error("Error al actualizar servicio:", error);
      return res.status(500).json({ error: "Error al actualizar servicio." });
    }
  } else if (req.method === "DELETE") {
    try {
      const existing = await prisma.service.findFirst({
        where: { id_service: serviceId, id_agency: auth.id_agency },
        select: {
          id_service: true,
          booking: { select: { id_user: true } },
        },
      });
      if (!existing) {
        return res.status(404).json({ error: "Servicio no encontrado." });
      }
      const allowed = await canAccessBookingByRole(auth, {
        id_user: existing.booking.id_user,
        id_agency: auth.id_agency,
      });
      if (!allowed) {
        return res.status(403).json({ error: "No autorizado." });
      }

      await prisma.service.delete({ where: { id_service: serviceId } });
      return res.status(200).json({ message: "Servicio eliminado con éxito." });
    } catch (error) {
      console.error("Error al eliminar servicio:", error);
      return res.status(500).json({
        error: "No se pudo eliminar el servicio. Inténtalo nuevamente.",
      });
    }
  } else {
    res.setHeader("Allow", ["PUT", "DELETE"]);
    return res.status(405).end(`Método ${req.method} no permitido.`);
  }
}
