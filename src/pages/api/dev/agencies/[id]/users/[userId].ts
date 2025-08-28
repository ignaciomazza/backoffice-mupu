// src/pages/api/dev/agencies/[id]/users/[userId].ts
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
   Auth (solo desarrollador)
========================= */
type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  role?: string;
  email?: string;
};

type UserTeamDelegateLike = {
  deleteMany: (args: { where: { id_user: number } }) => Promise<unknown>;
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
async function requireDeveloper(req: NextApiRequest): Promise<number> {
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
  return id_user;
}

/* =========================
   Utils / Validaciones
========================= */
function parseIntParam(val: unknown, name: string): number {
  const raw = Array.isArray(val) ? val[0] : val;
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) throw httpError(400, `${name} inválido`);
  return n;
}

/** Toma la primera key presente en req.query */
function getQueryValue(
  req: NextApiRequest,
  keys: string[],
): string | string[] | undefined {
  for (const k of keys) {
    const v = req.query[k];
    if (typeof v !== "undefined") return v;
  }
  return undefined;
}

/** Versión para números con label descriptivo */
function getQueryInt(
  req: NextApiRequest,
  keys: string[],
  label: string,
): number {
  return parseIntParam(getQueryValue(req, keys), label);
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
   Handlers
========================= */
async function handleGET(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = getQueryInt(req, ["id"], "ID de agencia");
  const userId = getQueryInt(req, ["userId", "uid"], "ID de usuario");

  const user = await prisma.user.findUnique({
    where: { id_user: userId },
    select: userSafeSelect,
  });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (user.id_agency !== id_agency)
    return res.status(403).json({ error: "Usuario no pertenece a la agencia" });

  return res.status(200).json(user);
}

async function handlePUT(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = getQueryInt(req, ["id"], "ID de agencia");
  const userId = getQueryInt(req, ["userId"], "ID de usuario");

  const { email, first_name, last_name, position, role } = req.body ?? {};
  if (!email || !first_name || !last_name) {
    return res
      .status(400)
      .json({ error: "email, first_name y last_name son obligatorios" });
  }

  const target = await prisma.user.findUnique({
    where: { id_user: userId },
    select: { id_user: true, id_agency: true },
  });
  if (!target) return res.status(404).json({ error: "Usuario no encontrado" });
  if (target.id_agency !== id_agency)
    return res.status(403).json({ error: "Usuario no pertenece a la agencia" });

  if (role && !ALLOWED_ROLES.has(normalizeRole(role))) {
    return res.status(400).json({ error: "Rol inválido" });
  }

  const dup = await prisma.user.findFirst({
    where: { email, id_user: { not: userId } },
    select: { id_user: true },
  });
  if (dup)
    return res
      .status(400)
      .json({ error: "Ya existe otro usuario con ese email." });

  const updated = await prisma.user.update({
    where: { id_user: userId },
    data: {
      email,
      first_name,
      last_name,
      position: position ?? null,
      ...(role ? { role: normalizeRole(role) } : {}),
    },
    select: userSafeSelect,
  });

  return res.status(200).json(updated);
}

async function handlePATCH(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = getQueryInt(req, ["id"], "ID de agencia");
  const userId = getQueryInt(req, ["userId"], "ID de usuario");

  const { action, newPassword, confirmPassword } = req.body ?? {};
  if (action !== "changePassword") {
    return res.status(400).json({ error: "Acción inválida" });
  }
  if (typeof newPassword !== "string" || typeof confirmPassword !== "string") {
    return res
      .status(400)
      .json({ error: "Debes indicar la nueva contraseña y su confirmación" });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "Las contraseñas no coinciden" });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      error:
        "La contraseña debe tener al menos 8 caracteres e incluir mayúscula, minúscula, número y símbolo.",
    });
  }

  const target = await prisma.user.findUnique({
    where: { id_user: userId },
    select: { id_agency: true },
  });
  if (!target) return res.status(404).json({ error: "Usuario no encontrado" });
  if (target.id_agency !== id_agency)
    return res.status(403).json({ error: "Usuario no pertenece a la agencia" });

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id_user: userId },
    data: { password: hashed },
  });
  return res.status(200).json({ message: "Contraseña actualizada con éxito" });
}

async function handleDELETE(req: NextApiRequest, res: NextApiResponse) {
  await requireDeveloper(req);
  const id_agency = getQueryInt(req, ["id"], "ID de agencia");
  const userId = getQueryInt(req, ["userId"], "ID de usuario");

  const target = await prisma.user.findUnique({
    where: { id_user: userId },
    select: { id_agency: true },
  });
  if (!target) return res.status(404).json({ error: "Usuario no encontrado" });
  if (target.id_agency !== id_agency)
    return res.status(403).json({ error: "Usuario no pertenece a la agencia" });

  const maybeUserTeam = (
    prisma as unknown as { userTeam?: UserTeamDelegateLike }
  ).userTeam;

  if (maybeUserTeam) {
    try {
      await maybeUserTeam.deleteMany({ where: { id_user: userId } });
    } catch {
      // Si el modelo existe pero falla por otra razón, lo ignoramos silenciosamente
    }
  }

  await prisma.user.delete({ where: { id_user: userId } });
  return res.status(200).json({ message: "Usuario eliminado con éxito" });
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
    if (req.method === "PUT") return await handlePUT(req, res);
    if (req.method === "PATCH") return await handlePATCH(req, res);
    if (req.method === "DELETE") return await handleDELETE(req, res);

    res.setHeader("Allow", ["GET", "PUT", "PATCH", "DELETE"]);
    return res.status(405).end(`Method ${req.method} no permitido`);
  } catch (e) {
    const err = e as AppError;
    const status = typeof err.status === "number" ? err.status : 500;
    const message = err.message || "Error";
    return res.status(status).json({ error: message });
  }
}
