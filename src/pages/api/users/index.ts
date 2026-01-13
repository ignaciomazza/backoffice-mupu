// src/pages/api/users/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import bcrypt from "bcrypt";
import { jwtVerify, JWTPayload } from "jose";

/* ================== Auth & helpers ================== */

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

type DecodedAuth = {
  id_user: number;
  id_agency: number;
  role: string; // normalizado (minúsculas, sin tildes)
  email?: string;
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token; // cookie principal
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  // otros posibles nombres de cookie (defensivo)
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

function normalizeRole(r?: string) {
  return (r ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/^leader$/, "lider");
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
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = normalizeRole(p.role);
    const email = p.email;

    // completar si falta
    if (!id_user && email) {
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
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (!u) return null;
      return {
        id_user,
        id_agency: u.id_agency,
        role: role || normalizeRole(u.role),
        email: email ?? u.email ?? undefined,
      };
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role: role || "", email: email ?? undefined };
  } catch {
    return null;
  }
}

const userSafeSelect = {
  id_user: true,
  agency_user_id: true,
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
  const hasSymbol = /[^A-Za-z0-9]/.test(pw); // símbolo obligatorio
  return hasLower && hasUpper && hasNumber && hasSymbol;
}

/* ================== Handlers ================== */

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ error: "No autenticado o token inválido." });
  }

  const role = normalizeRole(auth.role);
  const isManager = role === "gerente" || role === "desarrollador";
  const isSellerOrLeader = role === "vendedor" || role === "lider";

  // búsqueda simple opcional
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  try {
    if (isSellerOrLeader) {
      // vendedor/líder: solo su propio usuario
      const me = await prisma.user.findUnique({
        where: { id_user: auth.id_user },
        select: userSafeSelect,
      });
      return res.status(200).json(me ? [me] : []);
    }

    if (!isManager) {
      // roles no contemplados (p.ej. "administrativo"/"marketing") -> limitar por agencia
      // si querés endurecer más, podés devolver 403 directamente
      const users = await prisma.user.findMany({
        where: {
          id_agency: auth.id_agency,
          ...(q
            ? {
                OR: [
                  { email: { contains: q, mode: "insensitive" } },
                  { first_name: { contains: q, mode: "insensitive" } },
                  { last_name: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: userSafeSelect,
        orderBy: { id_user: "desc" },
      });
      return res.status(200).json(users);
    }

    // gerente/desarrollador: todos los usuarios de su agencia (con búsqueda opcional)
    const users = await prisma.user.findMany({
      where: {
        id_agency: auth.id_agency,
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { first_name: { contains: q, mode: "insensitive" } },
                { last_name: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: userSafeSelect,
      orderBy: { id_user: "desc" },
    });

    return res.status(200).json(users);
  } catch (error) {
    console.error("[users][GET]", error);
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ error: "No autenticado o token inválido." });
  }

  const role = normalizeRole(auth.role);
  const isManager = role === "gerente" || role === "desarrollador";
  if (!isManager) {
    return res.status(403).json({ error: "No autorizado para crear usuarios" });
  }

  const {
    email,
    password,
    first_name,
    last_name,
    position,
    role: newRoleRaw = "vendedor",
    // id_agency (IGNORADO: se usa el del token)
  } = req.body ?? {};

  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({
      error:
        "Los campos 'email', 'password', 'first_name' y 'last_name' son obligatorios.",
    });
  }

  const newRole = normalizeRole(String(newRoleRaw || "vendedor"));
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
    // email único (constrain único a nivel esquema)
    const dup = await prisma.user.findUnique({ where: { email } });
    if (dup) {
      return res
        .status(400)
        .json({ error: "Ya existe un usuario con ese email." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.$transaction(async (tx) => {
      const agencyUserId = await getNextAgencyCounter(
        tx,
        auth.id_agency,
        "user",
      );

      return tx.user.create({
        data: {
          email,
          password: hashedPassword,
          first_name,
          last_name,
          position: position ?? null,
          id_agency: auth.id_agency, // SIEMPRE de la agencia del creador
          agency_user_id: agencyUserId,
          role: newRole,
        },
        select: userSafeSelect,
      });
    });

    return res.status(201).json(newUser);
  } catch (error) {
    console.error("[users][POST]", error);
    return res.status(500).json({ error: "Error al crear el usuario" });
  }
}

/* ================== Router ================== */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Método ${req.method} no permitido`);
}
