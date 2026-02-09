import type { NextApiRequest } from "next";
import { jwtVerify, type JWTPayload } from "jose";
import prisma from "@/lib/prisma";
import { normalizeRole } from "@/utils/permissions";

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

export type QuoteAuth = {
  id_user: number;
  id_agency: number;
  role: string;
  email?: string;
};

const ADMIN_ROLES = new Set(["gerente", "administrativo", "desarrollador"]);

export function getTokenFromRequest(req: NextApiRequest): string | null {
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
    if (c[k]) return c[k]!;
  }
  return null;
}

export async function resolveQuoteAuth(
  req: NextApiRequest,
): Promise<QuoteAuth | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    let id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
    let id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || 0;
    const role = normalizeRole(p.role);
    const email = p.email || undefined;

    if ((!id_user || !id_agency) && (id_user || email)) {
      const user = await prisma.user.findFirst({
        where: id_user ? { id_user } : { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (user) {
        id_user = user.id_user;
        id_agency = user.id_agency;
        return {
          id_user,
          id_agency,
          role: role || normalizeRole(user.role),
          email: email ?? user.email ?? undefined,
        };
      }
    }

    if (!id_user || !id_agency) return null;
    return {
      id_user,
      id_agency,
      role: role || "",
      email,
    };
  } catch {
    return null;
  }
}

export async function getLeaderScope(authUserId: number, authAgencyId: number) {
  const teams = await prisma.salesTeam.findMany({
    where: {
      id_agency: authAgencyId,
      user_teams: { some: { user: { id_user: authUserId, role: "lider" } } },
    },
    include: { user_teams: { select: { id_user: true } } },
  });
  const teamIds = teams.map((t) => t.id_team);
  const userIds = new Set<number>([authUserId]);
  teams.forEach((t) => t.user_teams.forEach((ut) => userIds.add(ut.id_user)));
  return { teamIds, userIds: Array.from(userIds) };
}

export function isQuoteAdminRole(role: string): boolean {
  return ADMIN_ROLES.has(normalizeRole(role));
}

export async function canAccessQuoteOwner(
  auth: QuoteAuth,
  ownerUserId: number,
): Promise<boolean> {
  if (isQuoteAdminRole(auth.role)) return true;
  const role = normalizeRole(auth.role);
  if (role === "vendedor") return ownerUserId === auth.id_user;
  if (role === "lider") {
    const scope = await getLeaderScope(auth.id_user, auth.id_agency);
    return scope.userIds.includes(ownerUserId);
  }
  return false;
}

