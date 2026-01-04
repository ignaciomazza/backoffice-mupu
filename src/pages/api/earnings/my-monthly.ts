// src/pages/api/earnings/my-monthly.ts

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

/* ============ Utils (UTC) ============ */
function ymdToUTCDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  // 00:00:00 en UTC del día indicado
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0));
}
function monthKeyUTC(d: Date): string {
  // YYYY-MM independiente del huso del servidor
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* ============ Tipos respuesta ============ */
export type MyMonthlyItem = {
  month: string; // YYYY-MM (UTC)
  currency: string; // "ARS" | "USD" | ...
  seller: number; // lo que cobro como dueño
  beneficiary: number; // lo que cobro como beneficiario
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

  const { from, to } = req.query;
  if (typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({ error: "Parámetros from y to requeridos" });
  }

  // Límites en UTC (incluye 'from' y excluye día siguiente a 'to')
  const fromDate = ymdToUTCDate(from);
  const toDateExclusive = ymdToUTCDate(to);
  toDateExclusive.setUTCDate(toDateExclusive.getUTCDate() + 1);

  try {
    // 1) Servicios del rango (fecha = creación de la reserva) de MI agencia
    const services = await prisma.service.findMany({
      where: {
        booking: {
          id_agency: auth.id_agency,
          creation_date: { gte: fromDate, lt: toDateExclusive },
        },
      },
      select: {
        booking_id: true,
        sale_price: true,
        currency: true,
        totalCommissionWithoutVAT: true,
      },
    });

    if (services.length === 0) {
      return res.status(200).json({ items: [], totalsByCurrency: {} });
    }

    // 2) Venta por reserva/moneda (para deuda y 40%)
    const saleTotalsByBooking = new Map<number, Record<string, number>>();
    const bookingCreatedAt = new Map<number, Date>();
    const bookingOwner = new Map<number, { id: number; name: string }>();

    const bookingIds = Array.from(
      new Set(services.map((svc) => svc.booking_id)),
    );
    if (bookingIds.length > 0) {
      const bookings = await prisma.booking.findMany({
        where: { id_agency: auth.id_agency, id_booking: { in: bookingIds } },
        include: { user: true },
      });
      for (const b of bookings) {
        bookingCreatedAt.set(b.id_booking, b.creation_date);
        bookingOwner.set(b.id_booking, {
          id: b.user.id_user,
          name: `${b.user.first_name} ${b.user.last_name}`,
        });
      }
    }

    for (const svc of services) {
      const bid = svc.booking_id;
      const cur = (svc.currency || "ARS").toUpperCase();
      const prev = saleTotalsByBooking.get(bid) || {};
      prev[cur] = (prev[cur] || 0) + (svc.sale_price || 0);
      saleTotalsByBooking.set(bid, prev);
    }

    // 3) Recibos → validar 40% cobrado en la misma moneda
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

    const receiptsMap = new Map<number, Record<string, number>>();
    for (const r of allReceipts) {
      const bid = r.bookingId_booking;
      if (bid == null) continue; // evita TS2345
      const useBase = r.base_amount != null && r.base_currency;
      const cur = String(
        useBase ? r.base_currency : r.amount_currency || "ARS",
      ).toUpperCase();
      const prev = receiptsMap.get(bid) || {};
      const val = Number(useBase ? r.base_amount : r.amount) || 0;
      prev[cur] = (prev[cur] || 0) + val;
      receiptsMap.set(bid, prev);
    }

    const validBookingCurrency = new Set<string>();
    saleTotalsByBooking.forEach((totals, bid) => {
      const paid = receiptsMap.get(bid) || {};
      for (const cur of Object.keys(totals)) {
        const t = totals[cur] || 0;
        if (t > 0 && (paid[cur] || 0) / t >= 0.4) {
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

    // 5) Agregar por MES(UTC) y MONEDA
    const monthly = new Map<
      string,
      Map<string, { seller: number; beneficiary: number; total: number }>
    >();
    const totalsByCurrency: Record<
      string,
      { seller: number; beneficiary: number; total: number }
    > = {};

    for (const svc of services) {
      const bid = svc.booking_id;
      const cur = (svc.currency || "ARS").toUpperCase();
      if (!validBookingCurrency.has(`${bid}-${cur}`)) continue;

      const createdAt = bookingCreatedAt.get(bid);
      const owner = bookingOwner.get(bid);
      if (!createdAt || !owner) continue;
      const month = monthKeyUTC(createdAt);
      const ownerId = owner.id;

      // base de comisión (mismo criterio que /earnings)
      const fee = (svc.sale_price || 0) * 0.024;
      const dbCommission = svc.totalCommissionWithoutVAT ?? 0;
      const commissionBase = Math.max(dbCommission - fee, 0);

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
