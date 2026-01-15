// src/pages/api/earnings/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { computeBillingAdjustments } from "@/utils/billingAdjustments";
import type { BillingAdjustmentConfig } from "@/types";

interface EarningItem {
  currency: "ARS" | "USD";
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
    sellerComm: Record<"ARS" | "USD", number>;
    leaderComm: Record<"ARS" | "USD", number>;
    agencyShare: Record<"ARS" | "USD", number>;
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

// Helper: "YYYY-MM-DD" -> Date local 00:00
function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
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

  const { from, to } = req.query;
  if (typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({ error: "Parámetros from y to requeridos" });
  }

  const fromDate = ymdToLocalDate(from);
  const toDateExclusive = ymdToLocalDate(to);
  toDateExclusive.setDate(toDateExclusive.getDate() + 1);

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

    // 2) Servicios del rango (por creación de reserva) SOLO de mi agencia
    const services = await prisma.service.findMany({
      where: {
        booking: {
          id_agency: auth.id_agency,
          creation_date: { gte: fromDate, lt: toDateExclusive },
        },
      },
      select: {
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
      },
    });

    const fallbackSaleTotalsByBooking = new Map<
      number,
      { ARS: number; USD: number }
    >();
    const costTotalsByBooking = new Map<number, { ARS: number; USD: number }>();
    const taxTotalsByBooking = new Map<number, { ARS: number; USD: number }>();

    services.forEach((svc) => {
      const bid = svc.booking_id;
      const cur = String(svc.currency || "ARS").toUpperCase();
      if (cur !== "ARS" && cur !== "USD") return;
      const key = cur as "ARS" | "USD";

      const fallback = fallbackSaleTotalsByBooking.get(bid) || {
        ARS: 0,
        USD: 0,
      };
      fallback[key] += Number(svc.sale_price) || 0;
      fallbackSaleTotalsByBooking.set(bid, fallback);

      const costTotals = costTotalsByBooking.get(bid) || { ARS: 0, USD: 0 };
      costTotals[key] += Number(svc.cost_price) || 0;
      costTotalsByBooking.set(bid, costTotals);

      const taxTotals = taxTotalsByBooking.get(bid) || { ARS: 0, USD: 0 };
      taxTotals[key] += Number(svc.other_taxes) || 0;
      taxTotalsByBooking.set(bid, taxTotals);
    });

