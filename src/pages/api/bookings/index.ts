// src/pages/api/bookings/index.ts  (PARTE 1/2 - GET instrumentado)
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";

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
  invoice_observation: string;
  observation?: string;
  titular_id: number;
  id_agency: number;
  departure_date: string;
  return_date: string;
  pax_count: number;
  clients_ids: number[];
  id_user?: number;
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

type ReqWithRid = NextApiRequest & { _rid?: string };

const JWT_SECRET = process.env.JWT_SECRET || "changeme";

// --- Helpers --------------------------------------------------------------

function rid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Intenta extraer el token de Authorization o de cookies comunes */
function getTokenFromRequest(req: NextApiRequest): string | null {
  const id = (req as ReqWithRid)._rid || rid();
  (req as ReqWithRid)._rid = id;

  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }

  // Fallback a cookies (según tu flujo de login/session)
  const c = req.cookies || {};
  const cookieCandidates = [
    "token",
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token", // por si alguna vez usaste next-auth
  ];
  for (const k of cookieCandidates) {
    if (c[k]) {
      return c[k];
    }
  }
  return null;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedUser | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return null;
    }

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );

    // 🔧 Mapear nombres alternativos del payload (tu sesión usa userId, no id_user)
    const rawIdUser =
      (payload as TokenPayload).id_user ??
      (payload as TokenPayload).userId ??
      (payload as TokenPayload).uid;
    const rawAgencyId =
      (payload as TokenPayload).id_agency ??
      (payload as TokenPayload).agencyId ??
      (payload as TokenPayload).aid;

    const id_user = rawIdUser != null ? Number(rawIdUser) : undefined;
    const role = (payload as TokenPayload).role as string | undefined;
    const id_agency = rawAgencyId != null ? Number(rawAgencyId) : undefined;
    const email = (payload as TokenPayload).email as string | undefined;

    // 🔎 Si NO tenemos id_user pero sí email, lo buscamos por email
    if (!id_user && email) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        return {
          id_user: user.id_user,
          role: user.role,
          id_agency: user.id_agency,
          email: user.email,
        };
      }
    }

    // 🔎 Si tenemos id_user pero NO id_agency, completar desde DB
    if (id_user && !id_agency) {
      const user = await prisma.user.findUnique({
        where: { id_user },
        select: { id_user: true, role: true, id_agency: true, email: true },
      });
      if (user) {
        return {
          id_user: user.id_user,
          role: role ?? user.role,
          id_agency: user.id_agency,
          email: email ?? user.email ?? undefined,
        };
      }
    }

    return { id_user, role, id_agency, email };
  } catch (e) {
    console.warn("[auth] error verificando JWT:", e);
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

  // Si viene "YYYY-MM-DD" lo parseamos como LOCAL (no UTC)
  const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    return new Date(y, m - 1, d, 0, 0, 0, 0); // <- local midnight
  }

  // fallback para otros formatos
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// ⬇️ helper: devuelve equipos donde el líder lidera y todos los id_user alcanzables
async function getLeaderScope(authUserId: number, authAgencyId?: number) {
  const teams = await prisma.salesTeam.findMany({
    where: {
      ...(authAgencyId ? { id_agency: authAgencyId } : {}),
      user_teams: {
        some: {
          user: { id_user: authUserId, role: "lider" },
        },
      },
    },
    include: { user_teams: { select: { id_user: true } } },
  });

  const teamIds = teams.map((t) => t.id_team);
  const userIds = new Set<number>([authUserId]); // incluirse a sí mismo
  teams.forEach((t) => t.user_teams.forEach((ut) => userIds.add(ut.id_user)));

  return { teamIds, userIds: Array.from(userIds) };
}

