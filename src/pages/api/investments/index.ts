// src/pages/api/investments/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";

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
  role: string;
  email?: string;
};

// ==== JWT Secret (unificado con otros endpoints) ====
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

// ==== helpers comunes (mismo patrón que clients) ====
function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;

  const a = req.headers.authorization || "";
  if (a.startsWith("Bearer ")) return a.slice(7);

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
    const role = String(p.role || "").toLowerCase();
    const email = p.email;

    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user,
          id_agency: u.id_agency,
          role: role || u.role.toLowerCase(),
          email: email ?? u.email ?? undefined,
        };
    }

    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true },
      });
      if (u)
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role.toLowerCase(),
          email,
        };
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

// ==== NUEVO: helper para Decimal opcional (igual que en receipts) ====
const toDec = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? undefined
    : new Prisma.Decimal(typeof v === "number" ? v : String(v));

const CREDIT_METHOD = "Crédito operador";

const normSoft = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

const DOC_SIGN: Record<string, number> = { investment: -1, receipt: 1 };
const normDoc = (s?: string | null) => (s || "").trim().toLowerCase();
const signForDocType = (dt?: string | null) => DOC_SIGN[normDoc(dt)] ?? 1;
const deltaDecimal = (amountAbs: number, dt?: string | null) =>
  new Prisma.Decimal(Math.abs(amountAbs)).mul(signForDocType(dt));

async function findOrCreateOperatorCreditAccount(
  tx: Prisma.TransactionClient,
  agencyId: number,
  operatorId: number,
  currency: string,
): Promise<number> {
  const existing = await tx.creditAccount.findFirst({
    where: {
      id_agency: agencyId,
      operator_id: operatorId,
      client_id: null,
      currency,
    },
    select: { id_credit_account: true },
  });
  if (existing) return existing.id_credit_account;

  const created = await tx.creditAccount.create({
    data: {
      id_agency: agencyId,
      operator_id: operatorId,
      client_id: null,
      currency,
      balance: new Prisma.Decimal(0),
      enabled: true,
    },
    select: { id_credit_account: true },
  });
  return created.id_credit_account;
}

async function createCreditEntryForInvestment(
  tx: Prisma.TransactionClient,
  agencyId: number,
  userId: number,
  inv: {
    id_investment: number;
    agency_investment_id?: number | null;
    operator_id: number;
    currency: string;
    amount: Prisma.Decimal | number;
    description: string | null;
    paid_at: Date | null;
  },
) {
  const account_id = await findOrCreateOperatorCreditAccount(
    tx,
    agencyId,
    inv.operator_id,
    inv.currency,
  );

  const rawAmount =
    typeof inv.amount === "number"
      ? inv.amount
      : (inv.amount as Prisma.Decimal).toNumber();

  const amountAbs = Math.abs(rawAmount);

  const displayId = inv.agency_investment_id ?? inv.id_investment;

  const entry = await tx.creditEntry.create({
    data: {
      id_agency: agencyId,
      account_id,
      created_by: userId,
      concept: inv.description || `Gasto Operador N° ${displayId}`,
      amount: new Prisma.Decimal(amountAbs),
      currency: inv.currency,
      doc_type: "investment",
      reference: `INV-${inv.id_investment}`,
      value_date: inv.paid_at,
      investment_id: inv.id_investment,
    },
    select: { id_entry: true },
  });

  const acc = await tx.creditAccount.findUnique({
    where: { id_credit_account: account_id },
    select: { balance: true },
  });
  if (acc) {
    const next = acc.balance.add(deltaDecimal(amountAbs, "investment"));
    await tx.creditAccount.update({
      where: { id_credit_account: account_id },
      data: { balance: next },
    });
  }

  return entry;
}

function shouldHaveCreditEntry(payload: {
  category?: string | null;
  operator_id?: number | null;
  payment_method?: string | null;
}) {
  return (
    normSoft(payload.category) === "operador" &&
    !!payload.operator_id &&
    (payload.payment_method || "") === CREDIT_METHOD
  );
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function clampDay(year: number, month: number, day: number) {
  const last = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), last);
}

function buildDueDate(year: number, month: number, day: number) {
  return new Date(year, month, clampDay(year, month, day), 0, 0, 0, 0);
}

function addMonthsToDue(date: Date, months: number, day: number) {
  const total = date.getMonth() + months;
  const year = date.getFullYear() + Math.floor(total / 12);
  const month = total % 12;
  return buildDueDate(year, month, day);
}

