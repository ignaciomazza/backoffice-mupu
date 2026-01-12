// src/lib/arcaAuth.ts
import type { NextApiRequest } from "next";
import { jwtVerify, type JWTPayload } from "jose";
import prisma from "@/lib/prisma";

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

export type AuthContext = {
  id_user: number;
  id_agency: number;
  role: string;
};

function normalizeRole(raw?: string) {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
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

export async function getAuthContext(
  req: NextApiRequest,
): Promise<AuthContext | null> {
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

    if (id_user && (!id_agency || !role)) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true },
      });
      if (!u) return null;
      id_agency = id_agency ?? u.id_agency;
      role = role || normalizeRole(u.role);
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role };
  } catch {
    return null;
  }
}

export function hasArcaAccess(role: string | null | undefined): boolean {
  return role === "gerente" || role === "desarrollador";
}