// --- GET: list/paginate ---------------------------------------------------
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const id = (req as ReqWithRid)._rid || rid();
  (req as ReqWithRid)._rid = id;

  try {
    // Pagination
    const takeParam = Number(
      Array.isArray(req.query.take)
        ? req.query.take[0]
        : (req.query.take ?? 20),
    );
    const take = Math.min(Math.max(takeParam || 20, 1), 100);
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;

    // Filters (crudos del query)
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

    // Auth scope
    const authUser = await getUserFromAuth(req);
    const role = (authUser?.role || "").toString().toLowerCase();
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;

    if (!authUserId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    // where base
    const where: Prisma.BookingWhereInput = {};

    // Búsqueda server-side
    const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
    if (q && q.length > 0) {
      const or: Prisma.BookingWhereInput[] = [];
      const qNum = Number(q);
      if (!isNaN(qNum)) {
        or.push({ id_booking: qNum });
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
      const prevAnd = Array.isArray(where.AND)
        ? where.AND
        : where.AND
          ? [where.AND]
          : [];
      where.AND = [...prevAnd, { OR: or }];
    }

    // Scope por agencia
    if (authAgencyId) {
      where.id_agency = authAgencyId;
    }

    // =====================  BLOQUE DE “LEADER LOCK-DOWN”  =====================
    // Siempre calcular alcance del líder (ids de equipos e ids de usuarios) si corresponde
    let leaderTeamIds: number[] = [];
    let leaderUserIds: number[] = [];
    const isLeader = role === "lider";

    if (isLeader) {
      const scope = await getLeaderScope(authUserId, authAgencyId);
      leaderTeamIds = scope.teamIds;
      leaderUserIds = scope.userIds;

      // Si vino userId explícito, validar que esté en su alcance
      if (userId && !leaderUserIds.includes(userId)) {
        return res
          .status(403)
          .json({ error: "No autorizado: usuario fuera de tu equipo." });
      }

      // Si vino teamId explícito, validar que sea un equipo donde este usuario es líder
      if (teamId > 0 && !leaderTeamIds.includes(teamId)) {
        return res
          .status(403)
          .json({ error: "No autorizado: equipo fuera de tu alcance." });
      }

      // Para líderes **no** permitimos “sin equipo” (-1) por seguridad
      if (teamId === -1) {
        return res.status(403).json({
          error:
            "No autorizado: filtro de 'sin equipo' no disponible para líderes.",
        });
      }
    }
    // ========================================================================

    // --- Enforce vendedor: no puede ver a otros ni usar teamId ---
    if (role === "vendedor") {
      // Si pidió userId distinto, bloquear
      if (userId && userId !== authUserId) {
        return res.status(403).json({ error: "No autorizado." });
      }
      // Si intenta filtrar por cualquier teamId, bloquear
      if (teamId !== 0) {
        return res.status(403).json({ error: "No autorizado." });
      }
      // Fuerza su propio alcance siempre
      where.id_user = authUserId!;
    }

    // Filtro por userId (si llegó y es válido para el rol)
    if (userId && userId > 0) {
      where.id_user = userId;
    }

    // Team filter server-side (solo si NO vino userId explícito)
    if (!userId && teamId !== 0) {
      if (teamId > 0) {
        const team = await prisma.salesTeam.findUnique({
          where: { id_team: teamId },
          include: { user_teams: { select: { id_user: true } } },
        });
        if (!team || (authAgencyId && team.id_agency !== authAgencyId)) {
          return res
            .status(403)
            .json({ error: "Equipo inválido para esta agencia." });
        }
        // Si es líder, ya validamos que el team le pertenezca; usamos sus ids
        const ids = team.user_teams.map((ut) => ut.id_user);
        where.id_user = { in: ids.length ? ids : [-1] };
      } else if (teamId === -1) {
        // Solo perfiles no-líder pueden pedir “sin equipo”
        const users = await prisma.user.findMany({
          where: {
            ...(authAgencyId ? { id_agency: authAgencyId } : {}),
            sales_teams: { none: {} },
          },
          select: { id_user: true },
        });
        const unassignedIds = users.map((u) => u.id_user);
        where.id_user = { in: unassignedIds.length ? unassignedIds : [-1] };
      }
    }

    // Hardening por rol cuando NO hay userId/TeamId concretos:
    if (!where.id_user) {
      if (!where.id_user) {
        if (isLeader) {
          where.id_user = {
            in: leaderUserIds.length ? leaderUserIds : [authUserId!],
          };
        }
        // gerente/administrativo/desarrollador → sin restricción extra
      } else if (isLeader) {
        where.id_user = {
          in: leaderUserIds.length ? leaderUserIds : [authUserId],
        };
      }
      // gerente/administrativo/desarrollador → sin restricción extra
    }

    // Otros filtros
    if (status && status !== "Todas") {
      where.status = status;
    }
    if (clientStatusArr?.length && !clientStatusArr.includes("Todas")) {
      where.clientStatus = { in: clientStatusArr };
    }
    if (operatorStatusArr?.length && !operatorStatusArr.includes("Todas")) {
      where.operatorStatus = { in: operatorStatusArr };
    }

    // Fechas creación
    if (creationFrom) creationFrom = startOfDay(creationFrom);
    if (creationTo) creationTo = endOfDay(creationTo);
    if (creationFrom || creationTo) {
      where.creation_date = {
        ...(creationFrom ? { gte: creationFrom } : {}),
        ...(creationTo ? { lte: creationTo } : {}),
      };
    }

    // Overlap de viaje
    if (travelFrom || travelTo) {
      const travelCond: Prisma.BookingWhereInput = {};
      if (travelTo) travelCond.departure_date = { lte: travelTo };
      if (travelFrom) travelCond.return_date = { gte: travelFrom };
      if (Object.keys(travelCond).length > 0) {
        const prevAnd = Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : [];
        where.AND = [...prevAnd, travelCond];
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.dir(where, { depth: null });
    }

    // Query
    const items = await prisma.booking.findMany({
      where,
      include: {
        titular: true,
        user: true,
        agency: true,
        clients: true,
        services: { include: { operator: true } },
        invoices: true,
        Receipt: true,
      },
      orderBy: { id_booking: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id_booking: cursor }, skip: 1 } : {}),
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
      const totalReceipts = b.Receipt.reduce((sum, r) => sum + r.amount, 0);
      const debt = totalSale - totalReceipts;
      return { ...b, totalSale, totalCommission, debt };
    });

    return res.status(200).json({ items: enhanced, nextCursor });
  } catch (error) {
    console.error(`[bookings][GET] Error fetching bookings:`, error);
    return res.status(500).json({ error: "Error fetching bookings" });
  }
}

