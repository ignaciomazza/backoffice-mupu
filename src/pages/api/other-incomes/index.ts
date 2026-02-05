// src/pages/api/other-incomes/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { jwtVerify, type JWTPayload } from "jose";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";

type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  role?: string;
  email?: string;
};

type DecodedAuth = {
  id_user: number;
  id_agency: number;
  role: string;
  email?: string;
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;

  const a = req.headers.authorization || "";
  if (a.startsWith("Bearer ")) return a.slice(7);

  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = c[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedAuth | null> {
  try {
    const tok = getTokenFromRequest(req);
    if (!tok) return null;

    const { payload } = await jwtVerify(
      tok,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = String(p.role || "").toLowerCase();
    const email = p.email;

    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user,
          id_agency: u.id_agency,
          role: role || u.role.toLowerCase(),
          email: email ?? u.email ?? undefined,
        };
    }

    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true },
      });
      if (u)
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role.toLowerCase(),
          email,
        };
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role, email: email ?? undefined };
  } catch {
    return null;
  }
}

function toLocalDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m)
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const toDec = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? undefined
    : new Prisma.Decimal(typeof v === "number" ? v : String(v));

type PaymentLineInput = {
  amount: unknown;
  payment_method_id: unknown;
  account_id?: unknown;
};

type PaymentLineNormalized = {
  amount: number;
  payment_method_id: number;
  account_id?: number;
};

