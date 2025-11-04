// src/pages/api/bookings/neighbor/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

// ───────────────── Prisma singleton (evita múltiples conexiones en dev)
const globalForPrisma = global as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma;

// ───────────────── Tipos de JWT que usamos en el proyecto
type JWTPayload = {
  id_user?: number;
  role?: string;
  id_agency?: number;
  agencyId?: number;
  agency?: { id_agency?: number } | null;
};

// ───────────────── Helpers
function getAgencyIdFromPayload(p: JWTPayload | null): number | null {
  if (!p) return null;
  if (typeof p.id_agency === "number") return p.id_agency;
  if (typeof p.agencyId === "number") return p.agencyId;
  if (p.agency && typeof p.agency.id_agency === "number")
    return p.agency.id_agency;
  return null;
}

function extractToken(req: NextApiRequest): string | null {
  const authHeader = req.headers.authorization ?? "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim() || null;
  }
  // Fallback a cookies (mantiene compatibilidad si tu sesión usa cookie)
  const cookieCandidates = [
    "token",
    "authToken",
    "auth_token",
    "jwt",
    "session",
    "session_token",
  ] as const;
  for (const key of cookieCandidates) {
    const v = req.cookies?.[key];
    if (v && typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

// ───────────────── Handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const AUTH_SOURCE = "api:bookings/neighbor";

  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ── Auth guard (compatible con Authorization y/o cookie)
    const token = extractToken(req);
    if (!token) {
      res.setHeader("x-auth-source", AUTH_SOURCE);
      res.setHeader("x-auth-reason", "missing-token");
      return res.status(401).json({ error: "No autorizado (falta token)" });
    }
    if (!process.env.JWT_SECRET) {
      res.setHeader("x-auth-source", AUTH_SOURCE);
      res.setHeader("x-auth-reason", "jwt-secret-missing");
      return res.status(500).json({ error: "JWT_SECRET no configurado" });
    }

    let payload: JWTPayload | null = null;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    } catch {
      res.setHeader("x-auth-source", AUTH_SOURCE);
      res.setHeader("x-auth-reason", "invalid-or-expired-token");
      return res.status(401).json({ error: "Token inválido o expirado" });
    }

    // ── bookingId por query (?bookingId=) con fallback a ?id=
    const bookingIdParamRaw =
      (Array.isArray(req.query.bookingId)
        ? req.query.bookingId[0]
        : req.query.bookingId) ??
      (Array.isArray(req.query.id) ? req.query.id[0] : req.query.id);

    const bookingId = Number(bookingIdParamRaw);
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: "bookingId inválido" });
    }

    const current = await prisma.booking.findUnique({
      where: { id_booking: bookingId },
      select: { id_booking: true, id_agency: true },
    });
    if (!current) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    // ── Autorización por agencia
    const userAgencyId = getAgencyIdFromPayload(payload);
    if (!userAgencyId || userAgencyId !== current.id_agency) {
      res.setHeader("x-auth-source", AUTH_SOURCE);
      res.setHeader("x-auth-reason", "agency-mismatch");
      return res.status(403).json({ error: "No autorizado" });
    }

    // ── Vecinos dentro de la misma agencia
    const prev = await prisma.booking.findFirst({
      where: {
        id_agency: current.id_agency,
        id_booking: { lt: current.id_booking },
      },
      select: { id_booking: true },
      orderBy: { id_booking: "desc" },
    });

    const next = await prisma.booking.findFirst({
      where: {
        id_agency: current.id_agency,
        id_booking: { gt: current.id_booking },
      },
      select: { id_booking: true },
      orderBy: { id_booking: "asc" },
    });

    return res.status(200).json({
      prevId: prev?.id_booking ?? null,
      nextId: next?.id_booking ?? null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("neighbor error", e);
    return res.status(500).json({ error: "Error interno" });
  }
}
