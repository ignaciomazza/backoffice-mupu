// src/pages/api/bookings/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { encodePublicId } from "@/lib/publicIds";
import {
  getBookingLeaderScope,
  getBookingTeamScope,
  resolveBookingVisibilityMode,
} from "@/lib/bookingVisibility";
import { normalizeRole } from "@/utils/permissions";
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
  simple_companions?: Array<{
    category_id?: number | null;
    age?: number | null;
    notes?: string | null;
  }>;
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

function appendWhereAnd(
  where: Prisma.BookingWhereInput,
  clause: Prisma.BookingWhereInput,
): Prisma.BookingWhereInput {
  const existingAnd = Array.isArray(where.AND)
    ? where.AND
    : where.AND
      ? [where.AND]
      : [];
  return {
    ...where,
    AND: [...existingAnd, clause],
  };
}

function getKnownErrorMetaString(
  error: Prisma.PrismaClientKnownRequestError,
  key: string,
): string {
  const meta = error.meta;
  if (!meta || typeof meta !== "object") return "";
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function isMissingBookingGroupColumnError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2022") return false;
  const column = getKnownErrorMetaString(error, "column").toLowerCase();
  return (
    column.includes("booking.travel_group_id") ||
    column.includes("booking.travel_group_departure_id")
  );
}

const BOOKING_SELECT_WITHOUT_GROUP_COLUMNS = {
  id_booking: true,
  agency_booking_id: true,
  clientStatus: true,
  operatorStatus: true,
  status: true,
  details: true,
  sale_totals: true,
  use_booking_sale_total_override: true,
  commission_overrides: true,
  invoice_type: true,
  invoice_observation: true,
  observation: true,
  creation_date: true,
  id_user: true,
  id_agency: true,
  titular_id: true,
  departure_date: true,
  return_date: true,
  pax_count: true,
  titular: true,
  user: true,
  agency: true,
  clients: true,
  simple_companions: { include: { category: true } },
  services: { include: { operator: true } },
  invoices: true,
  Receipt: true,
} satisfies Prisma.BookingSelect;

function buildBookingSelectWithoutGroupColumns(
  includeOperatorDues: boolean,
): Prisma.BookingSelect {
  return {
    ...BOOKING_SELECT_WITHOUT_GROUP_COLUMNS,
    ...(includeOperatorDues
      ? {
          OperatorDue: {
            select: {
              amount: true,
              currency: true,
              status: true,
            },
          },
        }
      : {}),
  };
}

type BookingListRow = {
  id_booking: number;
  agency_booking_id: number | null;
  id_agency: number;
  services: Array<{
    sale_price: number;
    totalCommissionWithoutVAT: number | null;
  }>;
  Receipt: Array<{
    amount: number;
    base_amount: Prisma.Decimal | number | null;
    base_currency: string | null;
  }>;
  [key: string]: unknown;
};

