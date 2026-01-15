// src/pages/api/earnings/by-booking.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { computeBillingAdjustments } from "@/utils/billingAdjustments";
import type { BillingAdjustmentConfig } from "@/types";

type TokenPayload = JWTPayload & { 
  id_user?: number;
  userId?: number;
  uid?: number;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
};

function normalizeSaleTotals(
  input: unknown,
): Record<"ARS" | "USD", number> {
  const out: Record<"ARS" | "USD", number> = { ARS: 0, USD: 0 };
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  const obj = input as Record<string, unknown>;
  for (const [keyRaw, val] of Object.entries(obj)) {
    const key = String(keyRaw || "").toUpperCase();
    if (key !== "ARS" && key !== "USD") continue;
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
): Promise<{ id_agency: number } | null> {
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
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || 0;
    if (!id_agency) return null;
    return { id_agency };
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | {
        ownerPct: number;
        commissionBaseByCurrency: Record<"ARS" | "USD", number>;
        sellerEarningsByCurrency: Record<"ARS" | "USD", number>;
      }
    | { error: string }
  >,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const auth = await getAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  const bookingId = Number(req.query.bookingId);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "bookingId inválido" });
  }

  try {
    // Booking + owner + fecha
    const booking = await prisma.booking.findUnique({
      where: { id_booking: bookingId },
      include: { user: true },
    });
    if (!booking || booking.id_agency !== auth.id_agency) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    const createdAt = booking.creation_date;
    // ⬇️ usar el id desde la relación incluída
    const ownerId = booking.user.id_user;

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

    const commissionBaseByCurrency: Record<"ARS" | "USD", number> = {
      ARS: 0,
      USD: 0,
    };

    if (useBookingSaleTotal) {
      const saleTotals = normalizeSaleTotals(booking.sale_totals);
      const fallbackTotals = services.reduce<Record<"ARS" | "USD", number>>(
        (acc, s) => {
          const cur = (s.currency as "ARS" | "USD") || "ARS";
          acc[cur] += Number(s.sale_price) || 0;
          return acc;
        },
        { ARS: 0, USD: 0 },
      );
      const totals =
        saleTotals.ARS || saleTotals.USD ? saleTotals : fallbackTotals;

      const costTotals = services.reduce<Record<"ARS" | "USD", number>>(
        (acc, s) => {
          const cur = (s.currency as "ARS" | "USD") || "ARS";
          acc[cur] += Number(s.cost_price) || 0;
          return acc;
        },
        { ARS: 0, USD: 0 },
      );

      const taxTotals = services.reduce<Record<"ARS" | "USD", number>>(
        (acc, s) => {
          const cur = (s.currency as "ARS" | "USD") || "ARS";
          acc[cur] += Number(s.other_taxes) || 0;
          return acc;
        },
        { ARS: 0, USD: 0 },
      );

      (["ARS", "USD"] as const).forEach((cur) => {
        const sale = totals[cur] || 0;
        const cost = costTotals[cur] || 0;
        const taxes = taxTotals[cur] || 0;
        const commissionBeforeFee = Math.max(sale - cost - taxes, 0);
        const fee = sale * (Number.isFinite(agencyFeePct) ? agencyFeePct : 0.024);
        const adjustments = computeBillingAdjustments(
          billingAdjustments as BillingAdjustmentConfig[],
          sale,
          cost,
        ).total;
        commissionBaseByCurrency[cur] = Math.max(
          commissionBeforeFee - fee - adjustments,
          0,
        );
      });
    } else {
      // Base por moneda (mismo cálculo de /api/earnings)
      for (const s of services) {
        const cur = (s.currency as "ARS" | "USD") || "ARS";
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
        commissionBaseByCurrency[cur] += Math.max(
          dbCommission - fee - extraCosts - extraTaxes,
          0,
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
    const sellerEarningsByCurrency: Record<"ARS" | "USD", number> = {
      ARS: commissionBaseByCurrency.ARS * factor,
      USD: commissionBaseByCurrency.USD * factor,
    };

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
