// src/pages/api/finance/verification-rules/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import {
  normalizeReceiptVerificationRules,
  pickReceiptVerificationRule,
} from "@/utils/receiptVerification";
import { resolveAuth } from "@/lib/auth";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const auth = await resolveAuth(req);
  if (!auth?.id_agency || !auth.id_user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const planAccess = await ensurePlanFeatureAccess(
    auth.id_agency,
    "receipts_verify",
  );
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canVerify = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "receipts_verify",
  );
  const canVerifyOther = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "other_incomes_verify",
  );
  const canConfig = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "finance_config",
  );

  if (req.method === "GET") {
    if (!canVerify && !canVerifyOther && !canConfig) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    try {
      const scopeParam = Array.isArray(req.query.scope)
        ? req.query.scope[0]
        : req.query.scope;
      const scope = String(scopeParam || "").trim().toLowerCase();
      const wantsAll = scope === "all";

      const config = await prisma.financeConfig.findFirst({
        where: { id_agency: auth.id_agency },
        select: { receipt_verification_rules: true },
      });
      const rules = normalizeReceiptVerificationRules(
        config?.receipt_verification_rules,
      );

      if (wantsAll && canConfig) {
        return res.status(200).json({ rules });
      }

      const ownRule = pickReceiptVerificationRule(rules, auth.id_user);
      return res.status(200).json({ rules: ownRule ? [ownRule] : [] });
    } catch (e) {
      console.error("[finance/verification-rules][GET]", reqId, e);
      return res.status(500).json({ error: "Error obteniendo configuración" });
    }
  }

  if (req.method === "PUT") {
    if (!canConfig) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const rawRules = (body as Record<string, unknown>)?.rules;
      if (!Array.isArray(rawRules)) {
        return res.status(400).json({ error: "rules inválido" });
      }

      const normalized = normalizeReceiptVerificationRules(rawRules);
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
        const existing = await tx.financeConfig.findUnique({
          where: { id_agency: auth.id_agency },
          select: { id_config: true },
        });

        if (existing) {
          await tx.financeConfig.update({
            where: { id_agency: auth.id_agency },
            data: { receipt_verification_rules: sanitized },
          });
          return;
        }

        const primaryCurrency = await tx.financeCurrency.findFirst({
          where: { id_agency: auth.id_agency, is_primary: true },
          select: { code: true },
        });
        const fallbackCurrency = await tx.financeCurrency.findFirst({
          where: { id_agency: auth.id_agency },
          orderBy: { sort_order: "asc" },
          select: { code: true },
        });
        const defaultCurrency =
          primaryCurrency?.code || fallbackCurrency?.code || "ARS";

        const agencyConfigId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "finance_config",
        );
        await tx.financeConfig.create({
          data: {
            id_agency: auth.id_agency,
            agency_finance_config_id: agencyConfigId,
            default_currency_code: defaultCurrency,
            hide_operator_expenses_in_investments: false,
            receipt_verification_rules: sanitized,
          },
        });
      });

      return res.status(200).json({ rules: sanitized });
    } catch (e) {
      console.error("[finance/verification-rules][PUT]", reqId, e);
      return res.status(500).json({ error: "Error guardando configuración" });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
