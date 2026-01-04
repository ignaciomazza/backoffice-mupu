// src/pages/api/earnings/my.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

/* ======================== Auth helpers ======================== */

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

/* ======================== Utils de fechas ======================== */

/**
 * Suma días a un YMD (sin depender de la zona horaria del servidor)
 */
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

  // Medianoche "local" aproximada expresada en UTC
  const approx = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0));

  // Qué hora local muestra esa fecha en la tz objetivo
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

  // Restar la hora local mostrada nos lleva a 00:00:00 local (en UTC)
  return new Date(approx.getTime() - deltaMs);
}

/* ======================== Tipos mínimos ======================== */

type Totals = Record<"ARS" | "USD", number>;

type ServiceLite = {
  booking_id: number;
  sale_price: number;
  currency: "ARS" | "USD" | string;
  totalCommissionWithoutVAT?: number | null;
};

type ReceiptLite = {
  bookingId_booking: number;
  amount: number;
  amount_currency: "ARS" | "USD" | string;
  base_amount?: number | string | null;
  base_currency?: "ARS" | "USD" | string | null;
};

type RuleShare = {
  beneficiary_user_id: number;
  percent: number;
};

type RuleSet = {
  owner_user_id: number;
  valid_from: Date;
  own_pct: number;
  shares: RuleShare[];
};

/* ======================== Handler ======================== */

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

  const currentUserId = auth.id_user;
  const agencyId = auth.id_agency;

  const { from, to, tz } = req.query;
  if (typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({ error: "Parámetros from y to requeridos" });
  }
  const timeZone = typeof tz === "string" && tz.trim() ? tz.trim() : "UTC";

  // Rango UTC: [inicio de 'from' en tz, inicio de 'to + 1 día' en tz)
  const fromUTC = startOfDayUTCFromYmdInTz(from, timeZone);
  const toExclusiveUTC = startOfDayUTCFromYmdInTz(addDaysYMD(to, 1), timeZone);

  try {
    // 1) Servicios del rango en MI agencia
    const services: ServiceLite[] = await prisma.service.findMany({
      where: {
        booking: {
          id_agency: agencyId,
          creation_date: { gte: fromUTC, lt: toExclusiveUTC },
        },
      },
      select: {
        booking_id: true,
        sale_price: true,
        currency: true,
        totalCommissionWithoutVAT: true,
      },
    });

    // 2) Venta total por reserva / moneda
    const saleTotalsByBooking = new Map<number, { ARS: number; USD: number }>();
    const bookingCreatedAt = new Map<number, Date>();
    const bookingOwner = new Map<number, { id: number; name: string }>();

    const bookingIds = Array.from(
      new Set(services.map((svc) => svc.booking_id)),
    );
    if (bookingIds.length > 0) {
      const bookings = await prisma.booking.findMany({
        where: { id_agency: agencyId, id_booking: { in: bookingIds } },
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
      const cur = (svc.currency as "ARS" | "USD") || "ARS";
      const prev = saleTotalsByBooking.get(bid) || { ARS: 0, USD: 0 };
      if (cur === "ARS" || cur === "USD") {
        prev[cur] += svc.sale_price;
      }
      saleTotalsByBooking.set(bid, prev);
    }

    // 3) Recibos → validación 40%
    const ids = Array.from(saleTotalsByBooking.keys());
    let allReceiptsRaw: ReceiptLite[] = [];
    if (ids.length > 0) {
      const r = await prisma.receipt.findMany({
        where: { bookingId_booking: { in: ids } },
        select: {
          bookingId_booking: true,
          amount: true,
          amount_currency: true,
          base_amount: true,
          base_currency: true,
        },
      });
      allReceiptsRaw = r.map((x) => ({
        bookingId_booking: x.bookingId_booking as number,
        amount: x.amount as number,
        amount_currency: (x.amount_currency as string) || "ARS",
        base_amount: x.base_amount as number | string | null,
        base_currency: (x.base_currency as string) || null,
      }));
    }

    const receiptsMap = new Map<number, { ARS: number; USD: number }>();
    for (const r of allReceiptsRaw) {
      const useBase = r.base_amount != null && r.base_currency;
      const cur = String(
        useBase ? r.base_currency : r.amount_currency || "ARS",
      ).toUpperCase();
      const prev = receiptsMap.get(r.bookingId_booking) || { ARS: 0, USD: 0 };
      if (cur === "ARS" || cur === "USD") {
        const val = Number(useBase ? r.base_amount : r.amount) || 0;
        prev[cur] += val;
      }
      receiptsMap.set(r.bookingId_booking, prev);
    }

    const validBookingCurrency = new Set<string>();
    saleTotalsByBooking.forEach((totals, bid) => {
      const paid = receiptsMap.get(bid) || { ARS: 0, USD: 0 };
      (["ARS", "USD"] as const).forEach((cur) => {
        const total = totals[cur];
        const p = paid[cur];
        if (total > 0 && p / total >= 0.4) {
          validBookingCurrency.add(`${bid}-${cur}`);
        }
      });
    });

    // 4) Prefetch de reglas por dueño
    const ownerIds = Array.from(
      new Set(Array.from(bookingOwner.values()).map((o) => o.id)),
    );

    const rawRuleSets = await prisma.commissionRuleSet.findMany({
      where: { id_agency: agencyId, owner_user_id: { in: ownerIds } },
      include: { shares: true },
      orderBy: [{ owner_user_id: "asc" }, { valid_from: "asc" }],
    });

    const ruleSets: RuleSet[] = rawRuleSets.map((r) => ({
      owner_user_id: r.owner_user_id as number,
      valid_from: r.valid_from as Date,
      own_pct: Number(r.own_pct),
      shares: (r.shares ?? []).map((s) => ({
        beneficiary_user_id: s.beneficiary_user_id as number,
        percent: Number(s.percent),
      })),
    }));

    const rulesByOwner = new Map<number, RuleSet[]>();
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

      // última regla con valid_from <= createdAt
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

    // 5) Acumulado
    const totals = {
      seller: { ARS: 0, USD: 0 } as Totals,
      beneficiary: { ARS: 0, USD: 0 } as Totals,
      grandTotal: { ARS: 0, USD: 0 } as Totals,
    };

    for (const svc of services) {
      const bid = svc.booking_id;
      const cur = (svc.currency as "ARS" | "USD") || "ARS";
      if (cur !== "ARS" && cur !== "USD") continue;
      if (!validBookingCurrency.has(`${bid}-${cur}`)) continue;

      // base de comisión (mismo criterio que /api/earnings)
      const fee = svc.sale_price * 0.024;
      const dbCommission =
        Number(
          (svc as { totalCommissionWithoutVAT?: number | null })
            .totalCommissionWithoutVAT ?? 0,
        ) || 0;
      const commissionBase = Math.max(dbCommission - fee, 0);

      const owner = bookingOwner.get(bid);
      const createdAt = bookingCreatedAt.get(bid);
      if (!owner || !createdAt) continue;
      const ownerId = owner.id;
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