function computeFirstDue(
  startDate: Date,
  dayOfMonth: number,
  intervalMonths: number,
) {
  const base = startOfDay(startDate);
  let due = buildDueDate(base.getFullYear(), base.getMonth(), dayOfMonth);
  if (due < base) {
    due = addMonthsToDue(due, intervalMonths, dayOfMonth);
  }
  return due;
}

async function ensureRecurringInvestments(auth: DecodedAuth) {
  const rules = await prisma.recurringInvestment.findMany({
    where: { id_agency: auth.id_agency, active: true },
  });
  if (rules.length === 0) return;

  const today = startOfDay(new Date());
  const maxRuns = 36;

  for (const rule of rules) {
    const dayOfMonth = Number(rule.day_of_month);
    const intervalMonths = Math.max(Number(rule.interval_months) || 1, 1);
    if (dayOfMonth < 1 || dayOfMonth > 31 || intervalMonths < 1) continue;

    let nextDue = rule.last_run
      ? addMonthsToDue(rule.last_run, intervalMonths, dayOfMonth)
      : computeFirstDue(rule.start_date, dayOfMonth, intervalMonths);

    let processed: Date | null = null;
    let guard = 0;

    while (nextDue <= today && guard < maxRuns) {
      const exists = await prisma.investment.findFirst({
        where: {
          id_agency: auth.id_agency,
          recurring_id: rule.id_recurring,
          paid_at: nextDue,
        },
        select: { id_investment: true },
      });

      if (!exists) {
        await prisma.$transaction(async (tx) => {
          const agencyInvestmentId = await getNextAgencyCounter(
            tx,
            auth.id_agency,
            "investment",
          );
          const created = await tx.investment.create({
            data: {
              agency_investment_id: agencyInvestmentId,
              id_agency: auth.id_agency,
              recurring_id: rule.id_recurring,
              category: rule.category,
              description: rule.description,
              amount: rule.amount,
              currency: rule.currency,
              paid_at: nextDue,
              operator_id: rule.operator_id ?? null,
              user_id: rule.user_id ?? null,
              created_by: rule.created_by,
              ...(rule.payment_method ? { payment_method: rule.payment_method } : {}),
              ...(rule.account ? { account: rule.account } : {}),
              ...(rule.base_amount ? { base_amount: rule.base_amount } : {}),
              ...(rule.base_currency ? { base_currency: rule.base_currency } : {}),
              ...(rule.counter_amount
                ? { counter_amount: rule.counter_amount }
                : {}),
              ...(rule.counter_currency
                ? { counter_currency: rule.counter_currency }
                : {}),
            },
            select: {
              id_investment: true,
              agency_investment_id: true,
              operator_id: true,
              currency: true,
              amount: true,
              description: true,
              paid_at: true,
              payment_method: true,
              category: true,
            },
          });

          if (
            shouldHaveCreditEntry({
              category: created.category,
              operator_id: created.operator_id ?? undefined,
              payment_method: created.payment_method ?? undefined,
            })
          ) {
            if (created.operator_id) {
              await createCreditEntryForInvestment(
                tx,
                auth.id_agency,
                rule.created_by,
                {
                  id_investment: created.id_investment,
                  agency_investment_id: created.agency_investment_id,
                  operator_id: created.operator_id,
                  currency: created.currency,
                  amount: created.amount,
                  description: created.description,
                  paid_at: created.paid_at,
                },
              );
            }
          }
        });
      }

      processed = nextDue;
      nextDue = addMonthsToDue(nextDue, intervalMonths, dayOfMonth);
      guard++;
    }

    if (processed) {
      await prisma.recurringInvestment.update({
        where: { id_recurring: rule.id_recurring },
        data: { last_run: processed },
      });
    }
  }
}