// --- POST: create ---------------------------------------------------------

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
    id_agency,
    departure_date,
    return_date,
    pax_count,
    clients_ids,
    id_user,
  } = body;

  // Validaciones
  if (
    !clientStatus ||
    !operatorStatus ||
    !status ||
    !details ||
    !invoice_type ||
    !invoice_observation ||
    !titular_id ||
    !id_agency ||
    !departure_date ||
    !return_date
  ) {
    console.warn("❌ Campos obligatorios faltantes");
    return res
      .status(400)
      .json({ error: "Todos los campos obligatorios deben ser completados" });
  }

  // Parseo de fechas
  const parsedDeparture = toLocalDate(departure_date);
  const parsedReturn = toLocalDate(return_date);

  if (!parsedDeparture || !parsedReturn) {
    console.warn("❌ Fechas inválidas");
    return res.status(400).json({ error: "Fechas inválidas." });
  }

  // Validar acompañantes
  const companions: number[] = Array.isArray(clients_ids)
    ? clients_ids.map(Number)
    : [];

  // Autenticación y rol
  const authUser = await getUserFromAuth(req);

  const roleFromCookie = (req.cookies?.role || "").toLowerCase();
  const role = (authUser?.role || roleFromCookie || "").toLowerCase();
  const authUserId = authUser?.id_user;

  const canAssignOthers = [
    "gerente",
    "administrativo",
    "desarrollador",
    "lider",
  ].includes(role);

  let usedUserId: number | undefined;
  if (canAssignOthers && typeof id_user === "number") {
    usedUserId = id_user;
  } else {
    usedUserId =
      Number(authUserId) ||
      (role === "vendedor" && typeof id_user === "number"
        ? id_user
        : undefined);
  }

  if (!usedUserId) {
    console.warn("❌ Usuario no autenticado o token inválido");
    return res.status(401).json({ error: "No autenticado o token inválido." });
  }

  try {
    const booking = await prisma.booking.create({
      data: {
        clientStatus,
        operatorStatus,
        status,
        details,
        invoice_type,
        invoice_observation,
        observation,
        departure_date: parsedDeparture,
        return_date: parsedReturn,
        pax_count: Number(pax_count),
        titular: { connect: { id_client: Number(titular_id) } },
        user: { connect: { id_user: usedUserId } },
        agency: { connect: { id_agency: Number(id_agency) } },
        clients: {
          connect: companions.map((id) => ({ id_client: id })),
        },
      },
      include: {
        titular: true,
        user: true,
        agency: true,
        clients: true,
      },
    });

    return res.status(201).json(booking);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("💥 Error creando la reserva:", message);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(400).json({ error: "Datos duplicados detectados" });
    }
    return res.status(500).json({ error: "Error creando la reserva" });
  }
}

// --- Router ---------------------------------------------------------------
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);

  console.warn(`⚠ Método ${req.method} no permitido`);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
