import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { isMissingColumnError } from "@/lib/prismaErrors";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";
import {
  normalizeResourceSectionRules,
  normalizeRole,
  pickResourceSectionRule,
} from "@/utils/permissions";

const MANAGER_ROLES = new Set(["gerente", "desarrollador", "administrativo"]);

type PrismaKnownRequestError = {
  code?: string;
  message?: string;
};

function isMissingResourceConfigTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as PrismaKnownRequestError;
  if (err.code === "P2021") return true;
  if (typeof err.message !== "string") return false;
  return err.message.includes("ResourceConfig");
}

function isResourceConfigSchemaError(error: unknown): boolean {
  return (
    isMissingResourceConfigTable(error) ||
    isMissingColumnError(error, "ResourceConfig.access_rules")
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await resolveAuth(req);
  if (!auth?.id_agency || !auth.id_user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const planAccess = await ensurePlanFeatureAccess(auth.id_agency, "resources");
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const normalizedRole = normalizeRole(auth.role);
  const canManage = MANAGER_ROLES.has(normalizedRole);

  if (req.method === "GET") {
    try {
      const scopeParam = Array.isArray(req.query.scope)
        ? req.query.scope[0]
        : req.query.scope;
      const scope = String(scopeParam || "").trim().toLowerCase();
      const wantsAll = scope === "all";

      let rules: ReturnType<typeof normalizeResourceSectionRules> = [];
      try {
        const config = await prisma.resourceConfig.findUnique({
          where: { id_agency: auth.id_agency },
          select: { access_rules: true },
        });
        rules = normalizeResourceSectionRules(config?.access_rules);
      } catch (error) {
        if (!isResourceConfigSchemaError(error)) throw error;
      }

      if (wantsAll && canManage) {
        return res.status(200).json({ rules });
      }

      const ownRule = pickResourceSectionRule(rules, auth.id_user);
      return res.status(200).json({
        rules: ownRule ? [ownRule] : [],
        has_custom_rule: Boolean(ownRule),
      });
    } catch (error) {
      console.error("[resources/config][GET]", error);
      return res.status(500).json({ error: "Error obteniendo configuracion" });
    }
  }

  if (req.method === "PUT") {
    if (!canManage) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const rawRules = (body as Record<string, unknown>)?.rules;
      if (!Array.isArray(rawRules)) {
        return res.status(400).json({ error: "rules invalido" });
      }

      const normalized = normalizeResourceSectionRules(rawRules);
      const userIds = normalized.map((rule) => rule.id_user);
      const users = userIds.length
        ? await prisma.user.findMany({
            where: {
              id_agency: auth.id_agency,
              id_user: { in: userIds },
            },
            select: { id_user: true },
          })
        : [];
      const allowed = new Set(users.map((u) => u.id_user));
      const sanitized = normalized.filter((rule) => allowed.has(rule.id_user));

      await prisma.$transaction(async (tx) => {
        const existing = await tx.resourceConfig.findUnique({
          where: { id_agency: auth.id_agency },
          select: { id_config: true },
        });

        if (existing) {
          await tx.resourceConfig.update({
            where: { id_agency: auth.id_agency },
            data: { access_rules: sanitized },
          });
          return;
        }

        const agencyConfigId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "resource_config",
        );
        await tx.resourceConfig.create({
          data: {
            id_agency: auth.id_agency,
            agency_resource_config_id: agencyConfigId,
            access_rules: sanitized,
          },
        });
      });

      return res.status(200).json({ rules: sanitized });
    } catch (error) {
      if (isResourceConfigSchemaError(error)) {
        return res.status(409).json({
          error:
            "La base no tiene la tabla/columna de ResourceConfig. Ejecuta las migraciones.",
        });
      }
      console.error("[resources/config][PUT]", error);
      return res.status(500).json({ error: "Error guardando configuracion" });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