// ==== GET ====
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  try {
    try {
      await ensureRecurringInvestments(auth);
    } catch (e) {
      console.error("[investments][recurring][sync]", e);
    }

    const takeParam = safeNumber(
      Array.isArray(req.query.take) ? req.query.take[0] : req.query.take,
    );
    const take = Math.min(Math.max(takeParam || 24, 1), 100);

    const cursorParam = safeNumber(
      Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor,
    );
    const cursor = cursorParam;

    const category =
      typeof req.query.category === "string" ? req.query.category.trim() : "";
    const currency =
      typeof req.query.currency === "string" ? req.query.currency.trim() : "";
    const paymentMethod =
      typeof req.query.payment_method === "string"
        ? req.query.payment_method.trim()
        : "";
    const account =
      typeof req.query.account === "string" ? req.query.account.trim() : "";
    const operatorId = safeNumber(
      Array.isArray(req.query.operatorId)
        ? req.query.operatorId[0]
        : req.query.operatorId,
    );
    const userId = safeNumber(
      Array.isArray(req.query.userId) ? req.query.userId[0] : req.query.userId,
    );
    // 👇 NUEVO: filtro por bookingId
    const bookingId = safeNumber(
      Array.isArray(req.query.bookingId)
        ? req.query.bookingId[0]
        : req.query.bookingId,
    );

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
      ...(category ? { category } : {}),
      ...(currency ? { currency } : {}),
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
      ...(account ? { account } : {}),
      ...(operatorId ? { operator_id: operatorId } : {}),
      ...(userId ? { user_id: userId } : {}),
      ...(bookingId ? { booking_id: bookingId } : {}), // 👈 NUEVO
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
      const or: Prisma.InvestmentWhereInput[] = [
        ...(Number.isFinite(qNum) ? [{ id_investment: qNum }] : []),
        ...(Number.isFinite(qNum) ? [{ agency_investment_id: qNum }] : []),
        ...(Number.isFinite(qNum) ? [{ booking_id: qNum }] : []), // 👈 búsqueda por N° de reserva
        ...(Number.isFinite(qNum)
          ? [{ booking: { agency_booking_id: qNum } }]
          : []),
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
        booking: { select: { id_booking: true, agency_booking_id: true } }, // 👈 devuelve la reserva asociada (si existe)
      },
      orderBy: { id_investment: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id_investment: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > take;
    const sliced = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id_investment : null;

    return res.status(200).json({ items: sliced, nextCursor });
  } catch (e: unknown) {
    console.error("[investments][GET]", e);
    return res
      .status(500)
      .json({ error: "Error al obtener inversiones/gastos" });
  }
}

// ==== POST ====
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  try {
    const b = req.body ?? {};
    const category = String(b.category ?? "").trim(); // requerido
    const description = String(b.description ?? "").trim(); // requerido
    const currency = String(b.currency ?? "").trim(); // requerido
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
    // 👇 opcional
    const booking_id = Number.isFinite(Number(b.booking_id))
      ? Number(b.booking_id)
      : undefined;

    // 👇 NUEVO: método de pago / cuenta (opcionales)
    const payment_method =
      typeof b.payment_method === "string"
        ? b.payment_method.trim()
        : undefined;
    const account =
      typeof b.account === "string" ? b.account.trim() : undefined;

    // 👇 NUEVO: conversión (opcional, sin T.C. ni notas)
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

    // Reglas según categoría
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

    // Validar booking (si viene) y que sea de la misma agencia
    let bookingIdToSave: number | null = null;
    if (typeof booking_id === "number") {
      const bkg = await prisma.booking.findFirst({
        where: { id_booking: booking_id, id_agency: auth.id_agency },
        select: { id_booking: true },
      });
      if (!bkg) {
        return res
          .status(400)
          .json({ error: "La reserva no existe o no pertenece a tu agencia" });
      }
      bookingIdToSave = bkg.id_booking;
    }

    const created = await prisma.$transaction(async (tx) => {
      const agencyInvestmentId = await getNextAgencyCounter(
        tx,
        auth.id_agency,
        "investment",
      );

      return tx.investment.create({
        data: {
          agency_investment_id: agencyInvestmentId,
          id_agency: auth.id_agency,
          category,
          description,
          amount,
          currency,
          paid_at: paid_at ?? null,
          operator_id: operator_id ?? null,
          user_id: user_id ?? null,
          created_by: auth.id_user,
          booking_id: bookingIdToSave,

          // 👇 NUEVO: guardar método de pago / cuenta si vienen
          ...(payment_method ? { payment_method } : {}),
          ...(account ? { account } : {}),

          // 👇 NUEVO: guardar conversión si vienen
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
    });

    return res.status(201).json(created);
  } catch (e: unknown) {
    console.error("[investments][POST]", e);
    return res.status(500).json({ error: "Error al crear gasto" });
  }
}

// ==== router ====
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
