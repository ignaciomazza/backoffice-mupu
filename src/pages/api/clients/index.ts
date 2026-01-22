// src/pages/api/clients/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";

// ==== Tipos auxiliares ====
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
  role: string; // en minúscula
  email?: string;
};

// ==== JWT Secret (mismo en todos los endpoints, sin defaults) ====
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

// ==== Helpers comunes ====
function getTokenFromRequest(req: NextApiRequest): string | null {
  // 1) Cookie "token" (más confiable en prod con proxies)
  if (req.cookies?.token) return req.cookies.token;

  // 2) Authorization: Bearer
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  // 3) Otros nombres posibles de cookie
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
    const role = String(p.role || "").toLowerCase();
    const email = p.email;

    // Completar agencia si falta
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u) {
        return {
          id_user,
          id_agency: u.id_agency,
          role: role || u.role.toLowerCase(),
          email: email ?? u.email ?? undefined,
        };
      }
    }

    // Buscar por email si falta id_user
    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true },
      });
      if (u) {
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role.toLowerCase(),
          email,
        };
      }
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role, email: email ?? undefined };
  } catch {
    return null;
  }
}

function toLocalDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m)
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const userSelectSafe = {
  id_user: true,
  first_name: true,
  last_name: true,
  role: true,
  id_agency: true,
  email: true,
} as const;

type VisibilityMode = "all" | "team" | "own";

function normalizeVisibilityMode(v: unknown): VisibilityMode {
  return v === "team" || v === "own" || v === "all" ? v : "all";
}

async function getVisibilityMode(authAgencyId: number): Promise<VisibilityMode> {
  const cfg = await prisma.clientConfig.findFirst({
    where: { id_agency: authAgencyId },
    select: { visibility_mode: true },
  });
  return normalizeVisibilityMode(cfg?.visibility_mode);
}

type TeamScope = {
  teamIds: number[];
  userIds: number[];
  membersByTeam: Record<number, number[]>;
};

async function getTeamScope(
  authUserId: number,
  authAgencyId: number,
): Promise<TeamScope> {
  const teams = await prisma.salesTeam.findMany({
    where: {
      id_agency: authAgencyId,
      user_teams: { some: { id_user: authUserId } },
    },
    include: { user_teams: { select: { id_user: true } } },
  });

  const teamIds = teams.map((t) => t.id_team);
  const userIds = new Set<number>([authUserId]);
  const membersByTeam: Record<number, number[]> = {};

  teams.forEach((t) => {
    const ids = t.user_teams.map((ut) => ut.id_user);
    membersByTeam[t.id_team] = ids;
    ids.forEach((id) => userIds.add(id));
  });

  return { teamIds, userIds: Array.from(userIds), membersByTeam };
}

// Alcance de líder (equipos que lidera + ids de usuarios alcanzables)
async function getLeaderScope(authUserId: number, authAgencyId: number) {
  const teams = await prisma.salesTeam.findMany({
    where: {
      id_agency: authAgencyId,
      user_teams: { some: { user: { id_user: authUserId, role: "lider" } } },
    },
    include: { user_teams: { select: { id_user: true } } },
  });
  const teamIds = teams.map((t) => t.id_team);
  const userIds = new Set<number>([authUserId]);
  const membersByTeam: Record<number, number[]> = {};
  teams.forEach((t) => {
    const ids = t.user_teams.map((ut) => ut.id_user);
    membersByTeam[t.id_team] = ids;
    ids.forEach((id) => userIds.add(id));
  });
  return { teamIds, userIds: Array.from(userIds), membersByTeam };
}

