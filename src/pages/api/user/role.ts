// src/pages/api/user/role.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, JWTPayload } from "jose";

/* ================== Auth helpers ================== */

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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

function getTokenFromRequest(req: NextApiRequest): string | null {
  // 1) Cookie "token" (más confiable detrás de proxies)
  if (req.cookies?.token) return req.cookies.token;

  // 2) Authorization: Bearer
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  // 3) Otros posibles nombres de cookie (defensivo)
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

async function getUserIdFromAuth(req: NextApiRequest): Promise<number | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    // id posible en distintos claims
    const idFromToken = Number(p.id_user ?? p.userId ?? p.uid) || undefined;

    if (idFromToken) return idFromToken;

    // fallback por email si existiera
    if (p.email) {
      const u = await prisma.user.findUnique({
        where: { email: p.email },
        select: { id_user: true },
      });
      return u?.id_user ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

/* ================== Handler ================== */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Método ${req.method} no permitido`);
  }

  const id_user = await getUserIdFromAuth(req);
  if (!id_user) {
    return res.status(401).json({ error: "No autenticado" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id_user },
      select: { role: true },
    });
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    // Mantiene el shape esperado por el front: { role: string }
    return res.status(200).json({ role: user.role });
  } catch (error) {
    console.error("[user/role][GET]", error);
    return res.status(500).json({ error: "Error obteniendo rol" });
  }
}
