// src/pages/api/operators/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { resolveAuth } from "@/lib/auth";

const MANAGER_ROLES = new Set(["desarrollador", "gerente", "administrativo"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const canManage = MANAGER_ROLES.has(auth.role);

  const rawAgency = Array.isArray(req.query.agencyId)
    ? req.query.agencyId[0]
    : req.query.agencyId;
  const agencyId = rawAgency ? Number(rawAgency) : null;
  if (agencyId && agencyId !== auth.id_agency) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  if (req.method === "GET") {
    try {
      const operators = await prisma.operator.findMany({
        where: { id_agency: auth.id_agency },
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

    if (!canManage) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    // Ensure agency is provided
    if (typeof id_agency === "number" && id_agency !== auth.id_agency) {
      return res.status(403).json({ error: "Sin permisos" });
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
          id_agency: auth.id_agency,
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
          auth.id_agency,
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
            id_agency: auth.id_agency,
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
