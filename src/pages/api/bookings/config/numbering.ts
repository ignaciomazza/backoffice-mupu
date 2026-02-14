import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { setAgencyCounterNextValue } from "@/lib/agencyCounters";
import { jwtVerify, type JWTPayload } from "jose";
import { normalizeRole } from "@/utils/permissions";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  role?: string;
  email?: string;
};

type AuthContext = {
  id_user: number;
  id_agency: number;
  role: string;
};

type BookingNumberingConfigResponse = {
  allow_manual_agency_booking_id: boolean;
  next_auto_agency_booking_id: number;
  max_agency_booking_id: number;
};

const CAN_EDIT_ROLES = new Set(["gerente", "administrativo", "desarrollador"]);
const BOOKING_MANUAL_ENABLED_KEY = "booking_manual_enabled";

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
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

async function resolveAuth(req: NextApiRequest): Promise<AuthContext | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    let id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    let id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    let role = normalizeRole(p.role || "");
    const email = p.email;

    if (id_user && (!id_agency || !role)) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true },
      });
      if (u) {
        id_agency = id_agency ?? u.id_agency;
        role = role || normalizeRole(u.role);
      }
    }

    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true },
      });
      if (u) {
        id_user = u.id_user;
        id_agency = u.id_agency;
        role = normalizeRole(u.role);
      }
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role };
  } catch {
    return null;
  }
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function parseBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "t", "yes", "y", "si", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "f", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

async function readNumberingConfig(
  id_agency: number,
): Promise<BookingNumberingConfigResponse> {
  const [counter, manualFlagRow, maxBooking] = await Promise.all([
    prisma.agencyCounter.findUnique({
      where: { id_agency_key: { id_agency, key: "booking" } },
      select: { next_value: true },
    }),
    prisma.agencyCounter.findUnique({
      where: {
        id_agency_key: { id_agency, key: BOOKING_MANUAL_ENABLED_KEY },
      },
      select: { next_value: true },
    }),
    prisma.booking.aggregate({
      where: { id_agency },
      _max: { agency_booking_id: true },
    }),
  ]);

  const maxAgencyBookingId = Number(maxBooking._max.agency_booking_id ?? 0);
  const fallbackNext = Math.max(1, maxAgencyBookingId + 1);
  const nextAuto = Number(counter?.next_value ?? fallbackNext);

  return {
    allow_manual_agency_booking_id: Number(manualFlagRow?.next_value) === 1,
    next_auto_agency_booking_id: Number.isFinite(nextAuto)
      ? Math.max(1, Math.trunc(nextAuto))
      : fallbackNext,
    max_agency_booking_id: Math.max(0, maxAgencyBookingId),
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await resolveAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ error: "No autenticado" });
  }

  if (req.method === "GET") {
    try {
      const config = await readNumberingConfig(auth.id_agency);
      return res.status(200).json(config);
    } catch (error) {
      console.error("[bookings/config/numbering][GET]", error);
      return res
        .status(500)
        .json({ error: "No se pudo obtener la numeración de reservas." });
    }
  }

  if (req.method === "PUT") {
    if (!CAN_EDIT_ROLES.has(normalizeRole(auth.role))) {
      return res.status(403).json({ error: "Sin permisos para editar numeración." });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const hasManualFlag = Object.prototype.hasOwnProperty.call(
      body,
      "allow_manual_agency_booking_id",
    );
    const hasNextAuto = Object.prototype.hasOwnProperty.call(
      body,
      "next_auto_agency_booking_id",
    );

    if (!hasManualFlag && !hasNextAuto) {
      return res.status(400).json({ error: "No hay cambios para guardar." });
    }

    let allowManual: boolean | undefined;
    if (hasManualFlag) {
      const parsed = parseBool(body.allow_manual_agency_booking_id);
      if (parsed == null) {
        return res
          .status(400)
          .json({ error: "allow_manual_agency_booking_id debe ser booleano." });
      }
      allowManual = parsed;
    }

    let nextAutoValue: number | undefined;
    if (hasNextAuto) {
      const parsed = parsePositiveInt(body.next_auto_agency_booking_id);
      if (!parsed) {
        return res.status(400).json({
          error: "next_auto_agency_booking_id debe ser un entero mayor a 0.",
        });
      }
      nextAutoValue = parsed;
    }

    try {
      if (nextAutoValue != null) {
        const maxBooking = await prisma.booking.aggregate({
          where: { id_agency: auth.id_agency },
          _max: { agency_booking_id: true },
        });
        const maxUsed = Number(maxBooking._max.agency_booking_id ?? 0);
        if (nextAutoValue <= maxUsed) {
          return res.status(400).json({
            error:
              "El próximo número automático debe ser mayor al último número de reserva usado.",
          });
        }
      }

      await prisma.$transaction(async (tx) => {
        if (allowManual != null) {
          await tx.agencyCounter.upsert({
            where: {
              id_agency_key: {
                id_agency: auth.id_agency,
                key: BOOKING_MANUAL_ENABLED_KEY,
              },
            },
            create: {
              id_agency: auth.id_agency,
              key: BOOKING_MANUAL_ENABLED_KEY,
              next_value: allowManual ? 1 : 0,
            },
            update: {
              next_value: allowManual ? 1 : 0,
            },
          });
        }

        if (nextAutoValue != null) {
          await setAgencyCounterNextValue(
            tx,
            auth.id_agency,
            "booking",
            nextAutoValue,
          );
        }
      });

      const config = await readNumberingConfig(auth.id_agency);
      return res.status(200).json(config);
    } catch (error) {
      console.error("[bookings/config/numbering][PUT]", error);
      return res
        .status(500)
        .json({ error: "No se pudo guardar la numeración de reservas." });
    }
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
