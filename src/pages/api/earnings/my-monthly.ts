// src/pages/api/earnings/my-monthly.ts

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { computeBillingAdjustments } from "@/utils/billingAdjustments";
import type { BillingAdjustmentConfig } from "@/types";
import { jwtVerify, type JWTPayload } from "jose";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";

/* ============ Auth helpers ============ */
type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  role?: string;
};

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

async function getAuth(
  req: NextApiRequest,
): Promise<{ id_user: number; id_agency: number; role: string } | null> {
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
    return { id_user, id_agency, role };
  } catch {
    return null;
  }
}

/* ============ Utils (TZ) ============ */
function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Convierte "YYYY-MM-DD" (día local en `timeZone`) al instante UTC de las 00:00:00 locales.
 * No depende de la tz del servidor y maneja DST.
 */
function startOfDayUTCFromYmdInTz(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const approx = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const partsObj = Object.fromEntries(
    fmt.formatToParts(approx).map((p) => [p.type, p.value]),
  );
  const hh = Number(partsObj.hour ?? 0);
  const mm = Number(partsObj.minute ?? 0);
  const ss = Number(partsObj.second ?? 0);
  const deltaMs = ((hh * 60 + mm) * 60 + ss) * 1000;
  return new Date(approx.getTime() - deltaMs);
}

function monthKeyInTz(d: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  const yy = parts.year || "0000";
  const mm = parts.month || "01";
  return `${yy}-${mm}`;
}

function parseCsvParam(input: string | string[] | undefined): string[] | null {
  if (typeof input === "string") {
    const items = input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length ? items : null;
  }
  if (Array.isArray(input)) {
    const items = input.map((s) => String(s).trim()).filter(Boolean);
    return items.length ? items : null;
  }
  return null;
}

function parsePaidPct(input: string | string[] | undefined): number {
  const raw =
    typeof input === "string"
      ? Number(input)
      : Array.isArray(input)
        ? Number(input[0])
        : NaN;
  if (!Number.isFinite(raw)) return 0.4;
  if (raw <= 1) return Math.max(0, raw);
  return Math.max(0, raw / 100);
}

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

