// src/pages/api/dev/agencies/[id]/users/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { jwtVerify, type JWTPayload } from "jose";

/* =========================
   ENV
========================= */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

/* =========================
   Auth helpers (solo DEV)
========================= */
type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  email?: string;
};

type AppError = Error & { status?: number };

function httpError(status: number, message: string): AppError {
  const err = new Error(message) as AppError;
  err.status = status;
  return err;
}

function normalizeRole(r?: string) {
  return (r ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/^leader$/, "lider");
}

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = req.cookies?.[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function requireDeveloper(req: NextApiRequest): Promise<{
  id_user: number;
  email?: string;
}> {
  const token = getTokenFromRequest(req);
  if (!token) throw httpError(401, "No autenticado");

  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(JWT_SECRET),
  );
  const p = payload as TokenPayload;
  const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
  const role = normalizeRole(p.role);

  if (!id_user || role !== "desarrollador")
    throw httpError(403, "No autorizado");
  return { id_user, email: p.email };
}

/* =========================
   Utils
========================= */
function parseAgencyId(param: unknown): number {
  const raw = Array.isArray(param) ? param[0] : param;
  const id = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0)
    throw httpError(400, "ID de agencia inválido");
  return id;
}

const userSafeSelect = {
  id_user: true,
  email: true,
  first_name: true,
  last_name: true,
  position: true,
  role: true,
  id_agency: true,
  creation_date: true,
} as const;

const ALLOWED_ROLES = new Set([
  "desarrollador",
  "gerente",
  "lider",
  "vendedor",
  "administrativo",
  "marketing",
]);

function isStrongPassword(pw: unknown): boolean {
  if (typeof pw !== "string") return false;
  if (pw.length < 8) return false;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  return hasLower && hasUpper && hasNumber && hasSymbol;
}

/* =========================
   GET: lista (con búsqueda y cursor)
   POST: crear usuario en esa agencia
========================= */
async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limitRaw = Array.isArray(req.query.limit)
    ? req.query.limit[0]
    : req.query.limit;
  const limit = Math.min(
    50,
    Math.max(5, Number.parseInt(String(limitRaw ?? "20"), 10) || 20),
  );
  const cursorRaw = Array.isArray(req.query.cursor)
    ? req.query.cursor[0]
    : req.query.cursor;
  const cursorId = cursorRaw ? Number.parseInt(String(cursorRaw), 10) : null;

  const where = {
    id_agency,
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { first_name: { contains: q, mode: "insensitive" as const } },
            { last_name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    // opcional: validar existencia de agencia para 404 más claro
    const exists = await prisma.agency.findUnique({
      where: { id_agency },
      select: { id_agency: true },
    });
    if (!exists)
      return res.status(404).json({ error: "Agencia no encontrada" });

    const list = await prisma.user.findMany({
      where,
      orderBy: { id_user: "desc" },
      ...(cursorId ? { cursor: { id_user: cursorId }, skip: 1 } : undefined),
      take: limit + 1,
      select: userSafeSelect,
    });

    let nextCursor: number | null = null;
    let items = list;
    if (list.length > limit) {
      nextCursor = list[list.length - 1].id_user;
      items = list.slice(0, limit);
    }

    return res.status(200).json({ items, nextCursor });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[dev/agencies/:id/users][GET]", e);
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
}

async function handlePOST(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = parseAgencyId(req.query.id);

  const { email, password, first_name, last_name, position, role } =
    req.body ?? {};

  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({
      error:
        "Los campos 'email', 'password', 'first_name' y 'last_name' son obligatorios.",
    });
  }

  const newRole = normalizeRole(String(role || "vendedor"));
  if (!ALLOWED_ROLES.has(newRole)) {
    return res.status(400).json({ error: "Rol inválido" });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error:
        "La contraseña debe tener al menos 8 caracteres e incluir mayúscula, minúscula, número y símbolo.",
    });
  }

  try {
    // verificar agencia
    const agency = await prisma.agency.findUnique({
      where: { id_agency },
      select: { id_agency: true },
    });
    if (!agency)
      return res.status(404).json({ error: "Agencia no encontrada" });

    // email único
    const dup = await prisma.user.findUnique({ where: { email } });
    if (dup)
      return res
        .status(400)
        .json({ error: "Ya existe un usuario con ese email." });

    const hashed = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email,
        password: hashed,
        first_name,
        last_name,
        position: position ?? null,
        role: newRole,
        id_agency, // la del path
      },
      select: userSafeSelect,
    });

    return res.status(201).json(created);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[dev/agencies/:id/users][POST]", e);
    return res.status(500).json({ error: "Error al crear el usuario" });
  }
}

/* =========================
   Router
========================= */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") return await handleGET(req, res);
    if (req.method === "POST") return await handlePOST(req, res);

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} no permitido`);
  } catch (e) {
    const err = e as AppError;
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err.message || "Error";
    return res.status(status).json({ error: message });
  }
}
