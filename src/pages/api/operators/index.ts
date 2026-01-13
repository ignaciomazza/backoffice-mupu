// src/pages/api/operators/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Parse agencyId from query string
  const rawAgency = Array.isArray(req.query.agencyId)
    ? req.query.agencyId[0]
    : req.query.agencyId;
  const agencyId = rawAgency ? Number(rawAgency) : null;

  if (req.method === "GET") {
    if (agencyId === null) {
      return res.status(400).json({ error: "Debe proporcionar agencyId" });
    }
    try {
      const operators = await prisma.operator.findMany({
        where: { id_agency: agencyId },
      });
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
      id_agency,
    } = req.body;

    // Ensure agency is provided
    if (!id_agency) {
      return res
        .status(400)
        .json({ error: "El campo 'id_agency' es obligatorio." });
    }

    // Required fields
    if (!name || !email || !tax_id) {
      return res.status(400).json({
        error: "Los campos 'name', 'email' y 'tax_id' son obligatorios.",
      });
    }

    try {
      // Check duplicates within the same agency
      const duplicate = await prisma.operator.findFirst({
        where: {
          id_agency,
          OR: [{ email }, { tax_id }],
        },
      });
      if (duplicate) {
        return res.status(400).json({
          error:
            "Ya existe un operador con el mismo email o tax_id en esta agencia.",
        });
      }

      const newOperator = await prisma.$transaction(async (tx) => {
        const agencyOperatorId = await getNextAgencyCounter(
          tx,
          id_agency,
          "operator",
        );
        return tx.operator.create({
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
            id_agency,
            agency_operator_id: agencyOperatorId,
          },
        });
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
