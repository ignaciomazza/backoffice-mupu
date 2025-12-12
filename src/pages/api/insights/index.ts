// src/pages/api/insights/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import type { Prisma } from "@prisma/client";
import { jwtVerify } from "jose";

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CommercialInsightsResponse | ErrorResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ======================
  // Auth
  // ======================
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Falta token de autenticación en Authorization." });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("[/api/insights] JWT_SECRET no configurado");
    return res
      .status(500)
      .json({ error: "Configuración del servidor incompleta." });
  }

  let payload: TokenPayload;
  try {
    const { payload: decoded } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    payload = decoded as TokenPayload;
  } catch (err) {
    console.error("[/api/insights] Error verificando JWT:", err);
    return res.status(401).json({ error: "Token inválido o expirado." });
  }

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

  // Hacemos el to "exclusive" sumando 1 día, para incluir todo el día elegido
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
  // Si mode === "team", por ahora lo tratamos igual que "all" hasta tener
  // un modelo claro de equipos liderados.

  try {
    // ======================
    // 1) Buscamos reservas + servicios + destino normalizado
    // ======================
    const bookings = await prisma.booking.findMany({
      where,
      include: {
        titular: true,
        services: {
          include: {
            ServiceDestination: {
              include: {
                destination: {
                  include: {
                    country: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // ======================
    // 2) Earliest booking por cliente (para marcar nuevos vs recurrentes)
    // ======================
    const earliest = await prisma.booking.groupBy({
      by: ["titular_id"],
      _min: {
        creation_date: true,
      },
      where: {
        id_agency: scope.agencyId,
      },
    });

    const earliestMap = new Map<number, Date>();
    for (const item of earliest) {
      const cid = item.titular_id;
      const created = item._min.creation_date;
      if (cid != null && created) {
        earliestMap.set(cid, created);
      }
    }

    // ======================
    // 3) Armamos filas base
    // ======================
    const rows: CommercialBaseRow[] = bookings.map((booking) => {
      const client = booking.titular;

      // Montos por moneda (sumamos sale_price de los servicios)
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

      // Destino principal y país (usamos el primer ServiceDestination si existe)
      let destinationKey: string | null = null;
      let countryCode: string | null = null;

      const firstService = booking.services[0];
      if (firstService) {
        const sd = firstService.ServiceDestination[0];
        if (sd?.destination) {
          destinationKey = sd.destination.slug || sd.destination.name || null;
          countryCode = sd.destination.country?.iso2 ?? null;
        } else if (firstService.destination) {
          // fallback al campo string viejo
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
        channel: null, // ya no usamos canal como tal
        amounts,
        isNewClient: false, // lo seteamos abajo
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

    // ======================
    // 4) Construimos respuesta agregada
    // ======================
    const response = buildCommercialInsights(rows);

    return res.status(200).json(response);
  } catch (err) {
    console.error("[/api/insights] Error construyendo insights:", err);
    return res
      .status(500)
      .json({ error: "Error interno al calcular los insights." });
  }
}
