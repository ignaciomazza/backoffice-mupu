// src/pages/api/operators/insights.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

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
  role?: string;
  email?: string;
};

type MoneyMap = Record<string, number>;
type DateMode = "creation" | "travel";

type OperatorInsightsResponse = {
  operator: { id_operator: number; name: string | null };
  range: { from: string; to: string; mode: DateMode };
  counts: {
    services: number;
    bookings: number;
    receipts: number;
    investments: number;
    investmentsUnlinked: number;
    dues: number;
  };
  totals: {
    sales: MoneyMap;
    incomes: MoneyMap;
    expenses: MoneyMap;
    expensesUnlinked: MoneyMap;
    net: MoneyMap;
    duePending: MoneyMap;
    dueOverdue: MoneyMap;
  };
  debtBreakdown: {
    pending: MoneyMap;
    overdue: MoneyMap;
    paid: MoneyMap;
    cancelled: MoneyMap;
    totalOpen: MoneyMap;
    counts: {
      pending: number;
      overdue: number;
      paid: number;
      cancelled: number;
    };
  };
  averages: {
    avgSalePerBooking: MoneyMap;
    avgIncomePerReceipt: MoneyMap;
    servicesPerBooking: number;
  };
  lists: {
    dues: {
      id_due: number;
      due_date: string;
      status: string;
      amount: number;
      currency: string;
      booking_id: number;
      service_id: number;
      concept: string;
    }[];
    receipts: {
      id_receipt: number;
      issue_date: string;
      concept: string;
      amount: number;
      currency: string;
      booking_id: number | null;
    }[];
    investments: {
      id_investment: number;
      created_at: string;
      description: string;
      amount: number;
      currency: string;
      booking_id: number | null;
    }[];
    investmentsUnlinked: {
      id_investment: number;
      created_at: string;
      description: string;
      amount: number;
      currency: string;
      booking_id: number | null;
    }[];
  };
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

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
    const role = typeof p.role === "string" ? p.role : undefined;
    const email = typeof p.email === "string" ? p.email : undefined;

    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u) {
        return {
          id_user,
          id_agency: u.id_agency,
          role: role ?? u.role,
          email: email ?? u.email ?? undefined,
        };
      }
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role, email };
  } catch {
    return null;
  }
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toLocalDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function addMoney(target: MoneyMap, currency: string, amount: number) {
  if (!currency) return;
  if (!Number.isFinite(amount)) return;
  const code = currency.toUpperCase();
  target[code] = (target[code] ?? 0) + amount;
}

function combineNet(incomes: MoneyMap, expenses: MoneyMap): MoneyMap {
  const out: MoneyMap = {};
  const keys = new Set([...Object.keys(incomes), ...Object.keys(expenses)]);
  for (const key of keys) {
    out[key] = (incomes[key] ?? 0) - (expenses[key] ?? 0);
  }
  return out;
}

function normalizeStatus(status?: string | null): string {
  return String(status || "")
    .trim()
    .toLowerCase();
}

function isPaidStatus(status?: string | null): boolean {
  const s = normalizeStatus(status);
  return s === "pago" || s === "pagado" || s === "pagada" || s === "paid";
}

function isCancelledStatus(status?: string | null): boolean {
  const s = normalizeStatus(status);
  return (
    s === "cancelado" ||
    s === "cancelada" ||
    s === "cancelled" ||
    s === "canceled"
  );
}

function pickMoney(
  amount: unknown,
  currency: unknown,
  baseAmount?: unknown,
  baseCurrency?: unknown,
) {
  const hasBase =
    baseAmount !== null &&
    baseAmount !== undefined &&
    baseCurrency !== null &&
    baseCurrency !== undefined &&
    String(baseCurrency).trim().length > 0;
  const rawCur = hasBase ? baseCurrency : currency;
  const cur = String(rawCur || "ARS").toUpperCase();
  const rawAmount = hasBase ? baseAmount : amount;
  const val = Number(rawAmount ?? 0);
  return { cur, val };
}

function parseDateMode(raw: unknown): DateMode {
  return raw === "travel" ? "travel" : "creation";
}

function buildBookingDateFilter(
  mode: DateMode,
  fromDate: Date,
  toExclusive: Date,
) {
  if (mode === "travel") {
    return {
      departure_date: { lt: toExclusive },
      return_date: { gte: fromDate },
    };
  }
  return { creation_date: { gte: fromDate, lt: toExclusive } };
}