/* ============ Tipos respuesta ============ */
export type MyMonthlyItem = {
  month: string; // YYYY-MM (tz BA)
  currency: string; // "ARS" | "USD" | ...
  seller: number; // lo que cobro como dueño
  beneficiary: number; // lo que cobro como Lideres de equipo
  total: number; // seller + beneficiary
};
export type MyMonthlyResponse = {
  items: MyMonthlyItem[];
  totalsByCurrency: Record<
    string,
    { seller: number; beneficiary: number; total: number }
  >;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MyMonthlyResponse | { error: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const auth = await getAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });
  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canMyEarnings = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "earnings_my",
  );
  if (!canMyEarnings) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const {
    from,
    to,
    dateField,
    minPaidPct,
    clientStatus,
    operatorStatus,
    paymentMethodId,
    accountId,
  } = req.query;
  if (typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({ error: "Parámetros from y to requeridos" });
  }
  const timeZone = DEFAULT_TZ;
  const dateFieldKey =
    String(dateField || "").toLowerCase() === "departure" ||
    String(dateField || "").toLowerCase() === "travel" ||
    String(dateField || "").toLowerCase() === "viaje"
      ? "departure_date"
      : "creation_date";
  const paidPct = parsePaidPct(minPaidPct);
  const clientStatusArr = parseCsvParam(clientStatus)?.filter(
    (s) => s !== "Todas",
  );
  const operatorStatusArr = parseCsvParam(operatorStatus)?.filter(
    (s) => s !== "Todas",
  );
  const parsedPaymentMethodId = Number(
    Array.isArray(paymentMethodId) ? paymentMethodId[0] : paymentMethodId,
  );
  const parsedAccountId = Number(
    Array.isArray(accountId) ? accountId[0] : accountId,
  );

  // Límites en UTC (incluye 'from' y excluye día siguiente a 'to')
  const fromDate = startOfDayUTCFromYmdInTz(from, timeZone);
  const toDateExclusive = startOfDayUTCFromYmdInTz(addDaysYMD(to, 1), timeZone);

  try {
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
      ? (calcConfig?.billing_adjustments as BillingAdjustmentConfig[])
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

    const bookingDateFilter =
      dateFieldKey === "departure_date"
        ? { departure_date: { gte: fromDate, lt: toDateExclusive } }
        : { creation_date: { gte: fromDate, lt: toDateExclusive } };

    // 1) Servicios del rango (fecha seleccionada en booking) de MI agencia
    const services = await prisma.service.findMany({
      where: {
        booking: {
          id_agency: auth.id_agency,
          ...bookingDateFilter,
          ...(clientStatusArr?.length
            ? { clientStatus: { in: clientStatusArr } }
            : {}),
          ...(operatorStatusArr?.length
            ? { operatorStatus: { in: operatorStatusArr } }
            : {}),
        },
      },
      select: {
        booking_id: true,
        sale_price: true,
        cost_price: true,
        other_taxes: true,
        currency: true,
        totalCommissionWithoutVAT: true,
        transfer_fee_amount: true,
        transfer_fee_pct: true,
        extra_costs_amount: true,
        extra_taxes_amount: true,
      },
    });

    if (services.length === 0) {
      return res.status(200).json({ items: [], totalsByCurrency: {} });
    }

    const isCurrencyAllowed = (cur: string) =>
      !!cur && (!hasCurrencyFilter || enabledCurrencies.has(cur));
    const addByBooking = (
      map: Map<number, Record<string, number>>,
      bid: number,
      cur: string,
      amount: number,
    ) => {
      if (!isCurrencyAllowed(cur)) return;
      const prev = map.get(bid) || {};
      prev[cur] = (prev[cur] || 0) + amount;
      map.set(bid, prev);
    };

    const fallbackSaleTotalsByBooking = new Map<number, Record<string, number>>();
    const costTotalsByBooking = new Map<number, Record<string, number>>();
    const taxTotalsByBooking = new Map<number, Record<string, number>>();

    for (const svc of services) {
      const bid = svc.booking_id;
      const cur = String(svc.currency || "").trim().toUpperCase();
      if (!cur) continue;

      addByBooking(
        fallbackSaleTotalsByBooking,
        bid,
        cur,
        Number(svc.sale_price) || 0,
      );
      addByBooking(
        costTotalsByBooking,
        bid,
        cur,
        Number(svc.cost_price) || 0,
      );
      addByBooking(
        taxTotalsByBooking,
        bid,
        cur,
        Number(svc.other_taxes) || 0,
      );
    }

    // 2) Venta por reserva/moneda (para deuda y 40%)
    const saleTotalsByBooking = new Map<number, Record<string, number>>();
    const bookingCreatedAt = new Map<number, Date>();
    const bookingDepartureAt = new Map<number, Date>();
    const bookingOwner = new Map<number, { id: number; name: string }>();
    let bookings: Array<{
      id_booking: number;
      creation_date: Date;
      departure_date: Date;
      sale_totals: unknown | null;
      user: { id_user: number; first_name: string; last_name: string };
    }> = [];

    const bookingIds = Array.from(
      new Set(services.map((svc) => svc.booking_id)),
    );
    if (bookingIds.length > 0) {
      bookings = await prisma.booking.findMany({
        where: { id_agency: auth.id_agency, id_booking: { in: bookingIds } },
        select: {
          id_booking: true,
          creation_date: true,
          departure_date: true,
          sale_totals: true,
          user: { select: { id_user: true, first_name: true, last_name: true } },
        },
      });
      for (const b of bookings) {
        bookingCreatedAt.set(b.id_booking, b.creation_date);
        bookingDepartureAt.set(b.id_booking, b.departure_date);
        bookingOwner.set(b.id_booking, {
          id: b.user.id_user,
          name: `${b.user.first_name} ${b.user.last_name}`,
        });
      }
    }

    if (useBookingSaleTotal) {
      bookings.forEach((b) => {
        const normalized = normalizeSaleTotals(
          b.sale_totals,
          hasCurrencyFilter ? enabledCurrencies : undefined,
        );
        const fallback = fallbackSaleTotalsByBooking.get(b.id_booking) || {};
        const hasValues = Object.values(normalized).some((v) => v > 0);
        saleTotalsByBooking.set(b.id_booking, hasValues ? normalized : fallback);
      });
    } else {
      fallbackSaleTotalsByBooking.forEach((totals, bid) => {
        saleTotalsByBooking.set(bid, totals);
      });
    }

    // 3) Recibos → validar 40% cobrado en la misma moneda
    const receiptWhere: Record<string, unknown> = {
      bookingId_booking: { in: Array.from(saleTotalsByBooking.keys()) },
    };
    if (Number.isFinite(parsedPaymentMethodId) && parsedPaymentMethodId > 0) {
      receiptWhere.payment_method_id = parsedPaymentMethodId;
    }
    if (Number.isFinite(parsedAccountId) && parsedAccountId > 0) {
      receiptWhere.account_id = parsedAccountId;
    }
    const allReceipts = await prisma.receipt.findMany({
      where: receiptWhere,
      select: {
        bookingId_booking: true,
        amount: true,
        amount_currency: true,
        base_amount: true,
        base_currency: true,
      },
    });

    const receiptsMap = new Map<number, Record<string, number>>();
    for (const r of allReceipts) {
      const bid = r.bookingId_booking;
      if (bid == null) continue; // evita TS2345
      const useBase = r.base_amount != null && r.base_currency;
      const cur = String(
        useBase ? r.base_currency : r.amount_currency || "",
      )
        .trim()
        .toUpperCase();
      if (!isCurrencyAllowed(cur)) continue;
      const prev = receiptsMap.get(bid) || {};
      const val = Number(useBase ? r.base_amount : r.amount) || 0;
      prev[cur] = (prev[cur] || 0) + val;
      receiptsMap.set(bid, prev);
    }

    const validBookingCurrency = new Set<string>();
    saleTotalsByBooking.forEach((totalsByCur, bid) => {
      const paid = receiptsMap.get(bid) || {};
      for (const [cur, total] of Object.entries(totalsByCur)) {
        const t = Number(total) || 0;
        const p = Number(paid[cur] || 0);
        if (t > 0 && p / t >= paidPct) {
          validBookingCurrency.add(`${bid}-${cur}`);
        }
      }
    });

    // 4) Reglas de comisión (para dueños)
    const ownerIds = Array.from(
      new Set(Array.from(bookingOwner.values()).map((o) => o.id)),
    );
    const ruleSets = await prisma.commissionRuleSet.findMany({
      where: { id_agency: auth.id_agency, owner_user_id: { in: ownerIds } },
      include: { shares: true },
      orderBy: [{ owner_user_id: "asc" }, { valid_from: "asc" }],
    });
    const rulesByOwner = new Map<number, typeof ruleSets>();
    for (const rs of ruleSets) {
      const arr = rulesByOwner.get(rs.owner_user_id) || [];
      arr.push(rs);
      rulesByOwner.set(rs.owner_user_id, arr);
    }

    function resolveRule(
      ownerId: number,
      createdAt: Date,
      meId: number,
    ): { ownPct: number; beneficiaryPctForMe: number } {
      const list = rulesByOwner.get(ownerId);
      if (!list || list.length === 0)
        return { ownPct: 100, beneficiaryPctForMe: 0 };

      let chosen = list[0];
      for (const r of list) {
        if (r.valid_from <= createdAt) chosen = r;
        else break;
      }
      if (chosen.valid_from > createdAt)
        return { ownPct: 100, beneficiaryPctForMe: 0 };

      const myShare = chosen.shares
        .filter((s) => s.beneficiary_user_id === meId)
        .reduce((a, s) => a + Number(s.percent), 0);

      return { ownPct: Number(chosen.own_pct), beneficiaryPctForMe: myShare };
    }

    // 5) Agregar por MES (tz BA) y MONEDA
    const monthly = new Map<
      string,
      Map<string, { seller: number; beneficiary: number; total: number }>
    >();
    const totalsByCurrency: Record<
      string,
      { seller: number; beneficiary: number; total: number }
    > = {};

    if (useBookingSaleTotal) {
      const commissionBaseByBooking = new Map<number, Record<string, number>>();

      saleTotalsByBooking.forEach((totalsByCur, bid) => {
        const costTotals = costTotalsByBooking.get(bid) || {};
        const taxTotals = taxTotalsByBooking.get(bid) || {};
        const baseByCur: Record<string, number> = {};

        for (const [cur, total] of Object.entries(totalsByCur)) {
          const sale = Number(total) || 0;
          const cost = Number(costTotals[cur] || 0);
          const taxes = Number(taxTotals[cur] || 0);
          const commissionBeforeFee = Math.max(sale - cost - taxes, 0);
          const fee =
            sale * (Number.isFinite(agencyFeePct) ? agencyFeePct : 0.024);
          const adjustments = computeBillingAdjustments(
            billingAdjustments,
            sale,
            cost,
          ).total;
          baseByCur[cur] = Math.max(
            commissionBeforeFee - fee - adjustments,
            0,
          );
        }

        commissionBaseByBooking.set(bid, baseByCur);
      });

      for (const [bid, baseByCur] of commissionBaseByBooking.entries()) {
        const createdAt = bookingCreatedAt.get(bid);
        const owner = bookingOwner.get(bid);
        if (!createdAt || !owner) continue;
        const groupDate =
          dateFieldKey === "departure_date"
            ? bookingDepartureAt.get(bid)
            : createdAt;
        if (!groupDate) continue;
        const month = monthKeyInTz(groupDate, timeZone);
        const ownerId = owner.id;

        const { ownPct, beneficiaryPctForMe } = resolveRule(
          ownerId,
          createdAt,
          auth.id_user,
        );

        for (const [cur, commissionBase] of Object.entries(baseByCur)) {
          if (!validBookingCurrency.has(`${bid}-${cur}`)) continue;

          let sellerAmt = 0;
          let beneficiaryAmt = 0;

          if (ownerId === auth.id_user) {
            sellerAmt = commissionBase * (ownPct / 100);
          }
          if (beneficiaryPctForMe > 0) {
            beneficiaryAmt = commissionBase * (beneficiaryPctForMe / 100);
          }

          const totalAmt = sellerAmt + beneficiaryAmt;

          if (!monthly.has(month)) monthly.set(month, new Map());
          const byCur = monthly.get(month)!;
          const slot = byCur.get(cur) || { seller: 0, beneficiary: 0, total: 0 };
          slot.seller += sellerAmt;
          slot.beneficiary += beneficiaryAmt;
          slot.total += totalAmt;
          byCur.set(cur, slot);

          const t = totalsByCurrency[cur] || {
            seller: 0,
            beneficiary: 0,
            total: 0,
          };
          t.seller += sellerAmt;
          t.beneficiary += beneficiaryAmt;
          t.total += totalAmt;
          totalsByCurrency[cur] = t;
        }
      }
    } else {
      for (const svc of services) {
        const bid = svc.booking_id;
        const cur = String(svc.currency || "").trim().toUpperCase();
        if (!cur) continue;
        if (!validBookingCurrency.has(`${bid}-${cur}`)) continue;

        const createdAt = bookingCreatedAt.get(bid);
        const owner = bookingOwner.get(bid);
        if (!createdAt || !owner) continue;
        const groupDate =
          dateFieldKey === "departure_date"
            ? bookingDepartureAt.get(bid)
            : createdAt;
        if (!groupDate) continue;
        const month = monthKeyInTz(groupDate, timeZone);
        const ownerId = owner.id;

        // base de comisión (mismo criterio que /earnings)
        const sale = Number(svc.sale_price) || 0;
        const pct =
          svc.transfer_fee_pct != null
            ? Number(svc.transfer_fee_pct)
            : agencyFeePct;
        const fee =
          svc.transfer_fee_amount != null
            ? Number(svc.transfer_fee_amount)
            : sale * (Number.isFinite(pct) ? pct : 0.024);
        const dbCommission = Number(svc.totalCommissionWithoutVAT ?? 0);
        const extraCosts = Number(svc.extra_costs_amount ?? 0);
        const extraTaxes = Number(svc.extra_taxes_amount ?? 0);
        const commissionBase = Math.max(
          dbCommission - fee - extraCosts - extraTaxes,
          0,
        );

        const { ownPct, beneficiaryPctForMe } = resolveRule(
          ownerId,
          createdAt,
          auth.id_user,
        );

        let sellerAmt = 0;
        let beneficiaryAmt = 0;

        if (ownerId === auth.id_user) {
          sellerAmt = commissionBase * (ownPct / 100);
        }
        if (beneficiaryPctForMe > 0) {
          beneficiaryAmt = commissionBase * (beneficiaryPctForMe / 100);
        }

        const totalAmt = sellerAmt + beneficiaryAmt;

        if (!monthly.has(month)) monthly.set(month, new Map());
        const byCur = monthly.get(month)!;
        const slot = byCur.get(cur) || { seller: 0, beneficiary: 0, total: 0 };
        slot.seller += sellerAmt;
        slot.beneficiary += beneficiaryAmt;
        slot.total += totalAmt;
        byCur.set(cur, slot);

        const t = totalsByCurrency[cur] || {
          seller: 0,
          beneficiary: 0,
          total: 0,
        };
        t.seller += sellerAmt;
        t.beneficiary += beneficiaryAmt;
        t.total += totalAmt;
        totalsByCurrency[cur] = t;
      }
    }

    // 6) Aplanar para respuesta
    const items: MyMonthlyItem[] = [];
    const months = Array.from(monthly.keys()).sort(); // YYYY-MM ordenable
    for (const m of months) {
      const byCur = monthly.get(m)!;
      for (const cur of byCur.keys()) {
        const v = byCur.get(cur)!;
        items.push({
          month: m,
          currency: cur,
          seller: v.seller,
          beneficiary: v.beneficiary,
          total: v.total,
        });
      }
    }

    return res.status(200).json({ items, totalsByCurrency });
  } catch (err) {
    console.error("[earnings/my-monthly][GET]", err);
    return res.status(500).json({ error: "Error obteniendo datos" });
  }
}