// ==== Handler principal ====
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ error: "No autenticado o token inválido." });
  }

  const role = (auth.role || "").toLowerCase();

  // ===== GET: lista con filtros + cursor =====
  if (req.method === "GET") {
    try {
      const takeParam = safeNumber(
        Array.isArray(req.query.take) ? req.query.take[0] : req.query.take,
      );
      const take = Math.min(Math.max(takeParam || 24, 1), 100);

      const cursorParam = safeNumber(
        Array.isArray(req.query.cursor)
          ? req.query.cursor[0]
          : req.query.cursor,
      );
      const cursor = cursorParam;

      const userIdParam = safeNumber(
        Array.isArray(req.query.userId)
          ? req.query.userId[0]
          : req.query.userId,
      );
      const userId = userIdParam || 0;

      const teamIdParam = safeNumber(
        Array.isArray(req.query.teamId)
          ? req.query.teamId[0]
          : req.query.teamId,
      );
      const teamId = teamIdParam || 0;

      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const gender =
        typeof req.query.gender === "string" ? req.query.gender.trim() : "";
      const where: Prisma.ClientWhereInput = { id_agency: auth.id_agency };
      const roleNorm = (role || "").toLowerCase();
      const isLeader = roleNorm === "lider";
      const isSeller = roleNorm === "vendedor";

      const visibilityMode = isLeader
        ? "team"
        : isSeller
          ? await getVisibilityMode(auth.id_agency)
          : "all";

      if (visibilityMode === "own") {
        where.id_user = auth.id_user;
      } else if (visibilityMode === "team") {
        const scope = isLeader
          ? await getLeaderScope(auth.id_user, auth.id_agency)
          : await getTeamScope(auth.id_user, auth.id_agency);
        const allowedUserIds = scope.userIds.length
          ? scope.userIds
          : [auth.id_user];
        const allowedTeamIds = new Set(scope.teamIds);

        if (userId > 0 && allowedUserIds.includes(userId)) {
          where.id_user = userId;
        } else if (teamId > 0 && allowedTeamIds.has(teamId)) {
          const ids = scope.membersByTeam[teamId] || [];
          where.id_user = { in: ids.length ? ids : [-1] };
        } else {
          where.id_user = { in: allowedUserIds };
        }
      } else {
        if (userId > 0) where.id_user = userId;

        if (!userId && teamId !== 0) {
          if (teamId > 0) {
            const team = await prisma.salesTeam.findUnique({
              where: { id_team: teamId },
              include: { user_teams: { select: { id_user: true } } },
            });
            if (!team || team.id_agency !== auth.id_agency) {
              return res
                .status(403)
                .json({ error: "Equipo inválido para esta agencia." });
            }
            const ids = team.user_teams.map((ut) => ut.id_user);
            where.id_user = { in: ids.length ? ids : [-1] };
          } else if (teamId === -1) {
            const users = await prisma.user.findMany({
              where: { id_agency: auth.id_agency, sales_teams: { none: {} } },
              select: { id_user: true },
            });
            const ids = users.map((u) => u.id_user);
            where.id_user = { in: ids.length ? ids : [-1] };
          }
        }
      }

      if (gender) {
        where.gender = { equals: gender, mode: "insensitive" };
      }

      // Búsqueda simple
      if (q) {
        const or: Prisma.ClientWhereInput[] = [];
        const qNum = Number(q);
        if (!isNaN(qNum)) {
          or.push({ id_client: qNum });
          or.push({ agency_client_id: qNum });
        }

        const qLike = q;
        or.push({ first_name: { contains: qLike, mode: "insensitive" } });
        or.push({ last_name: { contains: qLike, mode: "insensitive" } });
        or.push({ dni_number: { contains: qLike } });
        or.push({ passport_number: { contains: qLike } });
        or.push({ email: { contains: qLike, mode: "insensitive" } });
        or.push({ tax_id: { contains: qLike, mode: "insensitive" } });
        or.push({ company_name: { contains: qLike, mode: "insensitive" } });

        where.AND = Array.isArray(where.AND)
          ? [...where.AND, { OR: or }]
          : [{ OR: or }];
      }

      // Query con cursor
      const items = await prisma.client.findMany({
        where,
        include: {
          user: { select: userSelectSafe },
        },
        orderBy: { id_client: "desc" },
        take: take + 1,
        ...(cursor ? { cursor: { id_client: cursor }, skip: 1 } : {}),
      });

      const hasMore = items.length > take;
      const sliced = hasMore ? items.slice(0, take) : items;
      const nextCursor = hasMore ? sliced[sliced.length - 1].id_client : null;

      return res.status(200).json({ items: sliced, nextCursor });
    } catch (e) {
      console.error("[clients][GET]", e);
      return res.status(500).json({ error: "Error al obtener pasajeros" });
    }
  }

  // ===== POST: crear =====
  if (req.method === "POST") {
    try {
      const c = req.body ?? {};

      // Validaciones requeridas
      for (const f of [
        "first_name",
        "last_name",
        "phone",
        "birth_date",
        "nationality",
        "gender",
      ]) {
        if (!c[f]) {
          return res
            .status(400)
            .json({ error: `El campo ${f} es obligatorio.` });
        }
      }

      const first_name = String(c.first_name ?? "").trim();
      const last_name = String(c.last_name ?? "").trim();
      const dni = String(c.dni_number ?? "").trim();
      const pass = String(c.passport_number ?? "").trim();

      if (!dni && !pass) {
        return res.status(400).json({
          error:
            "El DNI y el Pasaporte son obligatorios. Debes cargar al menos uno",
        });
      }

      const birth = toLocalDate(c.birth_date);
      if (!birth) {
        return res.status(400).json({ error: "Fecha de nacimiento inválida" });
      }

      // Quién puede asignar a otro usuario
      const canAssignOthers = [
        "gerente",
        "administrativo",
        "desarrollador",
        "lider",
      ].includes(role);
      let usedUserId: number = auth.id_user;

      if (
        canAssignOthers &&
        typeof c.id_user === "number" &&
        Number.isFinite(c.id_user)
      ) {
        usedUserId = Number(c.id_user);
        // Si es líder y asigna a otro, debe estar en su alcance
        if (role === "lider" && usedUserId !== auth.id_user) {
          const scope = await getLeaderScope(auth.id_user, auth.id_agency);
          if (!scope.userIds.includes(usedUserId)) {
            return res
              .status(403)
              .json({ error: "No podés asignar fuera de tu equipo." });
          }
        }
      }

      // Duplicados (en el scope de la agencia)
      const duplicate = await prisma.client.findFirst({
        where: {
          id_agency: auth.id_agency,
          OR: [
            ...(dni ? [{ dni_number: dni }] : []),
            ...(pass ? [{ passport_number: pass }] : []),
            ...(c.tax_id ? [{ tax_id: String(c.tax_id).trim() }] : []),
            { first_name, last_name, birth_date: birth },
          ],
        },
      });
      if (duplicate) {
        return res
          .status(409)
          .json({ error: "Esa información ya pertenece a un pax." });
      }

      const created = await prisma.$transaction(async (tx) => {
        const agencyClientId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "client",
        );

        return tx.client.create({
          data: {
            agency_client_id: agencyClientId,
            first_name,
            last_name,
            phone: c.phone,
            address: c.address || null,
            postal_code: c.postal_code || null,
            locality: c.locality || null,
            company_name: c.company_name || null,
            tax_id: c.tax_id ? String(c.tax_id).trim() : null,
            commercial_address: c.commercial_address || null,
            dni_number: dni || null,
            passport_number: pass || null,
            birth_date: birth,
            nationality: c.nationality,
            gender: c.gender,
            email: String(c.email ?? "").trim() || null,
            id_user: usedUserId,
            id_agency: auth.id_agency, // SIEMPRE desde el token
          },
          include: { user: { select: userSelectSafe } },
        });
      });

      return res.status(201).json(created);
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e) {
        const err = e as { code?: string };
        if (err.code === "P2002") {
          return res.status(409).json({ error: "Datos duplicados detectados" });
        }
      }
      console.error("[clients][POST]", e);
      return res.status(500).json({ error: "Error al crear pax" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
