// src/pages/api/bookings/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { encodePublicId } from "@/lib/publicIds";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";

// ============ Tipos ============
type DecodedUser = {
  id_user?: number;
  role?: string;
  id_agency?: number;
  email?: string;
};

type BookingCreateBody = {
  clientStatus: string;
  operatorStatus: string;
  status: string;
  details: string;
  invoice_type: string;
  invoice_observation?: string;
  observation?: string;
  titular_id: number;
  // id_agency: number;  // <- ignorado en backend, se usa el del token
  departure_date: string;
  return_date: string;
  pax_count: number;
  clients_ids: number[];
  id_user?: number; // opcional: admins/líder pueden asignar creador
  creation_date?: string; // opcional: SOLO admin/gerente/dev pueden fijar
};

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

// ============ JWT SECRET (sin defaults, igual en todos los endpoints) ============
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

// ============ Helpers comunes ============
function getTokenFromRequest(req: NextApiRequest): string | null {
  // 1) cookie "token" (más robusto en prod)
  if (req.cookies?.token) return req.cookies.token;

  // 2) Authorization: Bearer
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);

  // 3) otros posibles nombres de cookie
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
): Promise<DecodedUser | null> {
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
    const role = (p.role || "") as string | undefined;
    const email = p.email;

    // completar por email si falta id_user
    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role,
          email: u.email,
        };
    }

    // completar agency si falta
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user,
          id_agency: u.id_agency,
          role: role ?? u.role,
          email: email ?? u.email ?? undefined,
        };
    }

    return { id_user, id_agency, role, email };
  } catch {
    return null;
  }
}

function parseCSV(v?: string | string[]) {
  if (!v) return undefined;
  return (Array.isArray(v) ? v.join(",") : v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toLocalDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd)
    return new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      0,
      0,
      0,
      0,
    );
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// equipos que lidera + ids de usuarios alcanzables
async function getLeaderScope(authUserId: number, authAgencyId?: number) {
  const teams = await prisma.salesTeam.findMany({
    where: {
      ...(authAgencyId ? { id_agency: authAgencyId } : {}),
      user_teams: { some: { user: { id_user: authUserId, role: "lider" } } },
    },
    include: { user_teams: { select: { id_user: true } } },
  });
  const teamIds = teams.map((t) => t.id_team);
  const userIds = new Set<number>([authUserId]);
  teams.forEach((t) => t.user_teams.forEach((ut) => userIds.add(ut.id_user)));
  return { teamIds, userIds: Array.from(userIds) };
}

