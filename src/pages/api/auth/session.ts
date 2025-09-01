// src/pages/api/auth/session.ts
import { NextApiRequest, NextApiResponse } from "next";
import { jwtVerify, JWTPayload } from "jose";

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

function getTokenFromRequest(req: NextApiRequest): string | null {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7); // ✅ primero Authorization
  if (req.cookies?.token) return req.cookies.token; // luego cookie
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("ETag", Date.now().toString());

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Método ${req.method} no permitido`);
  }

  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "No autenticado" });

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    return res.status(200).json({
      token,
      claims: {
        id_user: Number(p.id_user ?? p.userId ?? p.uid) || undefined,
        id_agency: Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined,
        role: p.role,
        email: p.email,
      },
    });
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}
