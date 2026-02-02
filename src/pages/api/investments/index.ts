// src/pages/api/investments/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { encodePublicId } from "@/lib/publicIds";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import {
  getBookingComponentGrants,
  getFinanceSectionGrants,
} from "@/lib/accessControl";
import {
  canAccessBookingComponent,
  canAccessFinanceSection,
} from "@/utils/permissions";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";

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

async function getOperatorCategoryNames(
  agencyId: number,
): Promise<string[]> {
  const rows = await prisma.expenseCategory.findMany({
    where: { id_agency: agencyId, requires_operator: true },
    select: { name: true },
  });
  return rows.map((r) => r.name).filter((n) => typeof n === "string");
}

function buildOperatorCategorySet(names: string[]): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    const n = normSoft(name);
    if (n) set.add(n);
  }
  return set;
}

function isOperatorCategoryName(
  name: string,
  operatorCategorySet?: Set<string>,
) {
  const n = normSoft(name);
  if (!n) return false;
  if (n.startsWith("operador")) return true;
  return operatorCategorySet ? operatorCategorySet.has(n) : false;
}

function parseServiceIds(raw: unknown): number[] {
  const ids: number[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) ids.push(Math.trunc(n));
    }
  } else if (typeof raw === "string" && raw.trim()) {
    for (const part of raw.split(",")) {
      const n = Number(part.trim());
      if (Number.isFinite(n) && n > 0) ids.push(Math.trunc(n));
    }
  }
  return Array.from(new Set(ids));
}

type ServicePick = {
  id_service: number;
  booking_id: number;
  id_operator: number;
  currency: string;
  cost_price: number | null;
};

