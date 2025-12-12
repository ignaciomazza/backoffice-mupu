// src/pages/api/insights/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "@prisma/client";
import { jwtVerify, type JWTPayload } from "jose";

import prisma from "@/lib/prisma";
import {
  buildCommercialInsights,
  type CommercialBaseRow,
} from "@/utils/getCommercialInsights";
import {
  resolveCommercialScopeFromToken,
  type TokenPayload,
} from "@/utils/resolveCommercialScope";
import type {
  CommercialInsightsResponse,
  InsightsMoneyPerCurrency,
} from "@/types";

type ErrorResponse = { error: string };

// ============ JWT SECRET (sin defaults, consistente con otros endpoints) ============
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

function parseDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isSameDay(a?: Date | null, b?: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// --------- token/cookie helpers (igual idea que bookings) ----------
function getTokenFromRequest(req: NextApiRequest): string | null {
  // 1) cookie "token"
  if (req.cookies?.token) return req.cookies.token;

  // 2) Authorization: Bearer
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  // 3) otros nombres posibles
  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    if (c[k]) return c[k]!;
  }
  return null;
}

type DecodedUser = {
  id_user?: number;
  id_agency?: number;
  role?: string;
  email?: string;
  // flags opcionales si viajan en token
  is_agency_owner?: boolean;
  is_team_leader?: boolean;
};

type TokenPayloadFlexible = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  email?: string;
  is_agency_owner?: boolean;
  is_team_leader?: boolean;
};

function toNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedUser | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayloadFlexible;

    const id_user = toNum(p.id_user ?? p.userId ?? p.uid);
    const id_agency = toNum(p.id_agency ?? p.agencyId ?? p.aid);
    const role = typeof p.role === "string" ? p.role : undefined;
    const email = typeof p.email === "string" ? p.email : undefined;

    const is_agency_owner = Boolean(p.is_agency_owner);
    const is_team_leader = Boolean(p.is_team_leader);

    // completar por email si falta id_user
    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (u) {
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role,
          email: u.email ?? undefined,
          is_agency_owner,
          is_team_leader,
        };
      }
    }

    // completar agency si falta
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u) {
        return {
          id_user,
          id_agency: u.id_agency,
          role: role ?? u.role,
          email: email ?? u.email ?? undefined,
          is_agency_owner,
          is_team_leader,
        };
      }
    }

    return { id_user, id_agency, role, email, is_agency_owner, is_team_leader };
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CommercialInsightsResponse | ErrorResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ======================
  // Auth (cookie + bearer, robusto)
  // ======================
  const authUser = await getUserFromAuth(req);
  if (!authUser?.id_user || !authUser?.id_agency) {
    return res.status(401).json({ error: "No autenticado o token inválido." });
  }

  // Armamos un payload “compatible” con resolveCommercialScopeFromToken
  const payload: TokenPayload = {
    id_user: authUser.id_user,
    id_agency: authUser.id_agency,
    role: authUser.role,
    is_agency_owner: authUser.is_agency_owner,
    is_team_leader: authUser.is_team_leader,
  };

  let scope;
  try {
    scope = resolveCommercialScopeFromToken(payload);
  } catch (err) {
    console.error("[/api/insights] Error resolviendo alcance:", err);
    return res
      .status(400)
      .json({ error: "No se pudo resolver el alcance comercial." });
  }

  // ======================
  // Fechas (rango por creación de reserva)
  // ======================
  const fromDate = parseDate(req.query.from);
  const toRaw = parseDate(req.query.to);

  // to exclusive (+1 día)
  let toDate: Date | null = null;
  if (toRaw) {
    toDate = new Date(toRaw);
    toDate.setDate(toDate.getDate() + 1);
  }

  const where: Prisma.BookingWhereInput = {
    id_agency: scope.agencyId,
  };

  if (fromDate || toDate) {
    where.creation_date = {};
    if (fromDate) where.creation_date.gte = fromDate;
    if (toDate) where.creation_date.lt = toDate;
  }

  if (scope.mode === "own") {
    where.id_user = scope.userId;
  }
  // team -> por ahora como all (igual que tu comentario)

  try {
    // 1) reservas + servicios + destino
    const bookings = await prisma.booking.findMany({
      where,
      include: {
        titular: true,
        services: {
          include: {
            ServiceDestination: {
              include: {
                destination: {
                  include: { country: true },
                },
              },
            },
          },
        },
      },
    });

    // 2) earliest booking por cliente (para nuevos vs recurrentes)
    const earliest = await prisma.booking.groupBy({
      by: ["titular_id"],
      _min: { creation_date: true },
      where: { id_agency: scope.agencyId },
    });

    const earliestMap = new Map<number, Date>();
    for (const item of earliest) {
      const cid = item.titular_id;
      const created = item._min.creation_date;
      if (cid != null && created) earliestMap.set(cid, created);
    }

    // 3) filas base
    const rows: CommercialBaseRow[] = bookings.map((booking) => {
      const client = booking.titular;

      const amounts: InsightsMoneyPerCurrency = {};
      for (const service of booking.services) {
        const code = service.currency || "ARS";
        const sale =
          typeof service.sale_price === "number" &&
          Number.isFinite(service.sale_price)
            ? service.sale_price
            : 0;
        if (!Number.isFinite(sale)) continue;
        amounts[code] = (amounts[code] ?? 0) + sale;
      }

      let destinationKey: string | null = null;
      let countryCode: string | null = null;

      const firstService = booking.services[0];
      if (firstService) {
        const sd = firstService.ServiceDestination[0];
        if (sd?.destination) {
          destinationKey = sd.destination.slug || sd.destination.name || null;
          countryCode = sd.destination.country?.iso2 ?? null;
        } else if (firstService.destination) {
          destinationKey = firstService.destination;
        }
      }

      const baseRow: CommercialBaseRow = {
        bookingId: booking.id_booking,
        sellerId: booking.id_user,
        clientId: client?.id_client ?? null,
        clientName: client
          ? `${client.first_name} ${client.last_name}`.trim()
          : null,
        passengers: booking.pax_count ?? 0,
        bookingDate: booking.creation_date,
        departureDate: booking.departure_date,
        destinationKey,
        countryCode,
        channel: null,
        amounts,
        isNewClient: false,
      };

      const cid = baseRow.clientId;
      if (cid && baseRow.bookingDate) {
        const earliestDate = earliestMap.get(cid);
        if (earliestDate && isSameDay(baseRow.bookingDate, earliestDate)) {
          baseRow.isNewClient = true;
        }
      }

      return baseRow;
    });

    const response = buildCommercialInsights(rows);
    return res.status(200).json(response);
  } catch (err) {
    console.error("[/api/insights] Error construyendo insights:", err);
    return res
      .status(500)
      .json({ error: "Error interno al calcular los insights." });
  }
}
