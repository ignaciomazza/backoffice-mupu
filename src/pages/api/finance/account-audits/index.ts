import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import {
  computeExpectedAccountBalanceAtMonthEnd,
  monthRange,
} from "@/lib/financeAccountBalance";
import { isFinanceMonthLocked, normalizeYearMonth } from "@/lib/financeLocks";

function toCurrency(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const createSchema = z.object({
  account_id: z.coerce.number().int().positive(),
  currency: z.string().trim().min(2),
  year: z.coerce.number().int(),
  month: z.coerce.number().int(),
  actual_balance: z.coerce.number(),
  note: z.string().trim().max(2000).optional(),
  create_adjustment: z.boolean().optional().default(false),
  adjustment_reason: z.string().trim().max(1000).optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const planAccess = await ensurePlanFeatureAccess(auth.id_agency, "cashbox");
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const grants = await getFinanceSectionGrants(auth.id_agency, auth.id_user);
  const canTransfers = canAccessFinanceSection(
    auth.role,
    grants,
    "account_transfers",
  );
  if (!canTransfers) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  if (req.method === "GET") {
    const preview = String(
      Array.isArray(req.query.preview) ? req.query.preview[0] : req.query.preview ?? "",
    )
      .trim()
      .toLowerCase();

    const accountId = Number(
      Array.isArray(req.query.account_id)
        ? req.query.account_id[0]
        : req.query.account_id,
    );
    const currencyRaw = Array.isArray(req.query.currency)
      ? req.query.currency[0]
      : req.query.currency;
    const currency = toCurrency(String(currencyRaw ?? ""));
    const yearRaw = Number(
      Array.isArray(req.query.year) ? req.query.year[0] : req.query.year,
    );
    const monthRaw = Number(
      Array.isArray(req.query.month) ? req.query.month[0] : req.query.month,
    );

    if (preview === "1" || preview === "true") {
      if (!Number.isFinite(accountId) || accountId <= 0 || !currency) {
        return res.status(400).json({
          error: "Para preview se requiere account_id, currency, year y month.",
        });
      }

      let ym: { year: number; month: number };
      try {
        ym = normalizeYearMonth(yearRaw, monthRaw);
      } catch (e) {
        return res.status(400).json({
          error: e instanceof Error ? e.message : "Período inválido.",
        });
      }
      const expected = await computeExpectedAccountBalanceAtMonthEnd(
        auth.id_agency,
        accountId,
        currency,
        ym.year,
        ym.month,
      );
      const locked = await isFinanceMonthLocked(auth.id_agency, ym.year, ym.month);

      return res.status(200).json({
        preview: {
          account_id: accountId,
          currency,
          year: ym.year,
          month: ym.month,
          expected_balance: expected.expected,
          opening_amount: expected.openingAmount,
          opening_date: expected.openingDate,
          is_locked: locked,
        },
      });
    }

    const take = Math.max(
      1,
      Math.min(
        400,
        Number(Array.isArray(req.query.take) ? req.query.take[0] : req.query.take) ||
          150,
      ),
    );
    const hasMonthFilter =
      Number.isFinite(yearRaw) &&
      Number.isFinite(monthRaw) &&
      monthRaw >= 1 &&
      monthRaw <= 12;
    let ym: { year: number; month: number } | null = null;
    if (hasMonthFilter) {
      try {
        ym = normalizeYearMonth(yearRaw, monthRaw);
      } catch {
        ym = null;
      }
    }
    const monthDateFilter = ym ? monthRange(ym.year, ym.month) : null;

    const auditsWhere = {
      id_agency: auth.id_agency,
      ...(Number.isFinite(accountId) && accountId > 0 ? { account_id: accountId } : {}),
      ...(currency ? { currency } : {}),
      ...(ym ? { year: ym.year, month: ym.month } : {}),
    };

    const adjustmentsWhere = {
      id_agency: auth.id_agency,
      ...(Number.isFinite(accountId) && accountId > 0 ? { account_id: accountId } : {}),
      ...(currency ? { currency } : {}),
      ...(monthDateFilter
        ? {
            effective_date: {
              gte: monthDateFilter.from,
              lte: monthDateFilter.to,
            },
          }
        : {}),
    };

    const [audits, adjustments, accounts] = await Promise.all([
      prisma.financeAccountAudit.findMany({
        where: auditsWhere,
        orderBy: [{ created_at: "desc" }, { id_audit: "desc" }],
        take,
      }),
      prisma.financeAccountAdjustment.findMany({
        where: adjustmentsWhere,
        orderBy: [{ effective_date: "desc" }, { id_adjustment: "desc" }],
        take,
      }),
      prisma.financeAccount.findMany({
        where: { id_agency: auth.id_agency },
        select: { id_account: true, name: true },
      }),
    ]);

    const accountNameById = new Map(accounts.map((a) => [a.id_account, a.name]));

    return res.status(200).json({
      audits: audits.map((audit) => ({
        ...audit,
        account_name: accountNameById.get(audit.account_id) ?? null,
        expected_balance: Number(audit.expected_balance),
        actual_balance: Number(audit.actual_balance),
        difference: Number(audit.difference),
      })),
      adjustments: adjustments.map((adj) => ({
        ...adj,
        account_name: accountNameById.get(adj.account_id) ?? null,
        amount: Number(adj.amount),
      })),
    });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }

    const input = parsed.data;
    let ym: { year: number; month: number };
    try {
      ym = normalizeYearMonth(input.year, input.month);
    } catch (e) {
      return res.status(400).json({
        error: e instanceof Error ? e.message : "Período inválido.",
      });
    }
    if (await isFinanceMonthLocked(auth.id_agency, ym.year, ym.month)) {
      return res.status(409).json({
        error:
          "El mes está bloqueado. Desbloquealo para registrar auditorías o ajustes.",
      });
    }

    const currency = toCurrency(input.currency);
    const account = await prisma.financeAccount.findFirst({
      where: { id_agency: auth.id_agency, id_account: input.account_id },
      select: { id_account: true, name: true, currency: true },
    });
    if (!account) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }
    if (account.currency && toCurrency(account.currency) !== currency) {
      return res.status(400).json({
        error: `La cuenta tiene moneda fija (${toCurrency(account.currency)}).`,
      });
    }

    const expected = await computeExpectedAccountBalanceAtMonthEnd(
      auth.id_agency,
      input.account_id,
      currency,
      ym.year,
      ym.month,
    );

    const actualBalance = round2(input.actual_balance);
    const difference = round2(actualBalance - expected.expected);
    const { to: monthEnd } = monthRange(ym.year, ym.month);

    const result = await prisma.$transaction(async (tx) => {
      const createdAudit = await tx.financeAccountAudit.create({
        data: {
          id_agency: auth.id_agency,
          account_id: input.account_id,
          currency,
          year: ym.year,
          month: ym.month,
          expected_balance: expected.expected,
          actual_balance: actualBalance,
          difference,
          note: input.note?.trim() || null,
          create_adjustment: !!input.create_adjustment,
          created_by: auth.id_user,
        },
      });

      let createdAdjustment: null | {
        id_adjustment: number;
        amount: number;
        effective_date: Date;
      } = null;

      if (input.create_adjustment && Math.abs(difference) > 0) {
        const reason =
          input.adjustment_reason?.trim() ||
          `Ajuste por auditoría ${String(ym.month).padStart(2, "0")}/${ym.year}`;

        const adjustment = await tx.financeAccountAdjustment.create({
          data: {
            id_agency: auth.id_agency,
            account_id: input.account_id,
            currency,
            amount: difference,
            effective_date: monthEnd,
            reason,
            note: input.note?.trim() || null,
            source: "audit",
            audit_id: createdAudit.id_audit,
            created_by: auth.id_user,
          },
        });

        await tx.financeAccountAudit.update({
          where: { id_audit: createdAudit.id_audit },
          data: { adjustment_id: adjustment.id_adjustment },
        });

        createdAdjustment = {
          id_adjustment: adjustment.id_adjustment,
          amount: Number(adjustment.amount),
          effective_date: adjustment.effective_date,
        };
      }

      return {
        audit: {
          ...createdAudit,
          expected_balance: Number(createdAudit.expected_balance),
          actual_balance: Number(createdAudit.actual_balance),
          difference: Number(createdAudit.difference),
          account_name: account.name,
        },
        adjustment: createdAdjustment,
      };
    });

    return res.status(201).json(result);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
