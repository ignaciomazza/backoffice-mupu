// src/pages/api/dev/stats/finance.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { isPlanKey } from "@/lib/billing/pricing";

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

function chargeSortDate(charge: {
  period_end?: Date | null;
  period_start?: Date | null;
  created_at?: Date | null;
}) {
  return (
    charge.period_end ??
    charge.period_start ??
    charge.created_at ??
    new Date(0)
  );
}

function normalizeCurrency(value?: unknown): "USD" | "ARS" {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  return raw === "ARS" ? "ARS" : "USD";
}

function currencyMatches(
  paidCurrency: string | null,
  selected: "USD" | "ARS",
) {
  if (selected === "USD") {
    return !paidCurrency || paidCurrency.toUpperCase() === "USD";
  }
  return paidCurrency?.toUpperCase() === "ARS";
}

function paidAmountForCurrency(
  charge: {
    paid_amount: unknown;
    paid_currency: string | null;
    total_usd: unknown;
  },
  selected: "USD" | "ARS",
) {
  const paid = Number(charge.paid_amount ?? 0);
  if (Number.isFinite(paid) && paid > 0) return paid;
  if (selected === "USD") return Number(charge.total_usd ?? 0);
  return 0;
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
    const currency = normalizeCurrency(
      Array.isArray(req.query.currency) ? req.query.currency[0] : req.query.currency,
    );

    const chargeWhere =
      range.from && range.to
        ? {
            OR: [
              { period_start: { gte: range.from, lte: range.to } },
              {
                period_start: null,
                created_at: { gte: range.from, lte: range.to },
              },
            ],
          }
        : {};

    const paidWhere =
      range.from && range.to
        ? {
            status: "PAID",
            OR: [
              { paid_at: { gte: range.from, lte: range.to } },
              { paid_at: null, created_at: { gte: range.from, lte: range.to } },
            ],
          }
        : { status: "PAID" };

    const [agencyTotal, agencies, configs, charges, paidCharges] = await Promise.all([
      prisma.agency.count(),
      prisma.agency.findMany({
        select: {
          id_agency: true,
          name: true,
          legal_name: true,
          billing_owner_agency_id: true,
        },
      }),
      prisma.agencyBillingConfig.findMany({
        select: {
          id_agency: true,
          plan_key: true,
          billing_users: true,
        },
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
          period_start: true,
          period_end: true,
          charge_kind: true,
          agency: { select: { name: true, legal_name: true } },
        },
      }),
      prisma.agencyBillingCharge.findMany({
        where: paidWhere,
        select: {
          id_charge: true,
          id_agency: true,
          total_usd: true,
          paid_amount: true,
          paid_currency: true,
          fx_rate: true,
          paid_at: true,
          created_at: true,
          agency: { select: { name: true } },
        },
      }),
    ]);

    const paidFiltered = paidCharges.filter((c) =>
      currencyMatches(c.paid_currency, currency),
    );
    const paidTotal = paidFiltered.reduce(
      (sum, c) => sum + paidAmountForCurrency(c, currency),
      0,
    );

    const agenciesWithCharges = new Set(charges.map((c) => c.id_agency));

    const planMix = configs.reduce<Record<string, number>>((acc, cfg) => {
      const key = isPlanKey(cfg.plan_key) ? cfg.plan_key : "basico";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const chargesPaidCount = charges.filter((c) => {
      if (String(c.status || "").toUpperCase() !== "PAID") return false;
      return currencyMatches(c.paid_currency, currency);
    }).length;
    const chargesPendingCount = charges.filter(
      (c) => String(c.status || "").toUpperCase() !== "PAID",
    ).length;

    const recurringCharges = charges.filter(
      (c) => String(c.charge_kind || "RECURRING").toUpperCase() !== "EXTRA",
    );
    const latestByOwner = recurringCharges.reduce<
      Record<number, (typeof charges)[0]>
    >((acc, charge) => {
      const current = acc[charge.id_agency];
      if (!current || chargeSortDate(charge) > chargeSortDate(current)) {
        acc[charge.id_agency] = charge;
      }
      return acc;
    }, {});

    const pendingLatest = agencies
      .map((agency) => {
        const ownerId =
          agency.billing_owner_agency_id ?? agency.id_agency;
        const lastCharge = latestByOwner[ownerId];
        if (!lastCharge) return null;
        if (String(lastCharge.status || "").toUpperCase() === "PAID")
          return null;
        return {
          id_agency: agency.id_agency,
          name: agency.name,
          legal_name: agency.legal_name ?? "",
          id_charge: lastCharge.id_charge,
          status: lastCharge.status,
          period_start: lastCharge.period_start,
          period_end: lastCharge.period_end,
          total_usd: Number(lastCharge.total_usd ?? 0),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aDate =
          (a?.period_end ?? a?.period_start ?? new Date(0)).getTime();
        const bDate =
          (b?.period_end ?? b?.period_start ?? new Date(0)).getTime();
        return bDate - aDate;
      }) as {
      id_agency: number;
      name: string;
      legal_name: string;
      id_charge: number;
      status: string;
      period_start: Date | null;
      period_end: Date | null;
      total_usd: number;
    }[];

    const recentPayments = [...paidFiltered]
      .sort((a, b) => {
        const aDate = a.paid_at ?? a.created_at ?? new Date(0);
        const bDate = b.paid_at ?? b.created_at ?? new Date(0);
        return bDate.getTime() - aDate.getTime();
      })
      .slice(0, 6)
      .map((row) => ({
        id_charge: row.id_charge,
        agency_name: row.agency?.name ?? "Agencia",
        paid_at: row.paid_at ?? row.created_at,
        paid_amount: paidAmountForCurrency(row, currency),
        paid_currency: currency,
      }));

    return res.status(200).json({
      range: {
        from: range.from,
        to: range.to,
        label: range.label,
      },
      totals: {
        paid_total: paidTotal,
      },
      counts: {
        agencies_total: agencyTotal,
        agencies_with_billing: configs.length,
        agencies_with_charges: agenciesWithCharges.size,
        charges_total: charges.length,
        charges_paid: chargesPaidCount,
        charges_pending: chargesPendingCount,
        agencies_pending_latest: pendingLatest.length,
      },
      plan_mix: {
        basico: planMix.basico ?? 0,
        medio: planMix.medio ?? 0,
        pro: planMix.pro ?? 0,
        sin_plan: agencyTotal - configs.length,
      },
      pending_latest: pendingLatest,
      recent_payments: recentPayments,
      currency,
    });
  } catch (e) {
    const err = e as AppError;
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err.message || "Error";
    return res.status(status).json({ error: message });
  }
}
