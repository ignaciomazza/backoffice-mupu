// src/pages/api/finance/_auth.ts
import type { NextApiRequest } from "next";
import { jwtVerify, type JWTPayload } from "jose";
import prisma from "@/lib/prisma";

export type AuthCtx = {
  userId?: number;
  agencyId?: number;
  role?: string;
  email?: string;
};

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
    if (c[k]) return c[k] as string;
  }
  return null;
}

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

export async function getAuth(req: NextApiRequest): Promise<AuthCtx> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return {};

    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || "dev_secret",
    );
    const { payload } = await jwtVerify(token, secret);
    const p = payload as TokenPayload;

    const userId = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    const agencyId = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = (p.role || "") as string | undefined;
    const email = p.email;

    // Completar agency si falta
    if (!agencyId && (userId || email)) {
      const user = await prisma.user.findFirst({
        where: userId ? { id_user: userId } : { email: email ?? "" },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (user) {
        return {
          userId: user.id_user,
          agencyId: user.id_agency,
          role: role ?? user.role,
          email: email ?? user.email ?? undefined,
        };
      }
    }

    return { userId, agencyId, role, email };
  } catch {
    return {};
  }
}