async function getServicesByIds(
  agencyId: number,
  ids: number[],
): Promise<ServicePick[]> {
  if (ids.length === 0) return [];
  return prisma.service.findMany({
    where: { id_service: { in: ids }, id_agency: agencyId },
    select: {
      id_service: true,
      booking_id: true,
      id_operator: true,
      currency: true,
      cost_price: true,
    },
  });
}

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

  const agencyAccountId = await getNextAgencyCounter(
    tx,
    agencyId,
    "credit_account",
  );
  const created = await tx.creditAccount.create({
    data: {
      id_agency: agencyId,
      agency_credit_account_id: agencyAccountId,
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

  const agencyEntryId = await getNextAgencyCounter(
    tx,
    agencyId,
    "credit_entry",
  );
  const entry = await tx.creditEntry.create({
    data: {
      id_agency: agencyId,
      agency_credit_entry_id: agencyEntryId,
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

function shouldHaveCreditEntry(
  payload: {
    category?: string | null;
    operator_id?: number | null;
    payment_method?: string | null;
  },
  operatorCategorySet?: Set<string>,
) {
  return (
    isOperatorCategoryName(payload.category || "", operatorCategorySet) &&
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

async function ensureRecurringInvestments(
  auth: DecodedAuth,
  operatorCategorySet?: Set<string>,
) {
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
            shouldHaveCreditEntry(
              {
                category: created.category,
                operator_id: created.operator_id ?? undefined,
                payment_method: created.payment_method ?? undefined,
              },
              operatorCategorySet,
            )
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

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const bookingGrants = await getBookingComponentGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canInvestments = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "investments",
  );
  const canOperatorPaymentsSection = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "operator_payments",
  );
  const canOperatorPayments =
    canAccessBookingComponent(
      auth.role,
      bookingGrants,
      "operator_payments",
    ) || canOperatorPaymentsSection;
  if (!canInvestments && !canOperatorPayments) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const planAccess = await ensurePlanFeatureAccess(
    auth.id_agency,
    "investments",
  );
  const restrictToOperatorPayments = !planAccess.allowed;
  if (restrictToOperatorPayments && !canOperatorPayments) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  try {
    let operatorCategoryNames: string[] = [];
    let operatorCategorySet: Set<string> | undefined;
    const loadOperatorCategories = async () => {
      if (operatorCategorySet) return;
      operatorCategoryNames = await getOperatorCategoryNames(auth.id_agency);
      operatorCategorySet = buildOperatorCategorySet(operatorCategoryNames);
    };

    if (!restrictToOperatorPayments && canInvestments) {
      try {
        await loadOperatorCategories();
        await ensureRecurringInvestments(auth, operatorCategorySet);
      } catch (e) {
        console.error("[investments][recurring][sync]", e);
      }
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
    const operatorOnlyRaw = Array.isArray(req.query.operatorOnly)
      ? req.query.operatorOnly[0]
      : req.query.operatorOnly;
    const operatorOnly =
      typeof operatorOnlyRaw === "string" &&
      (operatorOnlyRaw === "1" || operatorOnlyRaw.toLowerCase() === "true");
    const excludeOperatorRaw = Array.isArray(req.query.excludeOperator)
      ? req.query.excludeOperator[0]
      : req.query.excludeOperator;
    const excludeOperator =
      typeof excludeOperatorRaw === "string" &&
      (excludeOperatorRaw === "1" ||
        excludeOperatorRaw.toLowerCase() === "true");
    const includeCountsRaw = Array.isArray(req.query.includeCounts)
      ? req.query.includeCounts[0]
      : req.query.includeCounts;
    const includeCounts =
      typeof includeCountsRaw === "string" &&
      (includeCountsRaw === "1" || includeCountsRaw.toLowerCase() === "true");

    if (operatorOnly && excludeOperator) {
      return res
        .status(400)
        .json({ error: "Parámetros incompatibles" });
    }
    if (restrictToOperatorPayments && excludeOperator) {
      return res.status(403).json({ error: "Plan insuficiente" });
    }

    if (restrictToOperatorPayments || operatorOnly || excludeOperator) {
      await loadOperatorCategories();
    }

    const categoryIsOperator = category
      ? isOperatorCategoryName(category, operatorCategorySet)
      : false;

    if (restrictToOperatorPayments && category && !categoryIsOperator) {
      return res.status(403).json({ error: "Plan insuficiente" });
    }
    if (operatorOnly && category && !categoryIsOperator) {
      return res
        .status(400)
        .json({ error: "La categoría no corresponde a operador" });
    }
    if (excludeOperator && category && categoryIsOperator) {
      return res
        .status(400)
        .json({ error: "La categoría corresponde a operador" });
    }

    const where: Prisma.InvestmentWhereInput = {
      id_agency: auth.id_agency,
      ...(currency ? { currency } : {}),
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
      ...(account ? { account } : {}),
      ...(operatorId ? { operator_id: operatorId } : {}),
      ...(userId ? { user_id: userId } : {}),
    };

    const andFilters: Prisma.InvestmentWhereInput[] = [];
    if (bookingId) {
      const bookingServices = await prisma.service.findMany({
        where: { booking_id: bookingId, id_agency: auth.id_agency },
        select: { id_service: true },
      });
      const bookingServiceIds = bookingServices.map((s) => s.id_service);
      if (bookingServiceIds.length > 0) {
        andFilters.push({
          OR: [
            { booking_id: bookingId },
            { serviceIds: { hasSome: bookingServiceIds } },
          ],
        });
      } else {
        where.booking_id = bookingId;
      }
    }
    if (category) {
      where.category = category;
    } else if (restrictToOperatorPayments || operatorOnly || excludeOperator) {
      const operatorOr: Prisma.InvestmentWhereInput[] = [
        { category: { startsWith: "operador", mode: "insensitive" } },
        ...(operatorCategoryNames.length
          ? [{ category: { in: operatorCategoryNames } }]
          : []),
      ];
      if (restrictToOperatorPayments || operatorOnly) {
        andFilters.push({ OR: operatorOr });
      } else if (excludeOperator) {
        andFilters.push({ NOT: { OR: operatorOr } });
      }
    }

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
      andFilters.push({ OR: or });
    }
    if (andFilters.length) {
      where.AND = andFilters;
    }

    const baseWhere: Prisma.InvestmentWhereInput = {
      id_agency: auth.id_agency,
    };
    if (restrictToOperatorPayments || operatorOnly || excludeOperator) {
      const operatorOr: Prisma.InvestmentWhereInput[] = [
        { category: { startsWith: "operador", mode: "insensitive" } },
        ...(operatorCategoryNames.length
          ? [{ category: { in: operatorCategoryNames } }]
          : []),
      ];
      if (restrictToOperatorPayments || operatorOnly) {
        baseWhere.AND = [{ OR: operatorOr }];
      } else if (excludeOperator) {
        baseWhere.AND = [{ NOT: { OR: operatorOr } }];
      }
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
    const normalized = sliced.map((item) => ({
      ...item,
      booking: item.booking
        ? {
            ...item.booking,
            public_id:
              item.booking.agency_booking_id != null
                ? encodePublicId({
                    t: "booking",
                    a: item.id_agency,
                    i: item.booking.agency_booking_id,
                  })
                : null,
          }
        : null,
    }));
    const nextCursor = hasMore ? sliced[sliced.length - 1].id_investment : null;

    let totalCount: number | undefined;
    let filteredCount: number | undefined;
    if (includeCounts) {
      [filteredCount, totalCount] = await Promise.all([
        prisma.investment.count({ where }),
        prisma.investment.count({ where: baseWhere }),
      ]);
    }

    return res.status(200).json({
      items: normalized,
      nextCursor,
      ...(includeCounts
        ? { totalCount: totalCount ?? 0, filteredCount: filteredCount ?? 0 }
        : {}),
    });
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

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const bookingGrants = await getBookingComponentGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canInvestments = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "investments",
  );
  const canOperatorPaymentsSection = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "operator_payments",
  );
  const canOperatorPayments =
    canAccessBookingComponent(
      auth.role,
      bookingGrants,
      "operator_payments",
    ) || canOperatorPaymentsSection;
  if (!canInvestments && !canOperatorPayments) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  try {
    const planAccess = await ensurePlanFeatureAccess(
      auth.id_agency,
      "investments",
    );
    const restrictToOperatorPayments = !planAccess.allowed;
    if (restrictToOperatorPayments && !canOperatorPayments) {
      return res.status(403).json({ error: "Plan insuficiente" });
    }

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
    const operatorCategoryNames = await getOperatorCategoryNames(auth.id_agency);
    const operatorCategorySet = buildOperatorCategorySet(
      operatorCategoryNames,
    );
    const categoryIsOperator = isOperatorCategoryName(
      category,
      operatorCategorySet,
    );
    if (restrictToOperatorPayments && !categoryIsOperator) {
      return res.status(403).json({ error: "Plan insuficiente" });
    }

    const paid_at = b.paid_at ? toLocalDate(b.paid_at) : undefined;
    let operator_id = Number.isFinite(Number(b.operator_id))
      ? Number(b.operator_id)
      : undefined;
    const user_id = Number.isFinite(Number(b.user_id))
      ? Number(b.user_id)
      : undefined;
    // 👇 opcional
    const booking_id = Number.isFinite(Number(b.booking_id))
      ? Number(b.booking_id)
      : undefined;
    const booking_agency_id = Number.isFinite(Number(b.booking_agency_id))
      ? Number(b.booking_agency_id)
      : undefined;
    const serviceIds = parseServiceIds(b.serviceIds);

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
    if (categoryIsOperator && !operator_id && serviceIds.length === 0) {
      return res
        .status(400)
        .json({
          error: "Para categorías de Operador, operator_id es obligatorio",
        });
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
    } else if (typeof booking_agency_id === "number") {
      const bkg = await prisma.booking.findFirst({
        where: {
          agency_booking_id: booking_agency_id,
          id_agency: auth.id_agency,
        },
        select: { id_booking: true },
      });
      if (!bkg) {
        return res
          .status(400)
          .json({ error: "La reserva no existe o no pertenece a tu agencia" });
      }
      bookingIdToSave = bkg.id_booking;
    }

    // Validar servicios asociados (si vienen)
    if (serviceIds.length > 0) {
      if (!categoryIsOperator) {
        return res.status(400).json({
          error: "Solo podés asociar servicios a pagos de operador",
        });
      }

      const services = await getServicesByIds(auth.id_agency, serviceIds);
      if (services.length !== serviceIds.length) {
        return res.status(400).json({
          error: "Algún servicio no existe o no pertenece a tu agencia",
        });
      }

      const operatorIds = new Set(services.map((s) => s.id_operator));
      if (operatorIds.size !== 1) {
        return res.status(400).json({
          error: "No podés mezclar servicios de distintos operadores",
        });
      }
      const serviceOperatorId = services[0].id_operator;
      if (operator_id && operator_id !== serviceOperatorId) {
        return res.status(400).json({
          error: "El operador no coincide con los servicios seleccionados",
        });
      }
      if (!operator_id) operator_id = serviceOperatorId;

      const currencies = new Set(
        services.map((s) => (s.currency || "").toUpperCase()),
      );
      if (currencies.size !== 1) {
        return res.status(400).json({
          error: "No podés mezclar servicios de monedas distintas",
        });
      }
      const serviceCurrency = (services[0].currency || "").toUpperCase();
      if (currency.toUpperCase() !== serviceCurrency) {
        return res.status(400).json({
          error: "La moneda del pago debe coincidir con la de los servicios",
        });
      }

      const totalCost = services.reduce(
        (sum, s) => sum + Number(s.cost_price || 0),
        0,
      );
      if (Number.isFinite(totalCost) && totalCost > amount) {
        return res.status(400).json({
          error:
            "El costo total de los servicios no puede superar el monto del pago",
        });
      }

      const bookingIds = new Set(services.map((s) => s.booking_id));
      if (bookingIds.size === 1) {
        const onlyBookingId = services[0].booking_id;
        if (bookingIdToSave && bookingIdToSave !== onlyBookingId) {
          return res.status(400).json({
            error: "La reserva no coincide con los servicios seleccionados",
          });
        }
        bookingIdToSave = onlyBookingId;
      } else if (bookingIdToSave) {
        return res.status(400).json({
          error:
            "No podés asociar servicios de múltiples reservas y fijar una reserva",
        });
      }
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
          serviceIds,

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
