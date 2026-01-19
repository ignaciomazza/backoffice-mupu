// src/pages/api/earnings/by-booking.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { computeBillingAdjustments } from "@/utils/billingAdjustments";
import type { BillingAdjustmentConfig } from "@/types";
import {
  canAccessBookingByRole,
  getFinanceSectionGrants,
} from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";

type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  role?: string;
};

function normalizeSaleTotals(
  input: unknown,
  allowed?: Set<string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  const obj = input as Record<string, unknown>;
  for (const [keyRaw, val] of Object.entries(obj)) {
    const key = String(keyRaw || "").trim().toUpperCase();
    if (!key) continue;
    if (allowed && allowed.size > 0 && !allowed.has(key)) continue;
    const n =
      typeof val === "number"
        ? val
        : Number(String(val).replace(",", "."));
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

async function getAuth(
  req: NextApiRequest,
): Promise<{ id_agency: number; id_user: number; role: string } | null> {
  try {
    const cookieTok = req.cookies?.token;
    let token = cookieTok && typeof cookieTok === "string" ? cookieTok : null;
    if (!token) {
      const auth = req.headers.authorization || "";
      if (auth.startsWith("Bearer ")) token = auth.slice(7);
    }
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;
    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || 0;
    const role = String(p.role || "");
    if (!id_user || !id_agency) return null;
    return { id_agency, id_user, role };
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | {
        ownerPct: number;
        commissionBaseByCurrency: Record<string, number>;
        sellerEarningsByCurrency: Record<string, number>;
      }
    | { error: string }
  >,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const bookingId = Number(req.query.bookingId);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "bookingId inválido" });
  }

  const auth = await getAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });
  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canEarnings = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "earnings",
  );

  try {
    // Booking + owner + fecha
    const booking = await prisma.booking.findUnique({
      where: { id_booking: bookingId },
      select: {
        id_booking: true,
        id_agency: true,
        id_user: true,
        creation_date: true,
        sale_totals: true,
      },
    });
    if (!booking || booking.id_agency !== auth.id_agency) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }
    const canReadByRole = await canAccessBookingByRole(auth, {
      id_user: booking.id_user,
      id_agency: booking.id_agency,
    });
    if (!canEarnings && !canReadByRole) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    const createdAt = booking.creation_date;
    const ownerId = booking.id_user;

    const agency = await prisma.agency.findUnique({
      where: { id_agency: auth.id_agency },
      select: { transfer_fee_pct: true },
    });
    const agencyFeePct =
      agency?.transfer_fee_pct != null ? Number(agency.transfer_fee_pct) : 0.024;
    const calcConfig = await prisma.serviceCalcConfig.findUnique({
      where: { id_agency: auth.id_agency },
      select: { use_booking_sale_total: true, billing_adjustments: true },
    });
    const useBookingSaleTotal = Boolean(calcConfig?.use_booking_sale_total);
    const billingAdjustments = Array.isArray(calcConfig?.billing_adjustments)
      ? (calcConfig?.billing_adjustments as unknown[])
      : [];

    const currencyRows = await prisma.financeCurrency.findMany({
      where: { id_agency: auth.id_agency, enabled: true },
      select: { code: true },
    });
    const enabledCurrencies = new Set(
      currencyRows
        .map((c) => String(c.code || "").trim().toUpperCase())
        .filter(Boolean),
    );
    const hasCurrencyFilter = enabledCurrencies.size > 0;
    const isCurrencyAllowed = (cur: string) =>
      !!cur && (!hasCurrencyFilter || enabledCurrencies.has(cur));

    // Servicios de la reserva (para base de comisión)
    const services = await prisma.service.findMany({
      // ⬇️ filtrar por la relación booking
      where: { booking: { id_booking: bookingId } },
      select: {
        currency: true,
        sale_price: true,
        cost_price: true,
        other_taxes: true,
        totalCommissionWithoutVAT: true,
        transfer_fee_amount: true,
        transfer_fee_pct: true,
        extra_costs_amount: true,
        extra_taxes_amount: true,
      },
    });

    const commissionBaseByCurrency: Record<string, number> = {};
    const inc = (cur: string, amount: number) => {
      if (!isCurrencyAllowed(cur)) return;
      commissionBaseByCurrency[cur] = (commissionBaseByCurrency[cur] || 0) + amount;
    };

    if (useBookingSaleTotal) {
      const addTo = (acc: Record<string, number>, cur: string, val: number) => {
        if (!isCurrencyAllowed(cur)) return;
        acc[cur] = (acc[cur] || 0) + val;
      };

      const saleTotals = normalizeSaleTotals(
        booking.sale_totals,
        hasCurrencyFilter ? enabledCurrencies : undefined,
      );
      const fallbackTotals: Record<string, number> = {};
      const costTotals: Record<string, number> = {};
      const taxTotals: Record<string, number> = {};

      for (const s of services) {
        const cur = String(s.currency || "").trim().toUpperCase();
        if (!cur) continue;
        addTo(fallbackTotals, cur, Number(s.sale_price) || 0);
        addTo(costTotals, cur, Number(s.cost_price) || 0);
        addTo(taxTotals, cur, Number(s.other_taxes) || 0);
      }

      const totals =
        Object.keys(saleTotals).length > 0 ? saleTotals : fallbackTotals;

      for (const [cur, total] of Object.entries(totals)) {
        if (!isCurrencyAllowed(cur)) continue;
        const sale = Number(total) || 0;
        const cost = Number(costTotals[cur] || 0);
        const taxes = Number(taxTotals[cur] || 0);
        const commissionBeforeFee = Math.max(sale - cost - taxes, 0);
        const fee =
          sale * (Number.isFinite(agencyFeePct) ? agencyFeePct : 0.024);
        const adjustments = computeBillingAdjustments(
          billingAdjustments as BillingAdjustmentConfig[],
          sale,
          cost,
        ).total;
        commissionBaseByCurrency[cur] = Math.max(
          commissionBeforeFee - fee - adjustments,
          0,
        );
      }
    } else {
      // Base por moneda (mismo cálculo de /api/earnings)
      for (const s of services) {
        const cur = String(s.currency || "").trim().toUpperCase();
        if (!cur) continue;
        if (!isCurrencyAllowed(cur)) continue;
        const sale = Number(s.sale_price) || 0;
        const pct =
          s.transfer_fee_pct != null ? Number(s.transfer_fee_pct) : agencyFeePct;
        const fee =
          s.transfer_fee_amount != null
            ? Number(s.transfer_fee_amount)
            : sale * (Number.isFinite(pct) ? pct : 0.024);
        const dbCommission = Number(s.totalCommissionWithoutVAT ?? 0);
        const extraCosts = Number(s.extra_costs_amount ?? 0);
        const extraTaxes = Number(s.extra_taxes_amount ?? 0);
        inc(
          cur,
          Math.max(dbCommission - fee - extraCosts - extraTaxes, 0),
        );
      }
    }

    // Resolver regla efectiva (última con valid_from <= createdAt; null = -∞)
    const rules = await prisma.commissionRuleSet.findMany({
      where: { id_agency: auth.id_agency, owner_user_id: ownerId },
      select: { valid_from: true, own_pct: true },
      orderBy: { valid_from: "asc" },
    });

    const createdTs = createdAt.getTime();
    let ownerPct = 100;
    let bestTs = Number.NEGATIVE_INFINITY;
    for (const r of rules) {
      const ts = r.valid_from
        ? r.valid_from.getTime()
        : Number.NEGATIVE_INFINITY;
      if (ts <= createdTs && ts >= bestTs) {
        bestTs = ts;
        ownerPct = Number(r.own_pct);
      }
    }

    const factor = (ownerPct || 0) / 100;
    const sellerEarningsByCurrency: Record<string, number> = {};
    for (const [cur, base] of Object.entries(commissionBaseByCurrency)) {
      sellerEarningsByCurrency[cur] = base * factor;
    }

    return res.status(200).json({
      ownerPct,
      commissionBaseByCurrency,
      sellerEarningsByCurrency,
    });
  } catch (err) {
    console.error("[earnings/by-booking][GET]", err);
    return res.status(500).json({ error: "Error obteniendo datos" });
  }
}
