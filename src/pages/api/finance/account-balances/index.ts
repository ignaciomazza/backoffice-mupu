// src/pages/api/finance/account-balances/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { getFinancePicksAccess } from "@/lib/accessControl";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";
import { isFinanceDateLocked } from "@/lib/financeLocks";
import {
  parseDateInputInBuenosAires,
  todayDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";

const upsertSchema = z.object({
  account_id: z.number().int().positive(),
  currency: z.string().trim().min(2),
  amount: z.number(),
  effective_date: z.string().trim().optional(),
  note: z.string().trim().nullable().optional(),
});

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = parseDateInputInBuenosAires(value);
  return parsed ?? null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const planAccess = await ensurePlanFeatureAccess(
    auth.id_agency,
    "balances",
  );
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const { canRead, canWrite } = await getFinancePicksAccess(
    auth.id_agency,
    auth.id_user,
    auth.role,
  );

  if (req.method === "GET") {
    if (!canRead) return res.status(403).json({ error: "Sin permisos" });

    const account_id = Number(
      Array.isArray(req.query.account_id)
        ? req.query.account_id[0]
        : req.query.account_id,
    );

    const where = {
      id_agency: auth.id_agency,
      ...(Number.isFinite(account_id) && account_id > 0
        ? { account_id }
        : {}),
    };

    const items = await prisma.financeAccountOpeningBalance.findMany({
      where,
      orderBy: [{ account_id: "asc" }, { currency: "asc" }],
    });

    return res.status(200).json(items);
  }

  if (req.method === "POST") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }

    const payload = parsed.data;
    const currency = payload.currency.toUpperCase();
    const effectiveDate =
      parseDate(payload.effective_date) ??
      parseDateInputInBuenosAires(todayDateKeyInBuenosAires()) ??
      new Date();

    if (await isFinanceDateLocked(auth.id_agency, effectiveDate)) {
      return res.status(409).json({
        error:
          "El mes del saldo base está bloqueado. Desbloquealo para editarlo.",
      });
    }

    const account = await prisma.financeAccount.findFirst({
      where: { id_account: payload.account_id, id_agency: auth.id_agency },
      select: { id_account: true, currency: true },
    });
    if (!account) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }
    if (
      account.currency &&
      account.currency.toUpperCase() !== currency.toUpperCase()
    ) {
      return res.status(400).json({
        error: `La cuenta tiene moneda fija (${account.currency}).`,
      });
    }

    const existing = await prisma.financeAccountOpeningBalance.findFirst({
      where: {
        id_agency: auth.id_agency,
        account_id: payload.account_id,
        currency,
      },
    });

    const saved = existing
      ? await prisma.financeAccountOpeningBalance.update({
          where: { id_opening_balance: existing.id_opening_balance },
          data: {
            amount: payload.amount,
            currency,
            effective_date: effectiveDate,
            note: payload.note ?? null,
          },
        })
      : await prisma.financeAccountOpeningBalance.create({
          data: {
            id_agency: auth.id_agency,
            account_id: payload.account_id,
            currency,
            amount: payload.amount,
            effective_date: effectiveDate,
            note: payload.note ?? null,
          },
        });

    return res.status(200).json(saved);
  }

  if (req.method === "DELETE") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });

    const account_id = Number(
      Array.isArray(req.query.account_id)
        ? req.query.account_id[0]
        : req.query.account_id,
    );
    const currencyRaw = Array.isArray(req.query.currency)
      ? req.query.currency[0]
      : req.query.currency;
    const currency = typeof currencyRaw === "string" ? currencyRaw : "";

    if (!Number.isFinite(account_id) || account_id <= 0 || !currency) {
      return res.status(400).json({ error: "Parámetros inválidos" });
    }

    const existing = await prisma.financeAccountOpeningBalance.findFirst({
      where: {
        id_agency: auth.id_agency,
        account_id,
        currency: currency.toUpperCase(),
      },
    });

    if (existing) {
      if (await isFinanceDateLocked(auth.id_agency, existing.effective_date)) {
        return res.status(409).json({
          error:
            "El mes del saldo base está bloqueado. Desbloquealo para eliminarlo.",
        });
      }
      await prisma.financeAccountOpeningBalance.delete({
        where: { id_opening_balance: existing.id_opening_balance },
      });
    }

    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