function mergeMoneyMaps(target: MoneyMap, source: MoneyMap) {
  for (const [cur, val] of Object.entries(source)) {
    addMoney(target, cur, val);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OperatorInsightsResponse | { error: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await getUserFromAuth(req);
  if (!auth?.id_agency) {
    return res.status(401).json({ error: "No autenticado" });
  }

  const operatorId =
    safeNumber(
      Array.isArray(req.query.operatorId)
        ? req.query.operatorId[0]
        : req.query.operatorId,
    ) ??
    safeNumber(
      Array.isArray(req.query.operator_id)
        ? req.query.operator_id[0]
        : req.query.operator_id,
    );

  if (!operatorId) {
    return res.status(400).json({ error: "operatorId requerido" });
  }

  const fromRaw = Array.isArray(req.query.from)
    ? req.query.from[0]
    : req.query.from;
  const toRaw = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to;

  if (typeof fromRaw !== "string" || typeof toRaw !== "string") {
    return res.status(400).json({ error: "from/to requeridos" });
  }

  const fromDate = toLocalDate(fromRaw);
  const toDate = toLocalDate(toRaw);
  if (!fromDate || !toDate) {
    return res.status(400).json({ error: "from/to inválidos" });
  }
  const toExclusive = new Date(toDate);
  toExclusive.setDate(toExclusive.getDate() + 1);
  const dateMode = parseDateMode(
    Array.isArray(req.query.dateMode)
      ? req.query.dateMode[0]
      : req.query.dateMode,
  );
  const bookingDateFilter = buildBookingDateFilter(
    dateMode,
    fromDate,
    toExclusive,
  );

  const operator = await prisma.operator.findFirst({
    where: { id_operator: operatorId, id_agency: auth.id_agency },
    select: { id_operator: true, name: true },
  });
  if (!operator) {
    return res.status(404).json({ error: "Operador no encontrado" });
  }

  try {
    const services = await prisma.service.findMany({
      where: {
        id_operator: operatorId,
        booking: {
          id_agency: auth.id_agency,
          ...bookingDateFilter,
        },
      },
      select: {
        id_service: true,
        booking_id: true,
        currency: true,
        sale_price: true,
      },
    });

    const bookingIds = new Set<number>();
    const salesByCurrency: MoneyMap = {};
    services.forEach((svc) => {
      bookingIds.add(svc.booking_id);
      addMoney(salesByCurrency, svc.currency, Number(svc.sale_price) || 0);
    });

    const receipts = await prisma.receipt.findMany({
      where: {
        booking: {
          id_agency: auth.id_agency,
          ...bookingDateFilter,
          services: { some: { id_operator: operatorId } },
        },
      },
      select: {
        id_receipt: true,
        issue_date: true,
        concept: true,
        amount: true,
        amount_currency: true,
        base_amount: true,
        base_currency: true,
        bookingId_booking: true,
      },
      orderBy: { issue_date: "desc" },
    });

    const incomesByCurrency: MoneyMap = {};
    const incomeCounts: Record<string, number> = {};
    receipts.forEach((rec) => {
      const { cur, val } = pickMoney(
        rec.amount,
        rec.amount_currency,
        rec.base_amount,
        rec.base_currency,
      );
      addMoney(incomesByCurrency, cur, val);
      incomeCounts[cur] = (incomeCounts[cur] ?? 0) + 1;
    });

    const investmentsWithBooking = await prisma.investment.findMany({
      where: {
        id_agency: auth.id_agency,
        operator_id: operatorId,
        booking: {
          id_agency: auth.id_agency,
          ...bookingDateFilter,
        },
      },
      select: {
        id_investment: true,
        created_at: true,
        description: true,
        amount: true,
        currency: true,
        base_amount: true,
        base_currency: true,
        booking_id: true,
      },
      orderBy: { created_at: "desc" },
    });

    const investmentsUnlinked = await prisma.investment.findMany({
      where: {
        id_agency: auth.id_agency,
        operator_id: operatorId,
        booking_id: null,
        created_at: { gte: fromDate, lt: toExclusive },
      },
      select: {
        id_investment: true,
        created_at: true,
        description: true,
        amount: true,
        currency: true,
        base_amount: true,
        base_currency: true,
        booking_id: true,
      },
      orderBy: { created_at: "desc" },
    });

    const expensesByCurrency: MoneyMap = {};
    investmentsWithBooking.forEach((inv) => {
      const { cur, val } = pickMoney(
        inv.amount,
        inv.currency,
        inv.base_amount,
        inv.base_currency,
      );
      addMoney(expensesByCurrency, cur, val);
    });

    const expensesUnlinkedByCurrency: MoneyMap = {};
    investmentsUnlinked.forEach((inv) => {
      const { cur, val } = pickMoney(
        inv.amount,
        inv.currency,
        inv.base_amount,
        inv.base_currency,
      );
      addMoney(expensesUnlinkedByCurrency, cur, val);
    });

    const dues = await prisma.operatorDue.findMany({
      where: {
        booking: {
          id_agency: auth.id_agency,
          ...bookingDateFilter,
        },
        service: { id_operator: operatorId },
      },
      select: {
        id_due: true,
        due_date: true,
        status: true,
        amount: true,
        currency: true,
        booking_id: true,
        service_id: true,
        concept: true,
      },
      orderBy: [{ due_date: "asc" }, { id_due: "asc" }],
    });

    const duePendingByCurrency: MoneyMap = {};
    const dueOverdueByCurrency: MoneyMap = {};
    const duePaidByCurrency: MoneyMap = {};
    const dueCancelledByCurrency: MoneyMap = {};
    const dueCounts = {
      pending: 0,
      overdue: 0,
      paid: 0,
      cancelled: 0,
    };
    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0,
    );

    dues.forEach((due) => {
      const cur = String(due.currency || "ARS").toUpperCase();
      const amt = Number(due.amount) || 0;
      if (isPaidStatus(due.status)) {
        addMoney(duePaidByCurrency, cur, amt);
        dueCounts.paid += 1;
        return;
      }
      if (isCancelledStatus(due.status)) {
        addMoney(dueCancelledByCurrency, cur, amt);
        dueCounts.cancelled += 1;
        return;
      }
      if (due.due_date < todayStart) {
        addMoney(dueOverdueByCurrency, cur, amt);
        dueCounts.overdue += 1;
        return;
      }
      addMoney(duePendingByCurrency, cur, amt);
      dueCounts.pending += 1;
    });

    const dueTotalOpenByCurrency: MoneyMap = {};
    mergeMoneyMaps(dueTotalOpenByCurrency, duePendingByCurrency);
    mergeMoneyMaps(dueTotalOpenByCurrency, dueOverdueByCurrency);

    const bookingCount = bookingIds.size;
    const servicesPerBooking =
      bookingCount > 0 ? services.length / bookingCount : 0;

    const avgSalePerBooking: MoneyMap = {};
    Object.entries(salesByCurrency).forEach(([cur, total]) => {
      if (bookingCount > 0) avgSalePerBooking[cur] = total / bookingCount;
    });

    const avgIncomePerReceipt: MoneyMap = {};
    Object.entries(incomesByCurrency).forEach(([cur, total]) => {
      const count = incomeCounts[cur] ?? 0;
      if (count > 0) avgIncomePerReceipt[cur] = total / count;
    });

    const recentReceipts = receipts.slice(0, 10).map((rec) => {
      const { cur, val } = pickMoney(
        rec.amount,
        rec.amount_currency,
        rec.base_amount,
        rec.base_currency,
      );
      return {
        id_receipt: rec.id_receipt,
        issue_date: rec.issue_date.toISOString(),
        concept: rec.concept,
        amount: val,
        currency: cur,
        booking_id: rec.bookingId_booking ?? null,
      };
    });

    const recentInvestments = investmentsWithBooking.slice(0, 10).map((inv) => {
      const { cur, val } = pickMoney(
        inv.amount,
        inv.currency,
        inv.base_amount,
        inv.base_currency,
      );
      return {
        id_investment: inv.id_investment,
        created_at: inv.created_at.toISOString(),
        description: inv.description,
        amount: val,
        currency: cur,
        booking_id: inv.booking_id ?? null,
      };
    });

    const recentInvestmentsUnlinked = investmentsUnlinked
      .slice(0, 8)
      .map((inv) => {
        const { cur, val } = pickMoney(
          inv.amount,
          inv.currency,
          inv.base_amount,
          inv.base_currency,
        );
        return {
          id_investment: inv.id_investment,
          created_at: inv.created_at.toISOString(),
          description: inv.description,
          amount: val,
          currency: cur,
          booking_id: inv.booking_id ?? null,
        };
      });

    const dueList = dues.slice(0, 12).map((due) => ({
      id_due: due.id_due,
      due_date: due.due_date.toISOString(),
      status: due.status,
      amount: Number(due.amount) || 0,
      currency: String(due.currency || "ARS").toUpperCase(),
      booking_id: due.booking_id,
      service_id: due.service_id,
      concept: due.concept,
    }));

    return res.status(200).json({
      operator,
      range: { from: fromRaw, to: toRaw, mode: dateMode },
      counts: {
        services: services.length,
        bookings: bookingCount,
        receipts: receipts.length,
        investments: investmentsWithBooking.length,
        investmentsUnlinked: investmentsUnlinked.length,
        dues: dues.length,
      },
      totals: {
        sales: salesByCurrency,
        incomes: incomesByCurrency,
        expenses: expensesByCurrency,
        expensesUnlinked: expensesUnlinkedByCurrency,
        net: combineNet(incomesByCurrency, expensesByCurrency),
        duePending: duePendingByCurrency,
        dueOverdue: dueOverdueByCurrency,
      },
      debtBreakdown: {
        pending: duePendingByCurrency,
        overdue: dueOverdueByCurrency,
        paid: duePaidByCurrency,
        cancelled: dueCancelledByCurrency,
        totalOpen: dueTotalOpenByCurrency,
        counts: dueCounts,
      },
      averages: {
        avgSalePerBooking,
        avgIncomePerReceipt,
        servicesPerBooking,
      },
      lists: {
        dues: dueList,
        receipts: recentReceipts,
        investments: recentInvestments,
        investmentsUnlinked: recentInvestmentsUnlinked,
      },
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Error cargando insights";
    return res.status(500).json({ error: msg });
  }
}
