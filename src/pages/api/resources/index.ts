// src/pages/api/resources/index.ts

import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { encodePublicId } from "@/lib/publicIds";
import { resolveAuth } from "@/lib/auth";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const auth = await resolveAuth(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const planAccess = await ensurePlanFeatureAccess(
      auth.id_agency,
      "resources",
    );
    if (!planAccess.allowed) {
      return res.status(403).json({ error: "Plan insuficiente" });
    }

    const raw = req.query.agencyId;
    const agencyId = Array.isArray(raw) ? Number(raw[0]) : Number(raw);
    if (!Number.isNaN(agencyId) && agencyId !== auth.id_agency) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    try {
      const resources = await prisma.resources.findMany({
        where: { id_agency: auth.id_agency },
        orderBy: { createdAt: "desc" },
      });
      const payload = resources.map((resource) => ({
        ...resource,
        public_id: encodePublicId({
          t: "resource",
          a: resource.id_agency,
          i: resource.agency_resource_id,
        }),
      }));
      return res.status(200).json(payload);
    } catch (error) {
      console.error(
        "Error fetching resources:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error al obtener recursos" });
    }
  }

  if (req.method === "POST") {
    const auth = await resolveAuth(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const planAccess = await ensurePlanFeatureAccess(
      auth.id_agency,
      "resources",
    );
    if (!planAccess.allowed) {
      return res.status(403).json({ error: "Plan insuficiente" });
    }

    const { title, id_agency, description } = req.body;
    const cleanTitle = typeof title === "string" ? title.trim() : "";

    if (!cleanTitle) {
      return res
        .status(400)
        .json({ error: "Title es obligatorio." });
    }
    if (typeof id_agency === "number" && id_agency !== auth.id_agency) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    const cleanDescription =
      typeof description === "string" ? description.trim() : null;

    try {
      const newResource = await prisma.$transaction(async (tx) => {
        const agencyResourceId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "resource",
        );
        return tx.resources.create({
          data: {
            title: cleanTitle,
            description: cleanDescription || null,
            id_agency: auth.id_agency,
            agency_resource_id: agencyResourceId,
          },
        });
      });
      const payload = {
        ...newResource,
        public_id: encodePublicId({
          t: "resource",
          a: newResource.id_agency,
          i: newResource.agency_resource_id,
        }),
      };
      return res.status(201).json(payload);
    } catch (error) {
      console.error(
        "Error creating resource:",
        error instanceof Error ? error.message : error,
      );
      return res.status(500).json({ error: "Error al crear el recurso" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Método ${req.method} no permitido`);
}
