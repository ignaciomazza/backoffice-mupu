// src/pages/api/investments/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

/* ========= JWT SECRET (igual en todos) ========= */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

/* ========= Tipos ========= */
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
  id_user?: number;
  id_agency?: number;
  role?: string;
  email?: string;
};

/* ========= Helpers de auth (cookie primero) ========= */
function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token; // 1) cookie (prod)
  const a = req.headers.authorization || ""; // 2) Authorization
  if (a.startsWith("Bearer ")) return a.slice(7);
  // 3) otras cookies posibles
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

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedAuth | null> {
  try {
    const tok = getTokenFromRequest(req);
    if (!tok) return null;

    const { payload } = await jwtVerify(
      tok,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = p.role;
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

/* ========= Utils ========= */
function toLocalDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m)
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}
const safeNumber = (v: unknown) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : undefined;
};
// Decimal opcional
const toDec = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? undefined
    : new Prisma.Decimal(typeof v === "number" ? v : String(v));

/* ========= GET ========= */
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency)
    return res.status(401).json({ error: "No autenticado" });

  try {
    const take = Math.min(Math.max(safeNumber(req.query.take) || 24, 1), 100);
    const cursor = safeNumber(req.query.cursor);

    const categoryParam =
      typeof req.query.category === "string" ? req.query.category.trim() : "";
    const currencyParam =
      typeof req.query.currency === "string" ? req.query.currency.trim() : "";
    const operatorId = safeNumber(req.query.operatorId);
    const userId = safeNumber(req.query.userId);
    const bookingId = safeNumber(req.query.bookingId);

    const createdFrom = toLocalDate(
      Array.isArray(req.query.createdFrom)
        ? req.query.createdFrom[0]
        : (req.query.createdFrom as string),
    );
    const createdTo = toLocalDate(
      Array.isArray(req.query.createdTo)
        ? req.query.createdTo[0]
        : (req.query.createdTo as string),
    );
    const paidFrom = toLocalDate(
      Array.isArray(req.query.paidFrom)
        ? req.query.paidFrom[0]
        : (req.query.paidFrom as string),
    );
    const paidTo = toLocalDate(
      Array.isArray(req.query.paidTo)
        ? req.query.paidTo[0]
        : (req.query.paidTo as string),
    );

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const where: Prisma.InvestmentWhereInput = {
      id_agency: auth.id_agency,
      ...(categoryParam
        ? { category: { equals: categoryParam, mode: "insensitive" } }
        : {}), // case-insensitive
      ...(currencyParam
        ? { currency: { equals: currencyParam, mode: "insensitive" } }
        : {}),
      ...(operatorId ? { operator_id: operatorId } : {}),
      ...(userId ? { user_id: userId } : {}),
      ...(bookingId ? { booking_id: bookingId } : {}),
    };

    if (createdFrom || createdTo) {
      where.created_at = {
        ...(createdFrom
          ? {
              gte: new Date(
                createdFrom.getFullYear(),
                createdFrom.getMonth(),
                createdFrom.getDate(),
                0,
                0,
                0,
                0,
              ),
            }
          : {}),
        ...(createdTo
          ? {
              lte: new Date(
                createdTo.getFullYear(),
                createdTo.getMonth(),
                createdTo.getDate(),
                23,
                59,
                59,
                999,
              ),
            }
          : {}),
      };
    }
    if (paidFrom || paidTo) {
      where.paid_at = {
        ...(paidFrom
          ? {
              gte: new Date(
                paidFrom.getFullYear(),
                paidFrom.getMonth(),
                paidFrom.getDate(),
                0,
                0,
                0,
                0,
              ),
            }
          : {}),
        ...(paidTo
          ? {
              lte: new Date(
                paidTo.getFullYear(),
                paidTo.getMonth(),
                paidTo.getDate(),
                23,
                59,
                59,
                999,
              ),
            }
          : {}),
      };
    }

    if (q) {
      const prev = Array.isArray(where.AND)
        ? where.AND
        : where.AND
          ? [where.AND]
          : [];
      const qNum = Number(q);
      const isNum = Number.isFinite(qNum);
      const or: Prisma.InvestmentWhereInput[] = [
        ...(isNum ? [{ id_investment: qNum }] : []),
        ...(isNum ? [{ booking_id: qNum }] : []),
        { description: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { currency: { contains: q, mode: "insensitive" } },
        {
          user: {
            OR: [
              { first_name: { contains: q, mode: "insensitive" } },
              { last_name: { contains: q, mode: "insensitive" } },
            ],
          },
        },
        { operator: { is: { name: { contains: q, mode: "insensitive" } } } },
      ];
      where.AND = [...prev, { OR: or }];
    }

    const items = await prisma.investment.findMany({
      where,
      include: {
        user: true,
        operator: true,
        createdBy: {
          select: { id_user: true, first_name: true, last_name: true },
        },
        booking: { select: { id_booking: true } },
      },
      orderBy: { id_investment: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id_investment: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > take;
    const sliced = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id_investment : null;

    return res.status(200).json({ items: sliced, nextCursor });
  } catch (e) {
    console.error("[investments][GET]", e);
    return res
      .status(500)
      .json({ error: "Error al obtener inversiones/gastos" });
  }
}

/* ========= POST ========= */
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency)
    return res.status(401).json({ error: "No autenticado" });

  try {
    const b = req.body ?? {};
    const category = String(b.category ?? "").trim();
    const description = String(b.description ?? "").trim();
    const currency = String(b.currency ?? "").trim();
    const amount = Number(b.amount);
    if (!category || !description || !currency || !Number.isFinite(amount)) {
      return res.status(400).json({
        error: "category, description, currency y amount son obligatorios",
      });
    }

    const paid_at = b.paid_at ? toLocalDate(b.paid_at) : undefined;
    const operator_id = Number.isFinite(Number(b.operator_id))
      ? Number(b.operator_id)
      : undefined;
    const user_id = Number.isFinite(Number(b.user_id))
      ? Number(b.user_id)
      : undefined;
    const booking_id = Number.isFinite(Number(b.booking_id))
      ? Number(b.booking_id)
      : undefined;

    const payment_method =
      typeof b.payment_method === "string"
        ? b.payment_method.trim()
        : undefined;
    const account =
      typeof b.account === "string" ? b.account.trim() : undefined;

    const base_amount = toDec(b.base_amount);
    const base_currency =
      typeof b.base_currency === "string" && b.base_currency
        ? b.base_currency.toUpperCase()
        : undefined;
    const counter_amount = toDec(b.counter_amount);
    const counter_currency =
      typeof b.counter_currency === "string" && b.counter_currency
        ? b.counter_currency.toUpperCase()
        : undefined;

    if (category.toLowerCase() === "operador" && !operator_id) {
      return res
        .status(400)
        .json({ error: "Para categoría Operador, operator_id es obligatorio" });
    }
    if (["sueldo", "comision"].includes(category.toLowerCase()) && !user_id) {
      return res
        .status(400)
        .json({ error: "Para Sueldo/Comision, user_id es obligatorio" });
    }

    // validar booking (si viene) y pertenencia a la agencia
    let bookingIdToSave: number | null = null;
    if (typeof booking_id === "number") {
      const bkg = await prisma.booking.findFirst({
        where: { id_booking: booking_id, id_agency: auth.id_agency },
        select: { id_booking: true },
      });
      if (!bkg)
        return res
          .status(400)
          .json({ error: "La reserva no existe o no pertenece a tu agencia" });
      bookingIdToSave = bkg.id_booking;
    }

    const created = await prisma.investment.create({
      data: {
        id_agency: auth.id_agency,
        category,
        description,
        amount,
        currency,
        paid_at: paid_at ?? null,
        operator_id: operator_id ?? null,
        user_id: user_id ?? null,
        created_by: auth.id_user!,
        booking_id: bookingIdToSave,
        ...(payment_method ? { payment_method } : {}),
        ...(account ? { account } : {}),
        ...(base_amount ? { base_amount } : {}),
        ...(base_currency ? { base_currency } : {}),
        ...(counter_amount ? { counter_amount } : {}),
        ...(counter_currency ? { counter_currency } : {}),
      },
      include: {
        user: true,
        operator: true,
        createdBy: true,
        booking: { select: { id_booking: true } },
      },
    });

    return res.status(201).json(created);
  } catch (e) {
    console.error("[investments][POST]", e);
    return res.status(500).json({ error: "Error al crear gasto" });
  }
}

/* ========= Router ========= */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
