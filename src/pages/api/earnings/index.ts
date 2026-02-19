// src/pages/api/earnings/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { computeBillingAdjustments } from "@/utils/billingAdjustments";
import type { BillingAdjustmentConfig } from "@/types";
import type { CommissionRule } from "@/types/commission";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";
import {
  normalizeCommissionOverridesLenient,
  pruneOverridesByLeaderIds,
  resolveCommissionForContext,
  sanitizeCommissionOverrides,
} from "@/utils/commissionOverrides";
import {
  addDaysToDateKey,
  startOfDayUtcFromDateKeyInBuenosAires,
  toDateKeyInBuenosAiresLegacySafe,
} from "@/lib/buenosAiresDate";

interface EarningItem {
  currency: string;
  userId: number; // dueño de la reserva (seller)
  userName: string;
  teamId: number;
  teamName: string;
  totalSellerComm: number;
  totalLeaderComm: number; // <-- todos los Lideres de equipo distintos del dueño
  totalAgencyShare: number;
  debt: number;
  bookingIds: number[];
}
interface EarningsResponse {
  totals: {
    sellerComm: Record<string, number>;
    leaderComm: Record<string, number>;
    agencyShare: Record<string, number>;
  };
  statsByCurrency: Record<
    string,
    {
      saleTotal: number;
      paidTotal: number;
      debtTotal: number;
      commissionTotal: number;
      paymentRate: number;
    }
  >;
  breakdowns: {
    byCountry: Record<string, Record<string, number>>;
    byMethod: Record<string, Record<string, number>>;
  };
  items: EarningItem[];
}