async function isSimpleCompanionsEnabled(id_agency: number) {
  const cfg = await prisma.clientConfig.findUnique({
    where: { id_agency },
    select: { use_simple_companions: true },
  });
  return Boolean(cfg?.use_simple_companions);
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
    const includeOperatorDuesRaw = Array.isArray(req.query.includeOperatorDues)
      ? req.query.includeOperatorDues[0]
      : req.query.includeOperatorDues;
    const includeOperatorDues =
      typeof includeOperatorDuesRaw === "string" &&
      ["1", "true", "yes", "si"].includes(
        includeOperatorDuesRaw.trim().toLowerCase(),
      );
    const includeGroupBookingsRaw = Array.isArray(
      req.query.includeGroupBookings,
    )
      ? req.query.includeGroupBookings[0]
      : req.query.includeGroupBookings;
    const includeGroupBookings =
      typeof includeGroupBookingsRaw === "string" &&
      ["1", "true", "yes", "si"].includes(
        includeGroupBookingsRaw.trim().toLowerCase(),
      );

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
    const role = normalizeRole(authUser?.role);
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

    const visibilityMode = await resolveBookingVisibilityMode({
      id_agency: authAgencyId,
      role,
    });
    const isLeader = role === "lider";

    if (visibilityMode === "own") {
      if (userId && userId > 0 && userId !== authUserId) {
        return res.status(403).json({ error: "No autorizado." });
      }
      if (teamId !== 0) {
        return res.status(403).json({ error: "No autorizado." });
      }
      where.id_user = authUserId;
    } else if (visibilityMode === "team") {
      const scope = isLeader
        ? await getBookingLeaderScope(authUserId, authAgencyId)
        : await getBookingTeamScope(authUserId, authAgencyId);
      const allowedUserIds = scope.userIds.length ? scope.userIds : [authUserId];
      const allowedTeamIds = new Set(scope.teamIds);

      if (userId && userId > 0) {
        if (!allowedUserIds.includes(userId)) {
          return res
            .status(403)
            .json({ error: "No autorizado: usuario fuera de tu alcance." });
        }
        where.id_user = userId;
      } else if (teamId !== 0) {
        if (teamId > 0) {
          if (!allowedTeamIds.has(teamId)) {
            return res
              .status(403)
              .json({ error: "No autorizado: equipo fuera de tu alcance." });
          }
          const ids = scope.membersByTeam[teamId] || [];
          where.id_user = { in: ids.length ? ids : [-1] };
        } else {
          return res.status(403).json({
            error: "No autorizado: filtro de equipo fuera de tu alcance.",
          });
        }
      } else {
        where.id_user = { in: allowedUserIds };
      }
    } else {
      // userId explícito
      if (userId && userId > 0) {
        where.id_user = userId;
      }

      // teamId (si NO vino userId)
      if (!userId && teamId !== 0) {
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
    const finalWhereBase: Prisma.BookingWhereInput = keysetWhere
      ? { ...where, AND: [...baseAND, keysetWhere] }
      : where;
    const finalWhere: Prisma.BookingWhereInput = includeGroupBookings
      ? finalWhereBase
      : appendWhereAnd(finalWhereBase, { travel_group_id: null });

    const include: Prisma.BookingInclude = {
      titular: true,
      user: true,
      agency: true,
      clients: true,
      simple_companions: { include: { category: true } },
      services: { include: { operator: true } },
      invoices: true,
      Receipt: true,
    };
    if (includeOperatorDues) {
      include.OperatorDue = {
        select: {
          amount: true,
          currency: true,
          status: true,
        },
      };
    }

    let rows: BookingListRow[];
    try {
      rows = (await prisma.booking.findMany({
        where: finalWhere,
        include,
        orderBy,
        take: take + 1,
      })) as BookingListRow[];
    } catch (error) {
      if (!isMissingBookingGroupColumnError(error)) {
        throw error;
      }

      console.warn(
        "[bookings][GET] Fallback por columnas de grupales no disponibles en Booking.",
      );
      rows = (await prisma.booking.findMany({
        // Esquemas legacy sin columna travel_group_id no permiten excluir
        // reservas de grupales desde SQL.
        where: finalWhereBase,
        select: buildBookingSelectWithoutGroupColumns(includeOperatorDues),
        orderBy,
        take: take + 1,
      })) as BookingListRow[];
    }

    const hasMore = rows.length > take;
    const sliced = hasMore ? rows.slice(0, take) : rows;
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
    simple_companions,
    id_user,
    creation_date, // NUEVO
  } = body;

  // auth (siempre agencia y usuario del token/cookie)
  const authUser = await getUserFromAuth(req);
  const roleFromCookie = normalizeRole(req.cookies?.role || "");
  const role = normalizeRole(authUser?.role || roleFromCookie || "");
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

  const simpleCompanionsRaw = Array.isArray(simple_companions)
    ? simple_companions
    : [];
  const simpleCompanions = simpleCompanionsRaw
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const rec = c as Record<string, unknown>;
      const category_id =
        rec.category_id == null ? null : Number(rec.category_id);
      const age = rec.age == null ? null : Number(rec.age);
      const notes =
        typeof rec.notes === "string" && rec.notes.trim()
          ? rec.notes.trim()
          : null;
      const safeCategory =
        category_id != null && Number.isFinite(category_id) && category_id > 0
          ? Math.floor(category_id)
          : null;
      const safeAge =
        age != null && Number.isFinite(age) && age >= 0
          ? Math.floor(age)
          : null;
      if (safeCategory == null && safeAge == null && !notes) return null;
      return {
        category_id: safeCategory,
        age: safeAge,
        notes,
      };
    })
    .filter(Boolean) as Array<{
    category_id: number | null;
    age: number | null;
    notes: string | null;
  }>;

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
      const scope = await getBookingLeaderScope(authUserId, authAgencyId);
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

  const allowSimpleCompanions = await isSimpleCompanionsEnabled(authAgencyId);
  const effectiveSimpleCompanions = allowSimpleCompanions
    ? simpleCompanions
    : [];

  if (effectiveSimpleCompanions.length > 0) {
    const categoryIds = Array.from(
      new Set(
        effectiveSimpleCompanions
          .map((c) => c.category_id)
          .filter((id): id is number => typeof id === "number"),
      ),
    );
    if (categoryIds.length > 0) {
      const cats = await prisma.passengerCategory.findMany({
        where: { id_category: { in: categoryIds }, id_agency: authAgencyId },
        select: { id_category: true },
      });
      const ok = new Set(cats.map((c) => c.id_category));
      const bad = categoryIds.filter((id) => !ok.has(id));
      if (bad.length) {
        return res.status(400).json({
          error: `Hay categorías inválidas para tu agencia: ${bad.join(", ")}`,
        });
      }
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
          // pax_count consistente con acompañantes reales + simples (si están habilitados)
          pax_count: 1 + companions.length + effectiveSimpleCompanions.length,
          ...(parsedCreationDate ? { creation_date: parsedCreationDate } : {}),
          titular: { connect: { id_client: Number(titular_id) } },
          user: { connect: { id_user: usedUserId } },
          agency: { connect: { id_agency: authAgencyId } }, // <- SIEMPRE del token
          clients: { connect: companions.map((id) => ({ id_client: id })) },
          ...(effectiveSimpleCompanions.length > 0
            ? {
                simple_companions: {
                  create: effectiveSimpleCompanions.map((c) => ({
                    category_id: c.category_id,
                    age: c.age,
                    notes: c.notes,
                  })),
                },
              }
            : {}),
        },
        include: {
          titular: true,
          user: true,
          agency: true,
          clients: true,
          simple_companions: { include: { category: true } },
        },
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
