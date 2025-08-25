// src/pages/api/user/profile.ts
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

type DecodedAuth = {
  id_user: number;
  id_agency: number;
  role: string; // normalizado
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

/* ================== Handler ================== */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ error: "No autenticado o token inválido" });
  }

  try {
    // Datos base del usuario autenticado
    const me = await prisma.user.findUnique({
      where: { id_user: auth.id_user },
      select: {
        id_user: true,
        id_agency: true,
        first_name: true,
        last_name: true,
        email: true,
        position: true,
        role: true,
        // No exponer password
      },
    });

    if (!me) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const role = normalizeRole(me.role);

    // ===== salesData (mismo shape que ya usabas) =====
    let salesData:
      | {
          id_booking: number;
          details: string | null;
          totalServices: number;
          totalSales: number;
          seller?: string;
        }[]
      | undefined;

    if (role === "vendedor") {
      const myBookings = await prisma.booking.findMany({
        where: { id_user: me.id_user },
        select: {
          id_booking: true,
          details: true,
          services: { select: { sale_price: true } },
        },
        orderBy: { id_booking: "desc" },
      });

      salesData = myBookings.map((b) => ({
        id_booking: b.id_booking,
        details: b.details,
        totalServices: b.services.length,
        totalSales: b.services.reduce((sum, s) => sum + s.sale_price, 0),
      }));
    } else if (role === "lider") {
      // IDs de usuarios de equipos donde yo sea líder
      const teams = await prisma.salesTeam.findMany({
        where: {
          id_agency: me.id_agency,
          user_teams: {
            some: { user: { id_user: me.id_user, role: "lider" } },
          },
        },
        select: {
          user_teams: { select: { user: { select: { id_user: true } } } },
        },
      });

      const userIds = new Set<number>([me.id_user]);
      teams.forEach((t) =>
        t.user_teams.forEach((ut) => userIds.add(ut.user.id_user)),
      );

      const teamBookings = await prisma.booking.findMany({
        where: { id_user: { in: Array.from(userIds) } },
        select: {
          id_booking: true,
          details: true,
          services: { select: { sale_price: true } },
          user: { select: { first_name: true, last_name: true } },
        },
        orderBy: { id_booking: "desc" },
      });

      salesData = teamBookings.map((b) => ({
        id_booking: b.id_booking,
        details: b.details,
        totalServices: b.services.length,
        totalSales: b.services.reduce((sum, s) => sum + s.sale_price, 0),
        seller: `${b.user.first_name} ${b.user.last_name}`,
      }));
    } else {
      // Para otros roles (gerente, desarrollador, etc.) podés no enviar salesData o dejarlo vacío
      salesData = [];
    }

    // ===== flags de permisos útiles para el front (no rompen nada si no se usan) =====
    const canSeeAllUsers = role === "gerente" || role === "desarrollador";
    const canResetOthers = canSeeAllUsers; // pueden resetear passwords sin oldPassword
    const canEditSelf = true; // siempre puede editar sus propios datos (restricciones en backend)

    return res.status(200).json({
      // shape existente (compat)
      id_user: me.id_user,
      id_agency: me.id_agency,
      name: `${me.first_name} ${me.last_name}`,
      first_name: me.first_name,
      last_name: me.last_name,
      email: me.email,
      position: me.position,
      role: me.role,
      salesData,

      // extras (opcionales para UI/UX)
      permissions: {
        canSeeAllUsers,
        canEditSelf,
        canResetOthers,
      },
    });
  } catch (error) {
    console.error("[user/profile][GET]", error);
    return res.status(500).json({ error: "Error fetching profile" });
  }
}
