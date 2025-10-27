import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";

/* =========================================================
 * Auth helpers (mismo approach que /api/agency)
 * ========================================================= */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  email?: string;
};

type DecodedAuth = {
  id_user: number;
  id_agency: number;
  role: string;
  email?: string;
};

function normalizeRole(r?: string) {
  return (r ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase(); // "desarrollador", "gerente", etc.
}

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
    const v = c[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedAuth | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    let id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    let role = normalizeRole(p.role);
    const email = p.email;

    // fallback a DB si faltan datos en el token
    if (id_user && (!id_agency || !role)) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (!u) return null;
      id_agency = id_agency ?? u.id_agency;
      role = role || normalizeRole(u.role);
    } else if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true },
      });
      if (!u) return null;
      return {
        id_user: u.id_user,
        id_agency: u.id_agency,
        role: normalizeRole(u.role),
        email,
      };
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role, email: email ?? undefined };
  } catch {
    return null;
  }
}

/* =========================================================
 * Zod schemas
 * ========================================================= */

// Strings del form público
const trimToUndef = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s.length ? s : undefined));

const emailRequired = z
  .string()
  .transform((s) => s.trim())
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email inválido");

/**
 * Esta es la forma en que el formulario de la landing nos pega.
 * Campos visibles en el form:
 *  - name
 *  - agency
 *  - role
 *  - size
 *  - location
 *  - email
 *  - whatsapp
 *  - message
 *
 * Los vamos a mapear a los campos reales de la tabla Lead:
 *  - full_name
 *  - agency_name
 *  - role
 *  - team_size
 *  - location
 *  - email
 *  - whatsapp
 *  - message
 */
const PublicLeadCreateSchema = z.object({
  name: z
    .string()
    .min(2, "Nombre requerido")
    .transform((s) => s.trim()),
  agency: z
    .string()
    .min(2, "Agencia / Operador requerido")
    .transform((s) => s.trim()),
  role: z
    .string()
    .min(2, "Rol requerido")
    .transform((s) => s.trim()),
  size: trimToUndef.optional(),
  location: trimToUndef.optional(),
  email: emailRequired,
  whatsapp: trimToUndef
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined))
    .optional(),
  message: trimToUndef.optional(),
});

/* =========================================================
 * GET /api/leads
 * - Sólo para perfiles internos (desarrollador / gerente)
 * - Paginado con cursor por id_lead DESC
 * - Query: ?limit=12&cursor=123
 * ========================================================= */

async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const role = normalizeRole(auth.role);
  const allowedRoles = ["desarrollador", "gerente"];
  if (!allowedRoles.includes(role)) {
    res.status(403).json({ error: "No autorizado" });
    return;
  }

  // parseo query
  const { limit, cursor } = req.query;

  let take = Number(limit ?? 12);
  if (!Number.isFinite(take) || take <= 0) take = 12;
  if (take > 50) take = 50;

  const cursorNum = cursor ? Number(cursor) : null;

  // paginación: traigo leads con id_lead < cursor si lo pasaron
  const whereClause: Record<string, unknown> = {};
  if (cursorNum && Number.isFinite(cursorNum)) {
    whereClause.id_lead = { lt: cursorNum };
  }

  try {
    const leads = await prisma.lead.findMany({
      where: whereClause,
      orderBy: { id_lead: "desc" },
      take,
    });

    const nextCursorVal =
      leads.length === take ? (leads[leads.length - 1]?.id_lead ?? null) : null;

    // devolvemos el shape que va a consumir el front (DevLeadsPage)
    res.status(200).json({
      items: leads.map((l) => ({
        id_lead: l.id_lead,
        created_at: l.created_at,
        full_name: l.full_name,
        agency_name: l.agency_name,
        role: l.role,
        team_size: l.team_size ?? null,
        location: l.location ?? null,
        email: l.email,
        whatsapp: l.whatsapp ?? null,
        message: l.message ?? null,
        status: l.status ?? "PENDING",
        contacted_at: l.contacted_at ?? null,
        source: l.source ?? "landing",
      })),
      nextCursor: nextCursorVal,
    });
  } catch (e) {
    console.error("[leads][GET]", e);
    res.status(500).json({ error: "Error al obtener leads" });
  }
}

/* =========================================================
 * POST /api/leads
 * - Público (landing). No requiere auth.
 * - Crea el Lead en DB con status="PENDING", source="landing"
 * ========================================================= */

async function handlePOST(req: NextApiRequest, res: NextApiResponse) {
  try {
    const parsed = PublicLeadCreateSchema.parse(req.body ?? {});
    const { name, agency, role, size, location, email, whatsapp, message } =
      parsed;

    // Map landing -> prisma fields
    const created = await prisma.lead.create({
      data: {
        full_name: name,
        agency_name: agency,
        role,
        team_size: size ?? null,
        location: location ?? null,
        email,
        whatsapp: whatsapp ?? null,
        message: message ?? null,
        status: "PENDING", // arranca pendiente
        source: "landing",
      },
      select: {
        id_lead: true,
      },
    });

    res.status(201).json({ ok: true, id_lead: created.id_lead });
  } catch (e: unknown) {
    // validación zod
    if (
      typeof e === "object" &&
      e !== null &&
      (e as Record<string, unknown>).name === "ZodError"
    ) {
      const issues = (e as Record<string, unknown>).issues;
      const msg =
        Array.isArray(issues) &&
        issues[0] &&
        typeof (issues[0] as Record<string, unknown>).message === "string"
          ? String((issues[0] as Record<string, unknown>).message)
          : "Datos inválidos";
      res.status(400).json({ error: msg });
      return;
    }

    console.error("[leads][POST]", e);
    res.status(500).json({ error: "Error al guardar el lead" });
  }
}

/* =========================================================
 * Router /api/leads
 * ========================================================= */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    await handleGET(req, res);
    return;
  }
  if (req.method === "POST") {
    await handlePOST(req, res);
    return;
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end(`Método ${req.method} no permitido`);
}
