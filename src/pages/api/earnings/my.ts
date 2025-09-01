// src/pages/api/earnings/my.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

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

async function getAuth(
  req: NextApiRequest,
): Promise<{ id_user: number; id_agency: number } | null> {
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
    if (!id_user || !id_agency) return null;
    return { id_user, id_agency };
  } catch {
    return null;
  }
}

/* ============ Utils ============ */

// "YYYY-MM-DD" -> Date local 00:00
function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

type Totals = Record<"ARS" | "USD", number>;

/* ============ Handler ============ */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | {
        totals: {
          seller: Totals;
          beneficiary: Totals;
          grandTotal: Totals;
        };
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

  // ✅ variables locales no nulas
  const currentUserId = auth.id_user;
  const agencyId = auth.id_agency;

  const { from, to } = req.query;
  if (typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({ error: "Parámetros from y to requeridos" });
  }

  // límites locales [from, to+1)
  const fromDate = ymdToLocalDate(from);
  const toDateExclusive = ymdToLocalDate(to);
  toDateExclusive.setDate(toDateExclusive.getDate() + 1);

  try {
    // 1) Traer servicios del rango (por creación de reserva) de MI agencia
    const services = await prisma.service.findMany({
      where: {
        booking: {
          id_agency: agencyId,
          creation_date: { gte: fromDate, lt: toDateExclusive },
        },
      },
      include: { booking: { include: { user: true } } },
    });

    // 2) Venta total por reserva / moneda
    const saleTotalsByBooking = new Map<number, { ARS: number; USD: number }>();
    const bookingCreatedAt = new Map<number, Date>();
    const bookingOwner = new Map<number, { id: number; name: string }>();

    for (const svc of services) {
      const bid = svc.booking.id_booking;
      const cur = (svc.currency as "ARS" | "USD") || "ARS";
      const prev = saleTotalsByBooking.get(bid) || { ARS: 0, USD: 0 };
      prev[cur] += svc.sale_price;
      saleTotalsByBooking.set(bid, prev);

      if (!bookingCreatedAt.has(bid))
        bookingCreatedAt.set(bid, svc.booking.creation_date);

      if (!bookingOwner.has(bid)) {
        bookingOwner.set(bid, {
          id: svc.booking.user.id_user,
          name: `${svc.booking.user.first_name} ${svc.booking.user.last_name}`,
        });
      }
    }

    // 3) Recibos → validación 40%
    const allReceipts = await prisma.receipt.findMany({
      where: {
        bookingId_booking: { in: Array.from(saleTotalsByBooking.keys()) },
      },
      select: { bookingId_booking: true, amount: true, amount_currency: true },
    });
    const receiptsMap = new Map<number, { ARS: number; USD: number }>();
    for (const r of allReceipts) {
      const cur = (r.amount_currency as "ARS" | "USD") || "ARS";
      const prev = receiptsMap.get(r.bookingId_booking) || { ARS: 0, USD: 0 };
      prev[cur] += r.amount;
      receiptsMap.set(r.bookingId_booking, prev);
    }

    const validBookingCurrency = new Set<string>();
    saleTotalsByBooking.forEach((totals, bid) => {
      const paid = receiptsMap.get(bid) || { ARS: 0, USD: 0 };
      (["ARS", "USD"] as const).forEach((cur) => {
        if (totals[cur] > 0 && paid[cur] / totals[cur] >= 0.4) {
          validBookingCurrency.add(`${bid}-${cur}`);
        }
      });
    });

    // 4) Prefetch de REGLAS para todos los dueños involucrados
    const ownerIds = Array.from(
      new Set(services.map((s) => s.booking.user.id_user)),
    );
    const ruleSets = await prisma.commissionRuleSet.findMany({
      where: { id_agency: agencyId, owner_user_id: { in: ownerIds } },
      include: { shares: true },
      orderBy: [{ owner_user_id: "asc" }, { valid_from: "asc" }],
    });
    const rulesByOwner = new Map<number, typeof ruleSets>();
    for (const rs of ruleSets) {
      const arr = rulesByOwner.get(rs.owner_user_id) || [];
      arr.push(rs);
      rulesByOwner.set(rs.owner_user_id, arr);
    }

    // ✅ opción B: pasar currentUserId como parámetro
    function resolveRule(
      ownerId: number,
      createdAt: Date,
      meId: number,
    ): {
      ownPct: number;
      beneficiaryPctForMe: number;
    } {
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

    // 5) Recorremos servicios válidos y acumulamos para el usuario
    const totals = {
      seller: { ARS: 0, USD: 0 } as Totals,
      beneficiary: { ARS: 0, USD: 0 } as Totals,
      grandTotal: { ARS: 0, USD: 0 } as Totals,
    };

    for (const svc of services) {
      const bid = svc.booking.id_booking;
      const cur = (svc.currency as "ARS" | "USD") || "ARS";
      if (!validBookingCurrency.has(`${bid}-${cur}`)) continue;

      // base de comisión (mismo criterio que /api/earnings)
      const fee = svc.sale_price * 0.024;
      const dbCommission = svc.totalCommissionWithoutVAT ?? 0;
      const commissionBase = Math.max(dbCommission - fee, 0);

      const ownerId = bookingOwner.get(bid)!.id;
      const createdAt = bookingCreatedAt.get(bid)!;
      const { ownPct, beneficiaryPctForMe } = resolveRule(
        ownerId,
        createdAt,
        currentUserId,
      );

      if (ownerId === currentUserId) {
        const me = commissionBase * (ownPct / 100);
        totals.seller[cur] += me;
        totals.grandTotal[cur] += me;
      }
      if (beneficiaryPctForMe > 0) {
        const me = commissionBase * (beneficiaryPctForMe / 100);
        totals.beneficiary[cur] += me;
        totals.grandTotal[cur] += me;
      }
    }

    return res.status(200).json({ totals });
  } catch (err) {
    console.error("[earnings/my][GET]", err);
    return res.status(500).json({ error: "Error obteniendo datos" });
  }
}