// ===== Auth (para agencia) =====
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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isDateKeyWithinRange(
  key: string | null | undefined,
  fromKey: string,
  toKey: string,
): boolean {
  return !!key && key >= fromKey && key <= toKey;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EarningsResponse | { error: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const auth = await getAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  const planAccess = await ensurePlanFeatureAccess(
    auth.id_agency,
    "earnings",
  );
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canEarnings = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "earnings",
  );
  if (!canEarnings) {
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
    teamId,
  } = req.query;
  if (typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({ error: "Parámetros from y to requeridos" });
  }

  const fromDate = startOfDayUtcFromDateKeyInBuenosAires(from);
  const toPlusOne = addDaysToDateKey(to, 1);
  const toDateExclusive = toPlusOne
    ? startOfDayUtcFromDateKeyInBuenosAires(toPlusOne)
    : null;
  if (!fromDate || !toDateExclusive) {
    return res.status(400).json({ error: "Parámetros from/to inválidos" });
  }
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
  const parsedTeamId = Number(Array.isArray(teamId) ? teamId[0] : teamId);
  const dateFieldKey =
    String(dateField || "").toLowerCase() === "departure" ||
    String(dateField || "").toLowerCase() === "travel" ||
    String(dateField || "").toLowerCase() === "viaje"
      ? "departure_date"
      : "creation_date";

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

    // 1) Equipos/usuarios de MI agencia (para etiquetar por equipo)
    const teams = await prisma.salesTeam.findMany({
      where: { id_agency: auth.id_agency },
      include: { user_teams: { include: { user: true } } },
    });
    const teamMap = new Map<number, { name: string; members: number[] }>();
    const userToMemberTeams = new Map<number, number[]>();
    teams.forEach(({ id_team, name, user_teams }) => {
      const members = user_teams.map((ut) => ut.user.id_user);
      teamMap.set(id_team, { name, members });
      members.forEach((uid) => {
        userToMemberTeams.set(uid, [
          ...(userToMemberTeams.get(uid) || []),
          id_team,
        ]);
      });
    });

    const expandedFrom = new Date(fromDate.getTime() - ONE_DAY_MS);
    const expandedToExclusive = new Date(toDateExclusive.getTime() + ONE_DAY_MS);
    const bookingDateFilter =
      dateFieldKey === "departure_date"
        ? { departure_date: { gte: expandedFrom, lt: expandedToExclusive } }
        : { creation_date: { gte: expandedFrom, lt: expandedToExclusive } };

    // 2) Servicios del rango (por fecha seleccionada en booking) SOLO de mi agencia
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
        id_service: true,
        booking_id: true,
        currency: true,
        sale_price: true,
        cost_price: true,
        other_taxes: true,
        totalCommissionWithoutVAT: true,
        transfer_fee_amount: true,
        transfer_fee_pct: true,
        extra_costs_amount: true,
        extra_taxes_amount: true,
        destination: true,
        ServiceDestination: {
          select: {
            destination: {
              select: { name: true, slug: true, country: true },
            },
          },
        },
      },
    });

    if (services.length === 0) {
      return res.status(200).json({
        totals: { sellerComm: {}, leaderComm: {}, agencyShare: {} },
        statsByCurrency: {},
        breakdowns: { byCountry: {}, byMethod: {} },
        items: [],
      });
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

    const bookingCountry = new Map<number, string>();

    services.forEach((svc) => {
      const bid = svc.booking_id;
      const cur = String(svc.currency || "").trim().toUpperCase();
      if (!cur) return;

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

      if (!bookingCountry.has(bid)) {
        const sd = svc.ServiceDestination?.[0];
        const country = sd?.destination?.country;
        const label =
          country?.iso2 ||
          country?.name ||
          (svc.destination || "").trim() ||
          "Sin pais";
        bookingCountry.set(bid, label);
      }
    });

    // 2.1) Dueños (vendedores) de cada booking (siempre desde Booking)
    const bookingOwners = new Map<
      number,
      { userId: number; userName: string; bookingCreatedAt: Date }
    >();
    let bookings: Array<{
      id_booking: number;
      creation_date: Date;
      departure_date: Date;
      sale_totals: unknown | null;
      commission_overrides: unknown | null;
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
          commission_overrides: true,
          user: { select: { id_user: true, first_name: true, last_name: true } },
        },
      });
      bookings.forEach((b) => {
        bookingOwners.set(b.id_booking, {
          userId: b.user.id_user,
          userName: `${b.user.first_name} ${b.user.last_name}`,
          bookingCreatedAt: b.creation_date,
        });
      });
    }

    const overridesByBooking = new Map<
      number,
      ReturnType<typeof normalizeCommissionOverridesLenient>
    >();
    bookings.forEach((b) => {
      overridesByBooking.set(
        b.id_booking,
        normalizeCommissionOverridesLenient(b.commission_overrides),
      );
    });

    const matchesTeamFilter = (userId: number): boolean => {
      if (!Number.isFinite(parsedTeamId) || parsedTeamId <= 0) return true;
      const teamIds = userToMemberTeams.get(userId) || [];
      return teamIds.includes(parsedTeamId);
    };
    const allowedBookingIdsByDate = new Set<number>();
    bookings.forEach((b) => {
      const rawDate =
        dateFieldKey === "departure_date" ? b.departure_date : b.creation_date;
      const key = toDateKeyInBuenosAiresLegacySafe(rawDate);
      if (isDateKeyWithinRange(key, from, to)) {
        allowedBookingIdsByDate.add(b.id_booking);
      }
    });
    const allowedBookingIds = new Set<number>();
    bookingOwners.forEach((owner, bid) => {
      if (
        matchesTeamFilter(owner.userId) &&
        allowedBookingIdsByDate.has(bid)
      ) {
        allowedBookingIds.add(bid);
      }
    });

    if (allowedBookingIds.size === 0) {
      return res.status(200).json({
        totals: { sellerComm: {}, leaderComm: {}, agencyShare: {} },
        statsByCurrency: {},
        breakdowns: { byCountry: {}, byMethod: {} },
        items: [],
      });
    }

    // 3) Venta total por reserva/moneda (para deuda y % pago)
    const saleTotalsByBooking = new Map<number, Record<string, number>>();
    if (useBookingSaleTotal) {
      bookings.forEach((b) => {
        if (!allowedBookingIds.has(b.id_booking)) return;
        const normalized = normalizeSaleTotals(
          b.sale_totals,
          hasCurrencyFilter ? enabledCurrencies : undefined,
        );
        const fallback = fallbackSaleTotalsByBooking.get(b.id_booking) || {};
        const hasValues = Object.values(normalized).some((v) => v > 0);
        saleTotalsByBooking.set(
          b.id_booking,
          hasValues ? normalized : fallback,
        );
      });
    } else {
      fallbackSaleTotalsByBooking.forEach((totals, bid) => {
        if (!allowedBookingIds.has(bid)) return;
        saleTotalsByBooking.set(bid, totals);
      });
    }

    // 4) Recibos de esas reservas (misma agencia por FK booking)
    const receiptBookingIds = Array.from(saleTotalsByBooking.keys()).filter(
      (bid) => allowedBookingIds.has(bid),
    );
    const receiptWhere: Record<string, unknown> = {
      bookingId_booking: { in: receiptBookingIds },
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
        payment_method: true,
        payment_method_id: true,
        account: true,
        account_id: true,
      },
    });

    const receiptsMap = new Map<number, Record<string, number>>();
    const receiptsByBookingMethod = new Map<
      number,
      { methodLabel: string; currency: string; amount: number }[]
    >();

    for (const r of allReceipts) {
      const bid = r.bookingId_booking;
      if (bid == null) continue; // evita TS2345 y casos sin booking
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

      const methodLabel =
        (r.payment_method || "").trim() ||
        (r.payment_method_id ? `Metodo #${r.payment_method_id}` : "Sin metodo");
      const list = receiptsByBookingMethod.get(bid) || [];
      list.push({ methodLabel, currency: cur, amount: val });
      receiptsByBookingMethod.set(bid, list);
    }

    // 5) Validar % cobrado en la misma moneda
    const validBookingCurrency = new Set<string>();
    saleTotalsByBooking.forEach((totals, bid) => {
      const paid = receiptsMap.get(bid) || {};
      for (const [cur, total] of Object.entries(totals)) {
        const t = Number(total) || 0;
        const p = Number(paid[cur] || 0);
        if (t > 0 && p / t >= paidPct) {
          validBookingCurrency.add(`${bid}-${cur}`);
        }
      }
    });

    // 6) Deuda por reserva
    const debtByBooking = new Map<number, Record<string, number>>();
    saleTotalsByBooking.forEach((totals, bid) => {
      const paid = receiptsMap.get(bid) || {};
      const debt: Record<string, number> = {};
      for (const [cur, total] of Object.entries(totals)) {
        const t = Number(total) || 0;
        const p = Number(paid[cur] || 0);
        debt[cur] = t - p;
      }
      debtByBooking.set(bid, debt);
    });

    // 7) Prefetch de REGLAS por usuario (versión por valid_from <= creation_date)
    const uniqueOwners = Array.from(
      new Set(Array.from(bookingOwners.values()).map((o) => o.userId)),
    );
    const ruleSets = await prisma.commissionRuleSet.findMany({
      where: { id_agency: auth.id_agency, owner_user_id: { in: uniqueOwners } },
      include: { shares: true },
      orderBy: [{ owner_user_id: "asc" }, { valid_from: "asc" }], // ordenadas crecientes
    });
    const rulesByOwner = new Map<number, typeof ruleSets>();
    ruleSets.forEach((rs) => {
      const arr = rulesByOwner.get(rs.owner_user_id) || [];
      arr.push(rs);
      rulesByOwner.set(rs.owner_user_id, arr);
    });

    function resolveRule(
      ownerId: number,
      bookingCreatedAt: Date,
    ): CommissionRule {
      const list = rulesByOwner.get(ownerId);
      if (!list || list.length === 0) return { sellerPct: 100, leaders: [] };
      // tomamos la última con valid_from <= bookingCreatedAt
      let chosen = list[0];
      for (const r of list) {
        if (r.valid_from <= bookingCreatedAt) chosen = r;
        else break;
      }
      if (chosen.valid_from > bookingCreatedAt) {
        // todas empiezan después → usar default 100
        return { sellerPct: 100, leaders: [] };
      }
      return {
        sellerPct: Number(chosen.own_pct),
        leaders: chosen.shares.map((s) => ({
          userId: s.beneficiary_user_id,
          pct: Number(s.percent),
        })),
      };
    }

    // 8) Filtrar servicios válidos por % pago
    const filteredServices = useBookingSaleTotal
      ? []
      : services.filter((svc) =>
          validBookingCurrency.has(
            `${svc.booking_id}-${String(svc.currency || "")
              .trim()
              .toUpperCase()}`,
          ),
        );

    // 9) Agregación (una fila por vendedor+moneda, NO por equipo)
    const totals = {
      sellerComm: {} as Record<string, number>,
      leaderComm: {} as Record<string, number>,
      agencyShare: {} as Record<string, number>,
    };
    const statsByCurrency: EarningsResponse["statsByCurrency"] = {};
    const byCountry: EarningsResponse["breakdowns"]["byCountry"] = {};
    const byMethod: EarningsResponse["breakdowns"]["byMethod"] = {};
    const commissionByBooking = new Map<number, Record<string, number>>();

    const inc = (rec: Record<string, number>, cur: string, amount: number) => {
      rec[cur] = (rec[cur] || 0) + amount;
    };

    const ensureStats = (cur: string) => {
      if (!statsByCurrency[cur]) {
        statsByCurrency[cur] = {
          saleTotal: 0,
          paidTotal: 0,
          debtTotal: 0,
          commissionTotal: 0,
          paymentRate: 0,
        };
      }
    };

    saleTotalsByBooking.forEach((totalsByCur, bid) => {
      if (!allowedBookingIds.has(bid)) return;
      const paid = receiptsMap.get(bid) || {};
      for (const [cur, total] of Object.entries(totalsByCur)) {
        if (!validBookingCurrency.has(`${bid}-${cur}`)) continue;
        const sale = Number(total) || 0;
        const paidAmt = Number(paid[cur] || 0);
        ensureStats(cur);
        statsByCurrency[cur].saleTotal += sale;
        statsByCurrency[cur].paidTotal += paidAmt;
        statsByCurrency[cur].debtTotal += sale - paidAmt;
      }
    });

    receiptsByBookingMethod.forEach((entries, bid) => {
      if (!allowedBookingIds.has(bid)) return;
      for (const entry of entries) {
        if (!validBookingCurrency.has(`${bid}-${entry.currency}`)) continue;
        const bucket = byMethod[entry.methodLabel] || {};
        bucket[entry.currency] = (bucket[entry.currency] || 0) + entry.amount;
        byMethod[entry.methodLabel] = bucket;
      }
    });
    const itemsMap = new Map<string, EarningItem>();

    // Dado un usuario, armamos info de equipo para mostrar
    function getTeamDisplay(userId: number): {
      teamId: number;
      teamName: string;
    } {
      const teamIds = userToMemberTeams.get(userId) || [];

      if (!teamIds.length) {
        return { teamId: 0, teamName: "Sin equipo" };
      }

      const names = teamIds
        .map((id) => teamMap.get(id)?.name)
        .filter((n): n is string => Boolean(n));

      if (!names.length) {
        return { teamId: teamIds[0] ?? 0, teamName: "Sin equipo" };
      }

      if (names.length === 1) {
        return { teamId: teamIds[0], teamName: names[0] };
      }

      // Si está en varios equipos, mostramos todos en una sola etiqueta
      return {
        teamId: teamIds[0],
        teamName: names.join(" / "),
      };
    }

    function addRow(
      currency: string,
      userId: number,
      userName: string,
      sellerComm: number,
      leaderComm: number,
      agencyShare: number,
      debt: number,
      bid: number,
    ) {
      if (!matchesTeamFilter(userId)) return false;
      inc(totals.sellerComm, currency, sellerComm);
      inc(totals.leaderComm, currency, leaderComm);
      inc(totals.agencyShare, currency, agencyShare);

      const key = `${currency}-${userId}`;
      const existing = itemsMap.get(key);

      if (existing) {
        existing.totalSellerComm += sellerComm;
        existing.totalLeaderComm += leaderComm;
        existing.totalAgencyShare += agencyShare;

        // Deuda: sólo se suma una vez por reserva
        if (!existing.bookingIds.includes(bid)) {
          existing.debt = Math.max(0, existing.debt + debt);
          existing.bookingIds.push(bid);
        }
      } else {
        const { teamId, teamName } = getTeamDisplay(userId);
        itemsMap.set(key, {
          currency,
          userId,
          userName,
          teamId,
          teamName,
          totalSellerComm: sellerComm,
          totalLeaderComm: leaderComm,
          totalAgencyShare: agencyShare,
          debt: Math.max(0, debt),
          bookingIds: [bid],
        });
      }
      return true;
    }

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
        const owner = bookingOwners.get(bid);
        if (!owner) continue;
        const {
          userId: sellerId,
          userName: sellerName,
          bookingCreatedAt,
        } = owner;

        const rule = resolveRule(sellerId, bookingCreatedAt);
        const overrides = sanitizeCommissionOverrides(
          pruneOverridesByLeaderIds(
            overridesByBooking.get(bid) || null,
            rule.leaders.map((l) => l.userId),
          ),
        );

        for (const [cur, commissionBase] of Object.entries(baseByCur)) {
          if (!validBookingCurrency.has(`${bid}-${cur}`)) continue;
          const { sellerPct, leaderPcts } = resolveCommissionForContext({
            rule,
            overrides,
            currency: cur,
            allowService: false,
          });
          const sellerComm = commissionBase * (sellerPct / 100);
          const leaderComm = Object.values(leaderPcts).reduce(
            (sum, pct) => sum + commissionBase * (pct / 100),
            0,
          );
          const agencyShareAmt = Math.max(
            0,
            commissionBase - sellerComm - leaderComm,
          );
          const debtForBooking = debtByBooking.get(bid)?.[cur] ?? 0;

          const added = addRow(
            cur,
            sellerId,
            sellerName,
            sellerComm,
            leaderComm,
            agencyShareAmt,
            debtForBooking,
            bid,
          );
          if (added) {
            const bookingComm = commissionByBooking.get(bid) || {};
            bookingComm[cur] = (bookingComm[cur] || 0) + commissionBase;
            commissionByBooking.set(bid, bookingComm);
          }
        }
      }
    } else {
      for (const svc of filteredServices) {
        const bid = svc.booking_id;
        const cur = String(svc.currency || "").trim().toUpperCase();
        if (!cur) continue;
        const owner = bookingOwners.get(bid);
        if (!owner) continue;
        const {
          userId: sellerId,
          userName: sellerName,
          bookingCreatedAt,
        } = owner;

        // base de comisión (con tu ajuste actual)
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

        // regla efectiva por fecha de creación de la reserva
        const rule = resolveRule(sellerId, bookingCreatedAt);
        const overrides = sanitizeCommissionOverrides(
          pruneOverridesByLeaderIds(
            overridesByBooking.get(bid) || null,
            rule.leaders.map((l) => l.userId),
          ),
        );
        const { sellerPct, leaderPcts } = resolveCommissionForContext({
          rule,
          overrides,
          currency: cur,
          serviceId: svc.id_service,
          allowService: true,
        });

        const sellerComm = commissionBase * (sellerPct / 100);
        const leaderComm = Object.values(leaderPcts).reduce(
          (sum, pct) => sum + commissionBase * (pct / 100),
          0,
        );
        const agencyShareAmt = Math.max(
          0,
          commissionBase - sellerComm - leaderComm,
        );

        const debtForBooking = debtByBooking.get(bid)?.[cur] ?? 0;

        // 🔴 OJO: ahora agregamos UNA sola fila por vendedor+moneda
        const added = addRow(
          cur,
          sellerId,
          sellerName,
          sellerComm,
          leaderComm,
          agencyShareAmt,
          debtForBooking,
          bid,
        );
        if (added) {
          const bookingComm = commissionByBooking.get(bid) || {};
          bookingComm[cur] = (bookingComm[cur] || 0) + commissionBase;
          commissionByBooking.set(bid, bookingComm);
        }
      }
    }

    commissionByBooking.forEach((byCur, bid) => {
      const label = bookingCountry.get(bid) || "Sin pais";
      const bucket = byCountry[label] || {};
      for (const [cur, amount] of Object.entries(byCur)) {
        bucket[cur] = (bucket[cur] || 0) + amount;
      }
      byCountry[label] = bucket;
    });

    Object.keys(statsByCurrency).forEach((cur) => {
      statsByCurrency[cur].commissionTotal =
        (totals.sellerComm[cur] || 0) +
        (totals.leaderComm[cur] || 0) +
        (totals.agencyShare[cur] || 0);
      statsByCurrency[cur].paymentRate =
        statsByCurrency[cur].saleTotal > 0
          ? statsByCurrency[cur].paidTotal / statsByCurrency[cur].saleTotal
          : 0;
    });

    return res.status(200).json({
      totals,
      statsByCurrency,
      breakdowns: { byCountry, byMethod },
      items: Array.from(itemsMap.values()),
    });
  } catch (err: unknown) {
    console.error("Error en earnings API:", err);
    return res.status(500).json({ error: "Error obteniendo datos" });
  }
}