function parsePayments(raw: unknown): PaymentLineNormalized[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentLineNormalized[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as PaymentLineInput;
    const amount = Number(rec.amount ?? 0);
    const payment_method_id = Number(rec.payment_method_id);
    const account_id =
      rec.account_id === null || rec.account_id === undefined || rec.account_id === ""
        ? undefined
        : Number(rec.account_id);

    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (!Number.isFinite(payment_method_id) || payment_method_id <= 0) continue;

    out.push({
      amount,
      payment_method_id: Math.trunc(payment_method_id),
      account_id:
        Number.isFinite(account_id as number) && Number(account_id) > 0
          ? Math.trunc(Number(account_id))
          : undefined,
    });
  }
  return out;
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  const planAccess = await ensurePlanFeatureAccess(
    auth.id_agency,
    "other_incomes",
  );
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canOtherIncomes = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "other_incomes",
  );
  const canVerify = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "other_incomes_verify",
  );
  if (!canOtherIncomes && !canVerify) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  try {
    const takeParam = safeNumber(
      Array.isArray(req.query.take) ? req.query.take[0] : req.query.take,
    );
    const take = Math.min(Math.max(takeParam || 24, 1), 100);

    const cursorParam = safeNumber(
      Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor,
    );
    const cursor = cursorParam;

    const currency =
      typeof req.query.currency === "string"
        ? req.query.currency.trim().toUpperCase()
        : "";
    const status =
      typeof req.query.status === "string"
        ? req.query.status.trim().toUpperCase()
        : "";

    const dateFrom = toLocalDate(
      Array.isArray(req.query.dateFrom)
        ? req.query.dateFrom[0]
        : (req.query.dateFrom as string),
    );
    const dateTo = toLocalDate(
      Array.isArray(req.query.dateTo)
        ? req.query.dateTo[0]
        : (req.query.dateTo as string),
    );

    const paymentMethodId = safeNumber(
      Array.isArray(req.query.payment_method_id)
        ? req.query.payment_method_id[0]
        : req.query.payment_method_id,
    );
    const accountId = safeNumber(
      Array.isArray(req.query.account_id)
        ? req.query.account_id[0]
        : req.query.account_id,
    );

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const where: Prisma.OtherIncomeWhereInput = {
      id_agency: auth.id_agency,
      ...(currency ? { currency } : {}),
      ...(status ? { verification_status: status } : {}),
    };

    if (dateFrom || dateTo) {
      where.issue_date = {
        ...(dateFrom
          ? {
              gte: new Date(
                dateFrom.getFullYear(),
                dateFrom.getMonth(),
                dateFrom.getDate(),
                0,
                0,
                0,
                0,
              ),
            }
          : {}),
        ...(dateTo
          ? {
              lte: new Date(
                dateTo.getFullYear(),
                dateTo.getMonth(),
                dateTo.getDate(),
                23,
                59,
                59,
                999,
              ),
            }
          : {}),
      };
    }

    const andFilters: Prisma.OtherIncomeWhereInput[] = [];

    if (paymentMethodId) {
      andFilters.push({
        OR: [
          { payment_method_id: paymentMethodId },
          { payments: { some: { payment_method_id: paymentMethodId } } },
        ],
      });
    }

    if (accountId) {
      andFilters.push({
        OR: [
          { account_id: accountId },
          { payments: { some: { account_id: accountId } } },
        ],
      });
    }

    if (q) {
      const qNum = Number(q);
      const or: Prisma.OtherIncomeWhereInput[] = [
        ...(Number.isFinite(qNum) ? [{ id_other_income: qNum }] : []),
        ...(Number.isFinite(qNum) ? [{ agency_other_income_id: qNum }] : []),
        { description: { contains: q, mode: "insensitive" } },
      ];
      andFilters.push({ OR: or });
    }

    if (andFilters.length) {
      where.AND = andFilters;
    }

    const items = await prisma.otherIncome.findMany({
      where,
      include: {
        payments: true,
        verifiedBy: {
          select: { id_user: true, first_name: true, last_name: true },
        },
        createdBy: {
          select: { id_user: true, first_name: true, last_name: true },
        },
      },
      orderBy: { id_other_income: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id_other_income: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > take;
    const sliced = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id_other_income : null;

    return res.status(200).json({ items: sliced, nextCursor });
  } catch (e) {
    console.error("[other-incomes][GET]", e);
    return res
      .status(500)
      .json({ error: "Error al obtener ingresos" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  const planAccess = await ensurePlanFeatureAccess(
    auth.id_agency,
    "other_incomes",
  );
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canOtherIncomes = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "other_incomes",
  );
  if (!canOtherIncomes) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  try {
    const b = req.body ?? {};

    const description = String(b.description ?? "").trim();
    const currency = String(b.currency ?? "").trim().toUpperCase();

    const parsedIssueDate = b.issue_date ? toLocalDate(b.issue_date) : undefined;
    if (b.issue_date && !parsedIssueDate) {
      return res.status(400).json({ error: "issue_date inválida" });
    }

    if (!description) {
      return res.status(400).json({ error: "description es requerido" });
    }
    if (!currency) {
      return res.status(400).json({ error: "currency es requerido" });
    }

    const hasPaymentsProp = Object.prototype.hasOwnProperty.call(
      b,
      "payments",
    );
    if (hasPaymentsProp && !Array.isArray(b.payments)) {
      return res.status(400).json({ error: "payments inválidos" });
    }
    const payments = Array.isArray(b.payments) ? parsePayments(b.payments) : [];
    const hasPayments = payments.length > 0;

    const amountRaw = Number(b.amount);
    const amount = hasPayments
      ? payments.reduce((acc, p) => acc + Number(p.amount || 0), 0)
      : amountRaw;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount inválido" });
    }

    const paymentFee = toDec(b.payment_fee_amount);
    if (paymentFee && paymentFee.toNumber() < 0) {
      return res
        .status(400)
        .json({ error: "payment_fee_amount inválido" });
    }

    const legacyPmId = hasPayments
      ? payments[0].payment_method_id
      : Number.isFinite(Number(b.payment_method_id)) &&
          Number(b.payment_method_id) > 0
        ? Number(b.payment_method_id)
        : undefined;

    const legacyAccId = hasPayments
      ? payments[0].account_id
      : Number.isFinite(Number(b.account_id)) && Number(b.account_id) > 0
        ? Number(b.account_id)
        : undefined;

    const created = await prisma.$transaction(async (tx) => {
      const agencyOtherIncomeId = await getNextAgencyCounter(
        tx,
        auth.id_agency,
        "other_income",
      );

      const base = await tx.otherIncome.create({
        data: {
          agency_other_income_id: agencyOtherIncomeId,
          id_agency: auth.id_agency,
          description,
          amount,
          currency,
          issue_date: parsedIssueDate ?? new Date(),
          ...(paymentFee ? { payment_fee_amount: paymentFee } : {}),
          ...(legacyPmId ? { payment_method_id: legacyPmId } : {}),
          ...(legacyAccId ? { account_id: legacyAccId } : {}),
          created_by: auth.id_user,
        },
      });

      if (hasPayments) {
        await tx.otherIncomePayment.createMany({
          data: payments.map((p) => ({
            other_income_id: base.id_other_income,
            amount: new Prisma.Decimal(p.amount),
            payment_method_id: p.payment_method_id,
            account_id: p.account_id ?? null,
          })),
        });
      }

      return tx.otherIncome.findUnique({
        where: { id_other_income: base.id_other_income },
        include: {
          payments: true,
          verifiedBy: {
            select: { id_user: true, first_name: true, last_name: true },
          },
          createdBy: {
            select: { id_user: true, first_name: true, last_name: true },
          },
        },
      });
    });

    return res.status(201).json({ item: created });
  } catch (e) {
    console.error("[other-incomes][POST]", e);
    return res
      .status(500)
      .json({ error: "Error al crear ingresos" });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
