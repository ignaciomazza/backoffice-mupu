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
  // 1) Cookie primaria
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Método ${req.method} no permitido`);
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "No autenticado" });
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    // Mantenemos { token } para compatibilidad con AuthContext.
    // Sumamos "claims" (opcional) por si te resulta útil en el front.
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
    // Token inválido/expirado
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}
