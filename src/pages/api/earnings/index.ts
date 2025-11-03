// src/pages/api/earnings/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

interface EarningItem {
  currency: "ARS" | "USD";
  userId: number; // dueño de la reserva (seller)
  userName: string;
  teamId: number;
  teamName: string;
  totalSellerComm: number;
  totalLeaderComm: number; // <-- todos los beneficiarios distintos del dueño
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
      include: { booking: { include: { user: true } } },
    });

    // 2.1) Dueños (vendedores) de cada booking
    const bookingOwners = new Map<
      number,
      { userId: number; userName: string; bookingCreatedAt: Date }
    >();
    services.forEach((svc) => {
      const b = svc.booking;
      if (!bookingOwners.has(b.id_booking)) {
        bookingOwners.set(b.id_booking, {
          userId: b.user.id_user,
          userName: `${b.user.first_name} ${b.user.last_name}`,
          bookingCreatedAt: b.creation_date,
        });
      }
    });

    // 3) Venta total por reserva/moneda (para deuda y 40%)
    const saleTotalsByBooking = new Map<number, { ARS: number; USD: number }>();
    services.forEach((svc) => {
      const bid = svc.booking.id_booking;
      const cur = String(svc.currency || "ARS").toUpperCase();
      const prev = saleTotalsByBooking.get(bid) || { ARS: 0, USD: 0 };
      if (cur === "ARS" || cur === "USD") {
        const k = cur as "ARS" | "USD";
        prev[k] += Number(svc.sale_price) || 0;
      }
      saleTotalsByBooking.set(bid, prev);
    });

    // 4) Recibos de esas reservas (misma agencia por FK booking)
    const allReceipts = await prisma.receipt.findMany({
      where: {
        bookingId_booking: { in: Array.from(saleTotalsByBooking.keys()) },
      },
      select: { bookingId_booking: true, amount: true, amount_currency: true },
    });

    const receiptsMap = new Map<number, { ARS: number; USD: number }>();
    for (const r of allReceipts) {
      const bid = r.bookingId_booking;
      if (bid == null) continue; // evita TS2345 y casos sin booking
      const cur = String(r.amount_currency || "ARS").toUpperCase();
      if (cur !== "ARS" && cur !== "USD") continue;
      const prev = receiptsMap.get(bid) || { ARS: 0, USD: 0 };
      const k = cur as "ARS" | "USD";
      prev[k] += Number(r.amount) || 0;
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
    const filteredServices = services.filter((svc) =>
      validBookingCurrency.has(
        `${svc.booking.id_booking}-${svc.currency as "ARS" | "USD"}`,
      ),
    );

    // 9) Agregación
    const totals = {
      sellerComm: { ARS: 0, USD: 0 },
      leaderComm: { ARS: 0, USD: 0 },
      agencyShare: { ARS: 0, USD: 0 },
    };
    const itemsMap = new Map<string, EarningItem>();

    function addRow(
      currency: "ARS" | "USD",
      teamId: number,
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

      const key = `${currency}-${teamId}-${userId}`;
      const existing = itemsMap.get(key);
      if (existing) {
        existing.totalSellerComm += sellerComm;
        existing.totalLeaderComm += leaderComm;
        existing.totalAgencyShare += agencyShare;
        if (!existing.bookingIds.includes(bid)) {
          existing.debt = Math.max(0, existing.debt + debt);
          existing.bookingIds.push(bid);
        }
      } else {
        const teamName =
          teamId === 0
            ? "Sin equipo"
            : teamMap.get(teamId)?.name || "Sin equipo";
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

    for (const svc of filteredServices) {
      const bid = svc.booking.id_booking;
      const cur = (svc.currency as "ARS" | "USD") || "ARS";
      const {
        userId: sellerId,
        userName: sellerName,
        bookingCreatedAt,
      } = bookingOwners.get(bid)!;

      // base de comisión (con tu ajuste actual)
      const fee = svc.sale_price * 0.024;
      const dbCommission = svc.totalCommissionWithoutVAT ?? 0;
      const commissionBase = Math.max(dbCommission - fee, 0);

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
      ); // resto a agencia

      const debtForBooking = debtByBooking.get(bid)![cur];
      const memberTeams = userToMemberTeams.get(sellerId) || [];

      // Igual que antes: se reparte visualmente por cada equipo al que pertenece el vendedor (si ninguno, teamId=0)
      const targetTeams = memberTeams.length ? memberTeams : [0];
      for (const teamId of targetTeams) {
        addRow(
          cur,
          teamId,
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
