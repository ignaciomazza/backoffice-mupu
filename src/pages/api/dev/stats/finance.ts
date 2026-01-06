// src/pages/api/dev/stats/finance.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { calcMonthlyBase, isPlanKey } from "@/lib/billing/pricing";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  email?: string;
};

type AppError = Error & { status?: number };

function httpError(status: number, message: string): AppError {
  const err = new Error(message) as AppError;
  err.status = status;
  return err;
}

function normalizeRole(r?: string) {
  return (r ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = req.cookies?.[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function requireDeveloper(req: NextApiRequest): Promise<{
  id_user: number;
  email?: string;
}> {
  const token = getTokenFromRequest(req);
  if (!token) throw httpError(401, "No autenticado");

  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(JWT_SECRET),
  );
  const p = payload as TokenPayload;
  const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
  const role = normalizeRole(p.role);

  if (!id_user || role !== "desarrollador") {
    throw httpError(403, "No autorizado");
  }
  return { id_user, email: p.email };
}

type Adjustment = {
  id_agency: number;
  kind: string;
  mode: string;
  value: unknown;
  starts_at: Date | null;
  ends_at: Date | null;
  active: boolean;
};

function activeAdjustments(adjustments: Adjustment[], date: Date) {
  return adjustments.filter((adj) => {
    if (!adj.active) return false;
    if (adj.starts_at && date < adj.starts_at) return false;
    if (adj.ends_at && date > adj.ends_at) return false;
    return true;
  });
}

function calcDiscountTotal(base: number, adjustments: Adjustment[]) {
  const percent = adjustments
    .filter((adj) => adj.mode === "percent")
    .reduce((sum, adj) => sum + Number(adj.value || 0), 0);
  const fixed = adjustments
    .filter((adj) => adj.mode === "fixed")
    .reduce((sum, adj) => sum + Number(adj.value || 0), 0);
  return base * (percent / 100) + fixed;
}

function calcTaxTotal(netBase: number, adjustments: Adjustment[]) {
  const percent = adjustments
    .filter((adj) => adj.mode === "percent")
    .reduce((sum, adj) => sum + Number(adj.value || 0), 0);
  const fixed = adjustments
    .filter((adj) => adj.mode === "fixed")
    .reduce((sum, adj) => sum + Number(adj.value || 0), 0);
  return netBase * (percent / 100) + fixed;
}

function calcTotals(base: number, adjustments: Adjustment[], date: Date) {
  const active = activeAdjustments(adjustments, date);
  const discounts = active.filter((adj) => adj.kind === "discount");
  const taxes = active.filter((adj) => adj.kind === "tax");
  const discountUsd = calcDiscountTotal(base, discounts);
  const netBase = Math.max(base - discountUsd, 0);
  const taxUsd = calcTaxTotal(netBase, taxes);
  const total = netBase + taxUsd;
  return { discountUsd, taxUsd, total };
}

function paidAmountToUsd(charge: {
  paid_amount: unknown;
  paid_currency: string | null;
  fx_rate: unknown;
  total_usd: unknown;
}) {
  const paid = Number(charge.paid_amount ?? 0);
  if (Number.isFinite(paid) && paid > 0) {
    const currency = (charge.paid_currency || "USD").toUpperCase();
    if (currency === "USD") return paid;
    const fx = Number(charge.fx_rate ?? 0);
    if (Number.isFinite(fx) && fx > 0) return paid / fx;
  }
  return Number(charge.total_usd ?? 0);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}

function getRange(period: string | undefined) {
  const now = new Date();
  if (period === "quarter") {
    const start = new Date(now);
    start.setDate(start.getDate() - 90);
    return { from: start, to: now, label: "Ultimos 90 dias" };
  }
  if (period === "ytd") {
    return { from: startOfYear(now), to: now, label: "Año en curso" };
  }
  if (period === "all") {
    return { from: null, to: null, label: "Todo" };
  }
  return { from: startOfMonth(now), to: now, label: "Mes actual" };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    await requireDeveloper(req);

    const periodRaw = Array.isArray(req.query.period)
      ? req.query.period[0]
      : req.query.period;
    const period = typeof periodRaw === "string" ? periodRaw : "month";
    const range = getRange(period);

    const chargeWhere =
      range.from && range.to
        ? {
            OR: [
              { period_start: { gte: range.from, lte: range.to } },
              { period_start: null, created_at: { gte: range.from, lte: range.to } },
            ],
          }
        : {};

    const [agencyTotal, configs, adjustments, billedAgg, pendingAgg, charges] =
      await Promise.all([
        prisma.agency.count(),
        prisma.agencyBillingConfig.findMany({
          select: {
            id_agency: true,
            plan_key: true,
            billing_users: true,
          },
        }),
        prisma.agencyBillingAdjustment.findMany({
          select: {
            id_agency: true,
            kind: true,
            mode: true,
            value: true,
            starts_at: true,
            ends_at: true,
            active: true,
          },
        }),
        prisma.agencyBillingCharge.aggregate({
          where: chargeWhere,
          _sum: { total_usd: true },
          _count: { _all: true },
        }),
        prisma.agencyBillingCharge.aggregate({
          where: { ...chargeWhere, status: { not: "PAID" } },
          _sum: { total_usd: true },
          _count: { _all: true },
        }),
        prisma.agencyBillingCharge.findMany({
          where: chargeWhere,
          select: {
            id_charge: true,
            id_agency: true,
            total_usd: true,
            paid_amount: true,
            paid_currency: true,
            fx_rate: true,
            paid_at: true,
            status: true,
            created_at: true,
          },
        }),
      ]);

    const paidCharges = charges.filter((c) => {
      if (String(c.status || "").toUpperCase() !== "PAID") return false;
      if (!range.from || !range.to) return true;
      if (c.paid_at) return c.paid_at >= range.from && c.paid_at <= range.to;
      return c.created_at >= range.from && c.created_at <= range.to;
    });
    const paidUsd = paidCharges.reduce((sum, c) => sum + paidAmountToUsd(c), 0);

    const agenciesWithCharges = new Set(charges.map((c) => c.id_agency));

    const adjustmentsByAgency = adjustments.reduce<Record<number, Adjustment[]>>(
      (acc, adj) => {
        if (!acc[adj.id_agency]) acc[adj.id_agency] = [];
        acc[adj.id_agency].push(adj);
        return acc;
      },
      {},
    );

    const today = new Date();
    const mrrEstimateUsd = configs.reduce((sum, cfg) => {
      const planKey = isPlanKey(cfg.plan_key) ? cfg.plan_key : "basico";
      const base = calcMonthlyBase(planKey, cfg.billing_users);
      const agencyAdjustments = adjustmentsByAgency[cfg.id_agency] || [];
      const totals = calcTotals(base, agencyAdjustments, today);
      return sum + totals.total;
    }, 0);

    const planMix = configs.reduce<Record<string, number>>((acc, cfg) => {
      const key = isPlanKey(cfg.plan_key) ? cfg.plan_key : "basico";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const chargesByAgency = await prisma.agencyBillingCharge.groupBy({
      by: ["id_agency"],
      where: { ...chargeWhere, status: { not: "PAID" } },
      _sum: { total_usd: true },
      _count: { _all: true },
      orderBy: { _sum: { total_usd: "desc" } },
      take: 5,
    });

    const topAgencyIds = chargesByAgency.map((row) => row.id_agency);
    const topAgencies = await prisma.agency.findMany({
      where: { id_agency: { in: topAgencyIds } },
      select: { id_agency: true, name: true, legal_name: true },
    });
    const topAgencyMap = topAgencies.reduce<Record<number, typeof topAgencies[0]>>(
      (acc, item) => {
        acc[item.id_agency] = item;
        return acc;
      },
      {},
    );

    const topOutstanding = chargesByAgency.map((row) => ({
      id_agency: row.id_agency,
      name: topAgencyMap[row.id_agency]?.name ?? "Agencia",
      legal_name: topAgencyMap[row.id_agency]?.legal_name ?? "",
      outstanding_usd: Number(row._sum.total_usd ?? 0),
      pending_charges: row._count._all,
    }));

    const recentPayments = await prisma.agencyBillingCharge.findMany({
      where: {
        status: "PAID",
        ...(range.from && range.to
          ? { paid_at: { gte: range.from, lte: range.to } }
          : {}),
      },
      orderBy: { paid_at: "desc" },
      take: 6,
      select: {
        id_charge: true,
        id_agency: true,
        paid_amount: true,
        paid_currency: true,
        fx_rate: true,
        paid_at: true,
        total_usd: true,
        agency: { select: { name: true } },
      },
    });

    return res.status(200).json({
      range: {
        from: range.from,
        to: range.to,
        label: range.label,
      },
      totals: {
        billed_usd: Number(billedAgg._sum.total_usd ?? 0),
        paid_usd: paidUsd,
        outstanding_usd: Number(pendingAgg._sum.total_usd ?? 0),
        mrr_estimate_usd: mrrEstimateUsd,
      },
      counts: {
        agencies_total: agencyTotal,
        agencies_with_billing: configs.length,
        agencies_with_charges: agenciesWithCharges.size,
        charges_total: billedAgg._count._all,
        charges_paid: paidCharges.length,
        charges_pending: pendingAgg._count._all,
      },
      plan_mix: {
        basico: planMix.basico ?? 0,
        medio: planMix.medio ?? 0,
        pro: planMix.pro ?? 0,
        sin_plan: agencyTotal - configs.length,
      },
      top_outstanding: topOutstanding,
      recent_payments: recentPayments.map((row) => ({
        id_charge: row.id_charge,
        agency_name: row.agency?.name ?? "Agencia",
        paid_at: row.paid_at,
        paid_usd: paidAmountToUsd(row),
      })),
    });
  } catch (e) {
    const err = e as AppError;
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err.message || "Error";
    return res.status(status).json({ error: message });
  }
}
