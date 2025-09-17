// src/pages/api/earnings/by-booking.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

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

    // Servicios de la reserva (para base de comisión)
    const services = await prisma.service.findMany({
      // ⬇️ filtrar por la relación booking
      where: { booking: { id_booking: bookingId } },
      select: {
        currency: true,
        sale_price: true,
        totalCommissionWithoutVAT: true,
      },
    });

    // Base por moneda (mismo cálculo de /api/earnings)
    const commissionBaseByCurrency: Record<"ARS" | "USD", number> = {
      ARS: 0,
      USD: 0,
    };
    for (const s of services) {
      const cur = (s.currency as "ARS" | "USD") || "ARS";
      const fee = s.sale_price * 0.024;
      const dbCommission = s.totalCommissionWithoutVAT ?? 0;
      commissionBaseByCurrency[cur] += Math.max(dbCommission - fee, 0);
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
