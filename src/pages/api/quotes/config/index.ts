import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { z } from "zod";
import { resolveQuoteAuth } from "@/lib/quotesAuth";
import {
  normalizeQuoteCustomFields,
  normalizeQuoteHiddenFields,
  normalizeQuoteRequiredFields,
} from "@/utils/quoteConfig";
import { normalizeRole } from "@/utils/permissions";

const customFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "number", "date", "select", "boolean", "textarea"]),
  required: z.boolean().optional(),
  placeholder: z.string().trim().max(120).optional(),
  help: z.string().trim().max(200).optional(),
  options: z.array(z.string().trim().min(1).max(80)).optional(),
});

const putSchema = z.object({
  required_fields: z.array(z.string()).optional(),
  hidden_fields: z.array(z.string()).optional(),
  custom_fields: z.array(customFieldSchema).optional(),
});

function canWrite(role: string): boolean {
  return ["gerente", "administrativo", "desarrollador"].includes(
    normalizeRole(role),
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const auth = await resolveQuoteAuth(req);
  if (!auth?.id_agency) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    try {
      const config = await prisma.quoteConfig.findUnique({
        where: { id_agency: auth.id_agency },
      });
      return res.status(200).json(config ?? null);
    } catch (error) {
      console.error("[quotes/config][GET]", error);
      return res.status(500).json({ error: "Error obteniendo configuración" });
    }
  }

  if (req.method === "PUT") {
    if (!canWrite(auth.role)) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const parsed = putSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }

      const { required_fields, hidden_fields, custom_fields } = parsed.data;

      await prisma.$transaction(async (tx) => {
        const current = await tx.quoteConfig.findUnique({
          where: { id_agency: auth.id_agency },
          select: {
            id_config: true,
            required_fields: true,
            hidden_fields: true,
            custom_fields: true,
          },
        });

        const nextRequired =
          required_fields !== undefined
            ? normalizeQuoteRequiredFields(required_fields)
            : normalizeQuoteRequiredFields(current?.required_fields);

        const nextHidden =
          hidden_fields !== undefined
            ? normalizeQuoteHiddenFields(hidden_fields)
            : normalizeQuoteHiddenFields(current?.hidden_fields);

        const filteredRequired = nextRequired.filter(
          (field) => !nextHidden.includes(field),
        );

        const nextCustom =
          custom_fields !== undefined
            ? normalizeQuoteCustomFields(custom_fields)
            : normalizeQuoteCustomFields(current?.custom_fields);

        const requiredValue = filteredRequired as Prisma.InputJsonValue;
        const hiddenValue = nextHidden as Prisma.InputJsonValue;
        const customValue = nextCustom as Prisma.InputJsonValue;

        if (current) {
          await tx.quoteConfig.update({
            where: { id_agency: auth.id_agency },
            data: {
              required_fields: requiredValue,
              hidden_fields: hiddenValue,
              custom_fields: customValue,
            },
          });
          return;
        }

        const agencyConfigId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "quote_config",
        );
        await tx.quoteConfig.create({
          data: {
            id_agency: auth.id_agency,
            agency_quote_config_id: agencyConfigId,
            required_fields: requiredValue,
            hidden_fields: hiddenValue,
            custom_fields: customValue,
          },
        });
      });

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[quotes/config][PUT]", error);
      return res.status(500).json({ error: "Error guardando configuración" });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}