    // 2.1) Dueños (vendedores) de cada booking (siempre desde Booking)
    const bookingOwners = new Map<
      number,
      { userId: number; userName: string; bookingCreatedAt: Date }
    >();
    let bookings: Array<{
      id_booking: number;
      creation_date: Date;
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
          sale_totals: true,
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

    // 3) Venta total por reserva/moneda (para deuda y 40%)
    const saleTotalsByBooking = new Map<number, { ARS: number; USD: number }>();
    if (useBookingSaleTotal) {
      bookings.forEach((b) => {
        const normalized = normalizeSaleTotals(b.sale_totals);
        const fallback =
          fallbackSaleTotalsByBooking.get(b.id_booking) || { ARS: 0, USD: 0 };
        const hasValues = normalized.ARS > 0 || normalized.USD > 0;
        saleTotalsByBooking.set(
          b.id_booking,
          hasValues ? normalized : fallback,
        );
      });
    } else {
      fallbackSaleTotalsByBooking.forEach((totals, bid) => {
        saleTotalsByBooking.set(bid, totals);
      });
    }

    // 4) Recibos de esas reservas (misma agencia por FK booking)
    const allReceipts = await prisma.receipt.findMany({
      where: {
        bookingId_booking: { in: Array.from(saleTotalsByBooking.keys()) },
      },
      select: {
        bookingId_booking: true,
        amount: true,
        amount_currency: true,
        base_amount: true,
        base_currency: true,
      },
    });

    const receiptsMap = new Map<number, { ARS: number; USD: number }>();
    for (const r of allReceipts) {
      const bid = r.bookingId_booking;
      if (bid == null) continue; // evita TS2345 y casos sin booking
      const useBase = r.base_amount != null && r.base_currency;
      const cur = String(
        useBase ? r.base_currency : r.amount_currency || "ARS",
      ).toUpperCase();
      if (cur !== "ARS" && cur !== "USD") continue;
      const prev = receiptsMap.get(bid) || { ARS: 0, USD: 0 };
      const k = cur as "ARS" | "USD";
      const val = Number(useBase ? r.base_amount : r.amount) || 0;
      prev[k] += val;
      receiptsMap.set(bid, prev);
    }

    // 5) Validar 40% cobrado en la misma moneda
    const validBookingCurrency = new Set<string>();
    saleTotalsByBooking.forEach((totals, bid) => {
      const paid = receiptsMap.get(bid) || { ARS: 0, USD: 0 };
      (["ARS", "USD"] as const).forEach((cur) => {
        if (totals[cur] > 0 && paid[cur] / totals[cur] >= 0.4) {
          validBookingCurrency.add(`${bid}-${cur}`);
        }
      });
    });

    // 6) Deuda por reserva
    const debtByBooking = new Map<number, { ARS: number; USD: number }>();
    saleTotalsByBooking.forEach((totals, bid) => {
      const paid = receiptsMap.get(bid) || { ARS: 0, USD: 0 };
      debtByBooking.set(bid, {
        ARS: totals.ARS - paid.ARS,
        USD: totals.USD - paid.USD,
      });
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

    function resolveRule(ownerId: number, bookingCreatedAt: Date) {
      const list = rulesByOwner.get(ownerId);
      if (!list || list.length === 0)
        return {
          ownPct: 100,
          shares: [] as Array<{ uid: number; pct: number }>,
        };
      // tomamos la última con valid_from <= bookingCreatedAt
      let chosen = list[0];
      for (const r of list) {
        if (r.valid_from <= bookingCreatedAt) chosen = r;
        else break;
      }
      if (chosen.valid_from > bookingCreatedAt) {
        // todas empiezan después → usar default 100
        return {
          ownPct: 100,
          shares: [] as Array<{ uid: number; pct: number }>,
        };
      }
      return {
        ownPct: Number(chosen.own_pct),
        shares: chosen.shares.map((s) => ({
          uid: s.beneficiary_user_id,
          pct: Number(s.percent),
        })),
      };
    }

    // 8) Filtrar servicios válidos por % pago
    const filteredServices = useBookingSaleTotal
      ? []
      : services.filter((svc) =>
          validBookingCurrency.has(
            `${svc.booking_id}-${svc.currency as "ARS" | "USD"}`,
          ),
        );

    // 9) Agregación (una fila por vendedor+moneda, NO por equipo)
    const totals = {
      sellerComm: { ARS: 0, USD: 0 },
      leaderComm: { ARS: 0, USD: 0 },
      agencyShare: { ARS: 0, USD: 0 },
    };
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
      currency: "ARS" | "USD",
      userId: number,
      userName: string,
      sellerComm: number,
      leaderComm: number,
      agencyShare: number,
      debt: number,
      bid: number,
    ) {
      totals.sellerComm[currency] += sellerComm;
      totals.leaderComm[currency] += leaderComm;
      totals.agencyShare[currency] += agencyShare;

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
    }

    if (useBookingSaleTotal) {
      const commissionBaseByBooking = new Map<
        number,
        { ARS: number; USD: number }
      >();

      saleTotalsByBooking.forEach((totals, bid) => {
        const costTotals = costTotalsByBooking.get(bid) || { ARS: 0, USD: 0 };
        const taxTotals = taxTotalsByBooking.get(bid) || { ARS: 0, USD: 0 };
        const baseByCur = { ARS: 0, USD: 0 };

        (["ARS", "USD"] as const).forEach((cur) => {
          const sale = totals[cur] || 0;
          const cost = costTotals[cur] || 0;
          const taxes = taxTotals[cur] || 0;
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
        });

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

        const { ownPct, shares } = resolveRule(sellerId, bookingCreatedAt);

        (["ARS", "USD"] as const).forEach((cur) => {
          if (!validBookingCurrency.has(`${bid}-${cur}`)) return;
          const commissionBase = baseByCur[cur] || 0;
          const sellerComm = commissionBase * (ownPct / 100);
          const leaderComm = shares.reduce(
            (sum, s) => sum + commissionBase * (s.pct / 100),
            0,
          );
          const agencyShareAmt = Math.max(
            0,
            commissionBase - sellerComm - leaderComm,
          );
          const debtForBooking = debtByBooking.get(bid)?.[cur] ?? 0;

          addRow(
            cur,
            sellerId,
            sellerName,
            sellerComm,
            leaderComm,
            agencyShareAmt,
            debtForBooking,
            bid,
          );
        });
      }
    } else {
      for (const svc of filteredServices) {
        const bid = svc.booking_id;
        const cur = (svc.currency as "ARS" | "USD") || "ARS";
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
        const { ownPct, shares } = resolveRule(sellerId, bookingCreatedAt);

        const sellerComm = commissionBase * (ownPct / 100);
        const leaderComm = shares.reduce(
          (sum, s) => sum + commissionBase * (s.pct / 100),
          0,
        );
        const agencyShareAmt = Math.max(
          0,
          commissionBase - sellerComm - leaderComm,
        );

        const debtForBooking = debtByBooking.get(bid)![cur];

        // 🔴 OJO: ahora agregamos UNA sola fila por vendedor+moneda
        addRow(
          cur,
          sellerId,
          sellerName,
          sellerComm,
          leaderComm,
          agencyShareAmt,
          debtForBooking,
          bid,
        );
      }
    }

    return res
      .status(200)
      .json({ totals, items: Array.from(itemsMap.values()) });
  } catch (err: unknown) {
    console.error("Error en earnings API:", err);
    return res.status(500).json({ error: "Error obteniendo datos" });
  }
}