// ============ GET ============
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    // paginación
    const takeParam = Number(
      Array.isArray(req.query.take)
        ? req.query.take[0]
        : (req.query.take ?? 20),
    );
    const take = Math.min(Math.max(takeParam || 20, 1), 100);
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;

    // filtros
    const userId = Array.isArray(req.query.userId)
      ? Number(req.query.userId[0])
      : req.query.userId
        ? Number(req.query.userId)
        : undefined;
    const status = Array.isArray(req.query.status)
      ? (req.query.status[0] as string)
      : (req.query.status as string) || undefined;
    const clientStatusArr = parseCSV(req.query.clientStatus);
    const operatorStatusArr = parseCSV(req.query.operatorStatus);

    let creationFrom = toLocalDate(req.query.creationFrom);
    let creationTo = toLocalDate(req.query.creationTo);
    const travelFrom = toLocalDate(req.query.from);
    const travelTo = toLocalDate(req.query.to);

    const teamId = Array.isArray(req.query.teamId)
      ? Number(req.query.teamId[0])
      : req.query.teamId
        ? Number(req.query.teamId)
        : 0;

    // auth
    const authUser = await getUserFromAuth(req);
    const role = (authUser?.role || "").toString().toLowerCase();
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;

    if (!authUserId || !authAgencyId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    // where base
    const where: Prisma.BookingWhereInput = { id_agency: authAgencyId };

    // búsqueda simple
    const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
    if (q && q.length > 0) {
      const or: Prisma.BookingWhereInput[] = [];
      const qNum = Number(q);
      if (!isNaN(qNum)) {
        or.push({ id_booking: qNum });
        or.push({ agency_booking_id: qNum });
        or.push({ titular: { id_client: qNum } });
        or.push({ clients: { some: { id_client: qNum } } });
      }
      or.push({ details: { contains: q, mode: "insensitive" } });
      or.push({
        titular: { first_name: { contains: q, mode: "insensitive" } },
      });
      or.push({ titular: { last_name: { contains: q, mode: "insensitive" } } });
      or.push({
        clients: { some: { first_name: { contains: q, mode: "insensitive" } } },
      });
      or.push({
        clients: { some: { last_name: { contains: q, mode: "insensitive" } } },
      });
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        { OR: or },
      ];
    }

    // leader lockdown
    let leaderTeamIds: number[] = [];
    let leaderUserIds: number[] = [];
    const isLeader = role === "lider";

    if (isLeader) {
      const scope = await getLeaderScope(authUserId, authAgencyId);
      leaderTeamIds = scope.teamIds;
      leaderUserIds = scope.userIds;

      if (userId && !leaderUserIds.includes(userId)) {
        return res
          .status(403)
          .json({ error: "No autorizado: usuario fuera de tu equipo." });
      }
      if (teamId > 0 && !leaderTeamIds.includes(teamId)) {
        return res
          .status(403)
          .json({ error: "No autorizado: equipo fuera de tu alcance." });
      }
      if (teamId === -1) {
        return res.status(403).json({
          error: "No autorizado: 'sin equipo' no disponible para líderes.",
        });
      }
    }

    // vendedor: alcance propio, sin teamId
    if (role === "vendedor") {
      if (userId && userId !== authUserId)
        return res.status(403).json({ error: "No autorizado." });
      if (teamId !== 0)
        return res.status(403).json({ error: "No autorizado." });
      where.id_user = authUserId!;
    }

    // userId explícito
    if (userId && userId > 0 && role !== "vendedor") {
      where.id_user = userId;
    }

    // teamId (si NO vino userId)
    if (!userId && teamId !== 0 && role !== "vendedor") {
      if (teamId > 0) {
        const team = await prisma.salesTeam.findUnique({
          where: { id_team: teamId },
          include: { user_teams: { select: { id_user: true } } },
        });
        if (!team || team.id_agency !== authAgencyId) {
          return res
            .status(403)
            .json({ error: "Equipo inválido para esta agencia." });
        }
        const ids = team.user_teams.map((ut) => ut.id_user);
        where.id_user = { in: ids.length ? ids : [-1] };
      } else if (teamId === -1) {
        const users = await prisma.user.findMany({
          where: { id_agency: authAgencyId, sales_teams: { none: {} } },
          select: { id_user: true },
        });
        const unassignedIds = users.map((u) => u.id_user);
        where.id_user = { in: unassignedIds.length ? unassignedIds : [-1] };
      }
    }

    // hardening cuando no hay userId ni teamId
    if (!where.id_user && isLeader) {
      where.id_user = {
        in: leaderUserIds.length ? leaderUserIds : [authUserId],
      };
    }

    // otros filtros
    if (status && status !== "Todas") where.status = status;
    if (clientStatusArr?.length && !clientStatusArr.includes("Todas"))
      where.clientStatus = { in: clientStatusArr };
    if (operatorStatusArr?.length && !operatorStatusArr.includes("Todas"))
      where.operatorStatus = { in: operatorStatusArr };

    // fechas de creación
    if (creationFrom) creationFrom = startOfDay(creationFrom);
    if (creationTo) creationTo = endOfDay(creationTo);
    if (creationFrom || creationTo) {
      where.creation_date = {
        ...(creationFrom ? { gte: creationFrom } : {}),
        ...(creationTo ? { lte: creationTo } : {}),
      };
    }

    // overlap de viaje
    if (travelFrom || travelTo) {
      const travelCond: Prisma.BookingWhereInput = {};
      if (travelTo) travelCond.departure_date = { lte: travelTo };
      if (travelFrom) travelCond.return_date = { gte: travelFrom };
      if (Object.keys(travelCond).length > 0) {
        where.AND = [
          ...(Array.isArray(where.AND)
            ? where.AND
            : where.AND
              ? [where.AND]
              : []),
          travelCond,
        ];
      }
    }

    // ======= ORDEN Y KEYSET PAGINATION POR creation_date + id_booking =======
    // Más nuevas primero. Si querés más viejas primero, cambiar a "asc"
    const orderBy: Prisma.BookingOrderByWithRelationInput[] = [
      { creation_date: "desc" },
      { id_booking: "desc" },
    ];

    // Si llega cursor (id_booking), buscamos su creation_date para construir el keyset
    let keysetWhere: Prisma.BookingWhereInput | undefined = undefined;
    if (cursor) {
      const anchor = await prisma.booking.findUnique({
        where: { id_booking: Number(cursor) },
        select: { creation_date: true },
      });
      if (anchor) {
        // Para orden DESC: traer estrictamente "después" del anchor
        keysetWhere = {
          OR: [
            { creation_date: { lt: anchor.creation_date } },
            {
              AND: [
                { creation_date: anchor.creation_date },
                { id_booking: { lt: Number(cursor) } },
              ],
            },
          ],
        };
        // Si usás ASC: usá 'gt' y 'gt' en vez de 'lt'
      }
    }

    const baseAND = Array.isArray(where.AND)
      ? where.AND
      : where.AND
        ? [where.AND]
        : [];
    const finalWhere: Prisma.BookingWhereInput = keysetWhere
      ? { ...where, AND: [...baseAND, keysetWhere] }
      : where;

    const items = await prisma.booking.findMany({
      where: finalWhere,
      include: {
        titular: true,
        user: true,
        agency: true,
        clients: true,
        services: { include: { operator: true } },
        invoices: true,
        Receipt: true,
      },
      orderBy,
      take: take + 1,
    });

    const hasMore = items.length > take;
    const sliced = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id_booking : null;

    const enhanced = sliced.map((b) => {
      const totalSale = b.services.reduce((sum, s) => sum + s.sale_price, 0);
      const totalCommission = b.services.reduce(
        (sum, s) => sum + (s.totalCommissionWithoutVAT ?? 0),
        0,
      );
      const totalReceipts = b.Receipt.reduce((sum, r) => {
        const hasBase = r.base_amount != null && r.base_currency;
        const val = hasBase ? Number(r.base_amount) : r.amount;
        return sum + (Number.isFinite(val) ? val : 0);
      }, 0);
      const debt = totalSale - totalReceipts;
      const public_id =
        b.agency_booking_id != null
          ? encodePublicId({
              t: "booking",
              a: b.id_agency,
              i: b.agency_booking_id,
            })
          : null;
      return { ...b, totalSale, totalCommission, debt, public_id };
    });

    return res.status(200).json({ items: enhanced, nextCursor });
  } catch (error) {
    console.error(`[bookings][GET]`, error);
    return res.status(500).json({ error: "Error fetching bookings" });
  }
}

// ============ POST ============
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Partial<BookingCreateBody>;
  const {
    clientStatus,
    operatorStatus,
    status,
    details,
    invoice_type,
    invoice_observation,
    observation,
    titular_id,
    departure_date,
    return_date,
    // pax_count: _paxFromClient,  // ignoramos el valor entrante
    clients_ids,
    id_user,
    creation_date, // NUEVO
  } = body;

  // auth (siempre agencia y usuario del token/cookie)
  const authUser = await getUserFromAuth(req);
  const roleFromCookie = (req.cookies?.role || "").toLowerCase();
  const role = (authUser?.role || roleFromCookie || "").toLowerCase();
  const authUserId = authUser?.id_user;
  const authAgencyId = authUser?.id_agency;

  if (!authUserId || !authAgencyId) {
    return res.status(401).json({ error: "No autenticado o token inválido." });
  }

  // validaciones mínimas
    if (
      !clientStatus ||
      !operatorStatus ||
      !status ||
      !details ||
      !invoice_type ||
      !titular_id ||
      !departure_date ||
      !return_date
    ) {
    return res
      .status(400)
      .json({ error: "Todos los campos obligatorios deben ser completados" });
  }

  // fechas de viaje
  const parsedDeparture = toLocalDate(departure_date);
  const parsedReturn = toLocalDate(return_date);
  if (!parsedDeparture || !parsedReturn) {
    return res.status(400).json({ error: "Fechas inválidas." });
  }

  // acompañantes: solo >0, únicos y que no incluyan titular
  const companionsRaw: number[] = Array.isArray(clients_ids)
    ? clients_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const companions = Array.from(new Set(companionsRaw)).filter(
    (id) => id !== Number(titular_id),
  );

  // permisos para asignar creador
  const canAssignOthers = [
    "gerente",
    "administrativo",
    "desarrollador",
    "lider",
  ].includes(role);
  let usedUserId: number = authUserId;

  if (
    canAssignOthers &&
    typeof id_user === "number" &&
    Number.isFinite(id_user)
  ) {
    // si es líder y asigna a otro, validar que esté en su alcance
    if (role === "lider" && id_user !== authUserId) {
      const scope = await getLeaderScope(authUserId, authAgencyId);
      if (!scope.userIds.includes(id_user)) {
        return res
          .status(403)
          .json({ error: "No podés asignar fuera de tu equipo." });
      }
    }
    usedUserId = id_user;
  }

  // creación: vendedor => hoy; admin/gerente/dev pueden fijar; otros roles: se ignora
  const isVendor = role === "vendedor";
  const canEditCreationDate = [
    "gerente",
    "administrativo",
    "desarrollador",
  ].includes(role); // (NO líderes)
  let parsedCreationDate: Date | undefined = undefined;

  if (isVendor) {
    const now = new Date();
    parsedCreationDate = startOfDay(now);
  } else if (creation_date != null && creation_date !== "") {
    if (canEditCreationDate) {
      parsedCreationDate = toLocalDate(creation_date);
      if (!parsedCreationDate) {
        return res.status(400).json({ error: "creation_date inválida." });
      }
    }
    // si no tiene permiso y manda algo: se ignora en silencio
  }

  // titular y acompañantes deben ser de la misma agencia
  const titular = await prisma.client.findUnique({
    where: { id_client: Number(titular_id) },
    select: { id_agency: true },
  });
  if (!titular || titular.id_agency !== authAgencyId) {
    return res.status(400).json({ error: "Titular inválido para tu agencia." });
  }

  if (companions.length > 0) {
    const comp = await prisma.client.findMany({
      where: { id_client: { in: companions }, id_agency: authAgencyId },
      select: { id_client: true },
    });
    const okIds = new Set(comp.map((c) => c.id_client));
    const bad = companions.filter((id) => !okIds.has(id));
    if (bad.length) {
      return res.status(400).json({
        error: `Hay acompañantes que no pertenecen a tu agencia: ${bad.join(
          ", ",
        )}`,
      });
    }
  }

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const agencyBookingId = await getNextAgencyCounter(
        tx,
        authAgencyId,
        "booking",
      );

      return tx.booking.create({
        data: {
          agency_booking_id: agencyBookingId,
          clientStatus,
          operatorStatus,
          status,
          details,
          invoice_type,
          invoice_observation,
          observation,
          departure_date: parsedDeparture,
          return_date: parsedReturn,
          // pax_count siempre consistente con acompañantes reales
          pax_count: 1 + companions.length,
          ...(parsedCreationDate ? { creation_date: parsedCreationDate } : {}),
          titular: { connect: { id_client: Number(titular_id) } },
          user: { connect: { id_user: usedUserId } },
          agency: { connect: { id_agency: authAgencyId } }, // <- SIEMPRE del token
          clients: { connect: companions.map((id) => ({ id_client: id })) },
        },
        include: { titular: true, user: true, agency: true, clients: true },
      });
    });

    const public_id =
      booking.agency_booking_id != null
        ? encodePublicId({
            t: "booking",
            a: booking.id_agency,
            i: booking.agency_booking_id,
          })
        : null;
    return res.status(201).json({ ...booking, public_id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bookings][POST]", message);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(400).json({ error: "Datos duplicados detectados" });
    }
    return res.status(500).json({ error: "Error creando la reserva" });
  }
}

// ============ Router ============
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
