// src/pages/api/cashbox/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";

/* =========================================================
 * Tipos de dominio para Cashbox
 * ========================================================= */

type DecimalLike = number | Prisma.Decimal;

type MovementKind =
  | "income" // Ingresos (cobros, etc.)
  | "expense" // Egresos (gastos, pagos, etc.)
  | "client_debt" // Deuda de pasajeros hacia la agencia
  | "operator_debt" // Deuda de la agencia hacia operadores
  | "other";

type MovementSource =
  | "receipt"
  | "investment"
  | "client_payment"
  | "operator_due"
  | "credit_entry"
  | "manual"
  | "other";

export type CashboxMovement = {
  id: string; // ej: "receipt:123", "investment:45"
  date: string; // ISO: fecha principal del movimiento (caja)
  type: MovementKind;
  source: MovementSource;
  description: string;
  currency: string; // "ARS" | "USD" | ...
  amount: number; // siempre positivo (el signo lo define "type")

  // Enlazados opcionales
  clientName?: string | null;
  operatorName?: string | null;
  bookingLabel?: string | null;

  // Para deudas / vencimientos
  dueDate?: string | null; // ISO si aplica

  // NUEVO: clasificación de caja
  paymentMethod?: string | null; // Efectivo, Transferencia, MP, etc.
  account?: string | null; // Banco / billetera / caja física, etc.
};

type CurrencySummary = {
  currency: string;
  income: number;
  expenses: number;
  net: number;
};

type DebtSummary = {
  currency: string;
  amount: number;
};

type PaymentMethodSummary = {
  paymentMethod: string; // "Efectivo", "Transferencia", "Sin método", etc.
  currency: string;
  income: number;
  expenses: number;
  net: number;
};

type AccountSummary = {
  account: string; // "Macro CC", "MP", "Caja local", "Sin cuenta", etc.
  currency: string;
  income: number;
  expenses: number;
  net: number;
  opening?: number;
  closing?: number;
};

export type CashboxSummaryResponse = {
  // Rango principal de análisis (normalmente un mes)
  range: {
    year: number;
    month: number; // 1-12
    from: string; // ISO inicio de mes
    to: string; // ISO fin de mes
  };

  // Totales de caja por moneda en el rango
  totalsByCurrency: CurrencySummary[];

  // NUEVO: totales por medio de pago y cuenta
  totalsByPaymentMethod: PaymentMethodSummary[];
  totalsByAccount: AccountSummary[];

  // Saldos globales (foto actual) por moneda
  balances: {
    clientDebtByCurrency: DebtSummary[]; // lo que los pasajeros deben a la agencia
    operatorDebtByCurrency: DebtSummary[]; // lo que la agencia debe a operadores
  };

  // Deudas con vencimiento dentro del rango (por ahora: ClientPayment + OperatorDue)
  upcomingDue: CashboxMovement[];

  // Lista plana de movimientos del rango (ingresos, egresos, deudas del mes)
  movements: CashboxMovement[];
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/* =========================================================
 * Auth (alineado con /api/bookings)
 * ========================================================= */

type UserRole =
  | "gerente"
  | "lider"
  | "administrativo"
  | "desarrollador"
  | "vendedor";

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

type AuthPayload = {
  id_user: number;
  id_agency: number;
  role?: UserRole | string;
  email?: string;
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET no configurado");
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getTokenFromRequest(req: NextApiRequest): string | null {
  // 1) cookie "token" (principal en prod)
  if (req.cookies?.token) return req.cookies.token;

  // 2) Authorization: Bearer ...
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();

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

async function getAuth(req: NextApiRequest): Promise<AuthPayload> {
  const token = getTokenFromRequest(req);
  if (!token) {
    throw new HttpError(401, "Falta token de autenticación.");
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || 0;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || 0;
    const role = (p.role || "") as string | undefined;
    const email = p.email;

    if (!id_user || !id_agency) {
      throw new HttpError(
        401,
        "Token inválido (faltan campos requeridos en el payload).",
      );
    }

    return { id_user, id_agency, role, email };
  } catch (err) {
    console.error("[cashbox] Error verificando JWT:", err);
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, "Token inválido o expirado.");
  }
}

/* =========================================================
 * Helpers
 * ========================================================= */

function getNumberFromQuery(
  value: string | string[] | undefined,
): number | undefined {
  if (!value) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildMonthRange(year: number, month: number) {
  // month: 1-12
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999); // último día del mes
  return { from, to };
}

function decimalToNumber(value: DecimalLike | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value);
}

/**
 * Agrega todos los movimientos y arma el resumen “caja”:
 * - Totales por moneda (ingresos / egresos / neto)
 * - Totales por medio de pago y por cuenta
 * - Deuda pasajeros / operadores por moneda (puede venir override)
 * - Próximos vencimientos dentro del rango
 */
function aggregateCashbox(
  year: number,
  month: number,
  from: Date,
  to: Date,
  movements: CashboxMovement[],
  openingBalancesByAccount: { account: string; currency: string; amount: number }[] = [],
  balancesOverride?: {
    clientDebtByCurrency?: DebtSummary[];
    operatorDebtByCurrency?: DebtSummary[];
  },
): CashboxSummaryResponse {
  const totalsByCurrencyMap = new Map<
    string,
    { currency: string; income: number; expenses: number }
  >();

  // NUEVO: mapas para medios de pago y cuentas
  const totalsByPaymentMethodMap = new Map<
    string,
    {
      paymentMethod: string;
      currency: string;
      income: number;
      expenses: number;
    }
  >();

  const totalsByAccountMap = new Map<
    string,
    {
      account: string;
      currency: string;
      income: number;
      expenses: number;
      opening?: number;
    }
  >();

  const clientDebtByCurrencyMap = new Map<string, number>();
  const operatorDebtByCurrencyMap = new Map<string, number>();
  const upcomingDue: CashboxMovement[] = [];

  for (const m of movements) {
    const isCashFlow = m.type === "income" || m.type === "expense";

    // === Totales por moneda (solo ingresos / egresos) ===
    if (isCashFlow) {
      if (!totalsByCurrencyMap.has(m.currency)) {
        totalsByCurrencyMap.set(m.currency, {
          currency: m.currency,
          income: 0,
          expenses: 0,
        });
      }

      const currentTotals = totalsByCurrencyMap.get(m.currency);
      if (currentTotals) {
        if (m.type === "income") {
          currentTotals.income += m.amount;
        } else if (m.type === "expense") {
          currentTotals.expenses += m.amount;
        }
      }

      // === NUEVO: totales por medio de pago ===
      const pmLabel = m.paymentMethod?.trim() || "Sin método";
      const pmKey = `${pmLabel.toLowerCase()}::${m.currency}`;

      if (!totalsByPaymentMethodMap.has(pmKey)) {
        totalsByPaymentMethodMap.set(pmKey, {
          paymentMethod: pmLabel,
          currency: m.currency,
          income: 0,
          expenses: 0,
        });
      }
      const pmTotals = totalsByPaymentMethodMap.get(pmKey);
      if (pmTotals) {
        if (m.type === "income") {
          pmTotals.income += m.amount;
        } else if (m.type === "expense") {
          pmTotals.expenses += m.amount;
        }
      }

      // === NUEVO: totales por cuenta ===
      const accLabel = m.account?.trim() || "Sin cuenta";
      const accKey = `${accLabel.toLowerCase()}::${m.currency}`;

      if (!totalsByAccountMap.has(accKey)) {
        totalsByAccountMap.set(accKey, {
          account: accLabel,
          currency: m.currency,
          income: 0,
          expenses: 0,
        });
      }
      const accTotals = totalsByAccountMap.get(accKey);
      if (accTotals) {
        if (m.type === "income") {
          accTotals.income += m.amount;
        } else if (m.type === "expense") {
          accTotals.expenses += m.amount;
        }
      }
    }

    // === Deudas por moneda (si no hay override, las calculamos desde movimientos) ===
    if (m.type === "client_debt") {
      const current = clientDebtByCurrencyMap.get(m.currency) ?? 0;
      clientDebtByCurrencyMap.set(m.currency, current + m.amount);
    }

    if (m.type === "operator_debt") {
      const current = operatorDebtByCurrencyMap.get(m.currency) ?? 0;
      operatorDebtByCurrencyMap.set(m.currency, current + m.amount);
    }

    // === Próximos vencimientos (solo deudas) dentro del rango ===
    if ((m.type === "client_debt" || m.type === "operator_debt") && m.dueDate) {
      const due = new Date(m.dueDate);
      if (due >= from && due <= to) {
        upcomingDue.push(m);
      }
    }
  }

  // === Saldos iniciales por cuenta (si existen) ===
  for (const ob of openingBalancesByAccount) {
    const accLabel = ob.account?.trim() || "Sin cuenta";
    const accKey = `${accLabel.toLowerCase()}::${ob.currency}`;
    if (!totalsByAccountMap.has(accKey)) {
      totalsByAccountMap.set(accKey, {
        account: accLabel,
        currency: ob.currency,
        income: 0,
        expenses: 0,
        opening: ob.amount,
      });
      continue;
    }
    const accTotals = totalsByAccountMap.get(accKey);
    if (accTotals && accTotals.opening == null) {
      accTotals.opening = ob.amount;
    }
  }

  // Totales caja por moneda
  const totalsByCurrency: CurrencySummary[] = Array.from(
    totalsByCurrencyMap.values(),
  )
    .map((t) => ({
      ...t,
      net: t.income - t.expenses,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency, "es"));

  // Totales por medio de pago
  const totalsByPaymentMethod: PaymentMethodSummary[] = Array.from(
    totalsByPaymentMethodMap.values(),
  )
    .map((t) => ({
      ...t,
      net: t.income - t.expenses,
    }))
    .sort((a, b) => {
      const byName = a.paymentMethod.localeCompare(b.paymentMethod, "es");
      if (byName !== 0) return byName;
      return a.currency.localeCompare(b.currency, "es");
    });

  // Totales por cuenta
  const totalsByAccount: AccountSummary[] = Array.from(
    totalsByAccountMap.values(),
  )
    .map((t) => ({
      ...t,
      net: t.income - t.expenses,
      opening: t.opening,
      closing:
        typeof t.opening === "number"
          ? t.opening + (t.income - t.expenses)
          : undefined,
    }))
    .sort((a, b) => {
      const byAcc = a.account.localeCompare(b.account, "es");
      if (byAcc !== 0) return byAcc;
      return a.currency.localeCompare(b.currency, "es");
    });

  // Deudas calculadas desde movimientos (fallback)
  const computedClientDebtByCurrency: DebtSummary[] = Array.from(
    clientDebtByCurrencyMap.entries(),
  ).map(([currency, amount]) => ({ currency, amount }));

  const computedOperatorDebtByCurrency: DebtSummary[] = Array.from(
    operatorDebtByCurrencyMap.entries(),
  ).map(([currency, amount]) => ({ currency, amount }));

  // Si tenemos overrides desde CreditAccount, los usamos
  const clientDebtByCurrency =
    balancesOverride?.clientDebtByCurrency ?? computedClientDebtByCurrency;

  const operatorDebtByCurrency =
    balancesOverride?.operatorDebtByCurrency ?? computedOperatorDebtByCurrency;

  // Ordenamos movimientos y vencimientos por fecha ascendente (para tablas / tarjetas)
  const sortedMovements = [...movements].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const sortedUpcomingDue = [...upcomingDue].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    return da - db;
  });

  return {
    range: {
      year,
      month,
      from: from.toISOString(),
      to: to.toISOString(),
    },
    totalsByCurrency,
    totalsByPaymentMethod,
    totalsByAccount,
    balances: {
      clientDebtByCurrency,
      operatorDebtByCurrency,
    },
    upcomingDue: sortedUpcomingDue,
    movements: sortedMovements,
  };
}

/* =========================================================
 * Acceso a datos (Prisma): movimientos del mes
 * ========================================================= */

type GetMonthlyMovementsOptions = {
  hideOperatorExpenses?: boolean;
  accountNameById?: Map<number, string>;
};

/**
 * Movimientos mensuales para Caja:
 * - Receipt (ingresos)
 * - Investment (egresos)
 * - ClientPayment (deuda de pasajeros + vencimientos)
 * - OperatorDue (deuda con operadores + vencimientos)
 */
async function getMonthlyMovements(
  agencyId: number,
  from: Date,
  to: Date,
  options: GetMonthlyMovementsOptions = {},
): Promise<CashboxMovement[]> {
  const { hideOperatorExpenses, accountNameById } = options;

  /* ----------------------------
   * 1) INGRESOS: Recibos
   * ---------------------------- */
  const receiptsRaw = await prisma.receipt.findMany({
    where: {
      issue_date: {
        gte: from,
        lte: to,
      },
      OR: [
        { id_agency: agencyId },
        {
          booking: {
            id_agency: agencyId,
          },
        },
      ],
    },
    include: {
      booking: {
        select: {
          id_booking: true,
          agency_booking_id: true,
          details: true,
          titular: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
        },
      },
    },
  });

  const receipts = receiptsRaw.filter((r) => {
    const { enabled } = r as { enabled?: boolean | null };
    return enabled !== false;
  });

  const receiptMovements: CashboxMovement[] = receipts.map((r) => {
    const booking = r.booking;
    const titular = booking?.titular;

    const clientName = titular
      ? `${titular.first_name} ${titular.last_name}`.trim()
      : null;

    const bookingLabel = booking
      ? `N° ${booking.agency_booking_id ?? booking.id_booking} • ${booking.details}`.trim()
      : null;

    const hasCounter =
      (r as { counter_amount?: unknown }).counter_amount != null &&
      (r as { counter_currency?: string | null }).counter_currency;
    const currency = hasCounter
      ? (r as { counter_currency?: string | null }).counter_currency ??
        "ARS"
      : (r as { amount_currency?: string | null }).amount_currency ??
        r.currency ??
        "ARS";

    return {
      id: `receipt:${r.id_receipt}`,
      date: r.issue_date.toISOString(),
      type: "income",
      source: "receipt",
      description: r.concept ?? `Recibo ${r.receipt_number}`,
      currency,
      amount: hasCounter
        ? decimalToNumber(
            (r as { counter_amount?: DecimalLike | null }).counter_amount,
          )
        : decimalToNumber(r.amount),
      clientName,
      bookingLabel,
      dueDate: null,
      paymentMethod: r.payment_method ?? null,
      account:
        (r.account_id && accountNameById?.get(r.account_id)) ||
        r.account ||
        null,
    };
  });

  /* ----------------------------
   * 2) EGRESOS: Investments
   * ---------------------------- */

  const investmentWhere: Prisma.InvestmentWhereInput = {
    id_agency: agencyId,
    OR: [
      {
        paid_at: {
          gte: from,
          lte: to,
        },
      },
      {
        AND: [
          { paid_at: null },
          {
            created_at: {
              gte: from,
              lte: to,
            },
          },
        ],
      },
    ],
  };

  if (hideOperatorExpenses) {
    investmentWhere.operator_id = null;
  }

  const investments = await prisma.investment.findMany({
    where: investmentWhere,
    include: {
      operator: {
        select: { name: true },
      },
      booking: {
        select: {
          id_booking: true,
          agency_booking_id: true,
          details: true,
        },
      },
    },
  });

  const investmentMovements: CashboxMovement[] = investments.map((inv) => {
    const date = inv.paid_at ?? inv.created_at;
    const operatorName = inv.operator?.name ?? null;
    const bookingLabel = inv.booking
      ? `N° ${inv.booking.agency_booking_id ?? inv.booking.id_booking} • ${inv.booking.details}`
      : null;

    const descriptionParts = [inv.category, inv.description].filter(Boolean);
    const description =
      descriptionParts.length > 0
        ? descriptionParts.join(" • ")
        : "Gasto / inversión";

    return {
      id: `investment:${inv.id_investment}`,
      date: date.toISOString(),
      type: "expense",
      source: "investment",
      description,
      currency: inv.currency,
      amount: decimalToNumber(inv.amount),
      operatorName,
      bookingLabel,
      dueDate: null,
      paymentMethod: inv.payment_method ?? null,
      account: inv.account ?? null,
    };
  });

  /* ----------------------------
   * 3) DEUDA CLIENTES: ClientPayment
   * ---------------------------- */

  const clientPayments = await prisma.clientPayment.findMany({
    where: {
      booking: {
        id_agency: agencyId,
      },
      due_date: {
        gte: from,
        lte: to,
      },
    },
    include: {
      client: {
        select: {
          first_name: true,
          last_name: true,
        },
      },
      booking: {
        select: {
          id_booking: true,
          agency_booking_id: true,
          details: true,
        },
      },
    },
  });

  const clientPaymentMovements: CashboxMovement[] = clientPayments.map((cp) => {
    const clientName = `${cp.client.first_name} ${cp.client.last_name}`;
    const bookingLabel = `N° ${
      cp.booking.agency_booking_id ?? cp.booking.id_booking
    } • ${cp.booking.details}`;

    return {
      id: `client_payment:${cp.id_payment}`,
      date: cp.created_at.toISOString(),
      type: "client_debt",
      source: "client_payment",
      description: "Pago de pax pendiente",
      currency: cp.currency,
      amount: decimalToNumber(cp.amount),
      clientName,
      bookingLabel,
      dueDate: cp.due_date.toISOString(),
      // Para deudas no usamos método / cuenta
    };
  });

  /* ----------------------------
   * 4) DEUDA OPERADORES: OperatorDue
   * ---------------------------- */

  const operatorDues = await prisma.operatorDue.findMany({
    where: {
      booking: {
        id_agency: agencyId,
      },
      due_date: {
        gte: from,
        lte: to,
      },
    },
    include: {
      booking: {
        select: {
          id_booking: true,
          agency_booking_id: true,
          details: true,
        },
      },
      service: {
        select: {
          description: true,
          operator: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  const operatorDueMovements: CashboxMovement[] = operatorDues.map((od) => {
    const operatorName = od.service.operator?.name ?? null;
    const bookingLabel = `N° ${
      od.booking.agency_booking_id ?? od.booking.id_booking
    } • ${od.booking.details}`;

    const descriptionParts = [od.concept, od.service.description].filter(
      Boolean,
    );
    const description =
      descriptionParts.length > 0
        ? descriptionParts.join(" • ")
        : "Deuda con operador";

    return {
      id: `operator_due:${od.id_due}`,
      date: od.created_at.toISOString(),
      type: "operator_debt",
      source: "operator_due",
      description,
      currency: od.currency,
      amount: decimalToNumber(od.amount),
      operatorName,
      bookingLabel,
      dueDate: od.due_date.toISOString(),
      // Deuda, sin método / cuenta
    };
  });

  return [
    ...receiptMovements,
    ...investmentMovements,
    ...clientPaymentMovements,
    ...operatorDueMovements,
  ];
}

/* =========================================================
 * Acceso a datos (Prisma): saldos globales de deuda
 * ========================================================= */

async function getDebtBalances(agencyId: number): Promise<{
  clientDebtByCurrency: DebtSummary[];
  operatorDebtByCurrency: DebtSummary[];
}> {
  const accounts = await prisma.creditAccount.findMany({
    where: {
      id_agency: agencyId,
      enabled: true,
    },
    select: {
      currency: true,
      balance: true,
      client_id: true,
      operator_id: true,
    },
  });

  const clientNegMap = new Map<string, number>();
  const clientPosMap = new Map<string, number>();
  const operatorMap = new Map<string, number>();

  for (const acc of accounts) {
    const currency = acc.currency;
    const bal = decimalToNumber(acc.balance);

    if (acc.client_id != null) {
      if (bal < 0) {
        const current = clientNegMap.get(currency) ?? 0;
        clientNegMap.set(currency, current + Math.abs(bal));
      } else if (bal > 0) {
        const current = clientPosMap.get(currency) ?? 0;
        clientPosMap.set(currency, current + bal);
      }
      continue;
    }

    if (acc.operator_id != null) {
      if (bal > 0) {
        const current = operatorMap.get(currency) ?? 0;
        operatorMap.set(currency, current + bal);
      }
      continue;
    }
  }

  const clientDebtByCurrency: DebtSummary[] = [];
  const allClientCurrencies = new Set<string>([
    ...Array.from(clientNegMap.keys()),
    ...Array.from(clientPosMap.keys()),
  ]);

  allClientCurrencies.forEach((currency) => {
    const neg = clientNegMap.get(currency) ?? 0;
    const pos = clientPosMap.get(currency) ?? 0;
    const amount = neg !== 0 ? neg : pos;
    if (amount > 0) {
      clientDebtByCurrency.push({ currency, amount });
    }
  });

  const operatorDebtByCurrency: DebtSummary[] = Array.from(
    operatorMap.entries(),
  ).map(([currency, amount]) => ({ currency, amount }));

  return { clientDebtByCurrency, operatorDebtByCurrency };
}

async function getOpeningBalancesByAccount(
  agencyId: number,
  from: Date,
): Promise<{ account: string; currency: string; amount: number }[]> {
  const rows = await prisma.financeAccountOpeningBalance.findMany({
    where: {
      id_agency: agencyId,
      effective_date: {
        lte: from,
      },
    },
    include: {
      account: { select: { name: true } },
    },
    orderBy: [
      { account_id: "asc" },
      { currency: "asc" },
      { effective_date: "desc" },
    ],
  });

  const seen = new Set<string>();
  const result: { account: string; currency: string; amount: number }[] = [];

  for (const row of rows) {
    const key = `${row.account_id}::${row.currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      account: row.account?.name ?? "Sin cuenta",
      currency: row.currency,
      amount: decimalToNumber(row.amount),
    });
  }

  return result;
}

/* =========================================================
 * Handler principal
 * ========================================================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<CashboxSummaryResponse>>,
) {
  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ ok: false, error: "Método no permitido. Usá GET." });
  }

  try {
    // 1) Auth (unificado con /api/bookings)
    const auth = await getAuth(req);
    const financeGrants = await getFinanceSectionGrants(
      auth.id_agency,
      auth.id_user,
    );
    const canCashbox = canAccessFinanceSection(
      auth.role,
      financeGrants,
      "cashbox",
    );
    if (!canCashbox) {
      throw new HttpError(403, "Sin permisos.");
    }

    // 2) Params básicos (año/mes)
    const now = new Date();
    const year = getNumberFromQuery(req.query.year) ?? now.getFullYear();
    const month = getNumberFromQuery(req.query.month) ?? now.getMonth() + 1;

    const requestedAgencyId = getNumberFromQuery(req.query.agencyId);
    const isManagerOrDev =
      auth.role === "gerente" || auth.role === "desarrollador";

    const agencyId = requestedAgencyId ?? auth.id_agency;

    if (
      requestedAgencyId &&
      requestedAgencyId !== auth.id_agency &&
      !isManagerOrDev
    ) {
      throw new HttpError(
        403,
        "No tenés permisos para ver la caja de otra agencia.",
      );
    }

    if (!agencyId) {
      throw new HttpError(
        400,
        "No se pudo determinar la agencia (falta agencyId).",
      );
    }

    if (month < 1 || month > 12) {
      throw new HttpError(400, "El parámetro 'month' debe estar entre 1 y 12.");
    }

    const { from, to } = buildMonthRange(year, month);

    // 3) Config financiera
    const financeConfig = await prisma.financeConfig.findUnique({
      where: { id_agency: agencyId },
      select: {
        hide_operator_expenses_in_investments: true,
      },
    });

    const hideOperatorExpenses =
      !!financeConfig?.hide_operator_expenses_in_investments;

    // Mapa de cuentas por ID (para normalizar nombres)
    const accounts = await prisma.financeAccount.findMany({
      where: { id_agency: agencyId },
      select: { id_account: true, name: true },
    });
    const accountNameById = new Map<number, string>();
    for (const acc of accounts) {
      accountNameById.set(acc.id_account, acc.name);
    }

    // 4) Movimientos del mes
    const movements = await getMonthlyMovements(agencyId, from, to, {
      hideOperatorExpenses,
      accountNameById,
    });

    // 5) Saldos globales de deuda (pasajeros / operadores)
    const balances = await getDebtBalances(agencyId);

    // 5.1) Saldos iniciales por cuenta (hasta el inicio del mes)
    const openingBalancesByAccount = await getOpeningBalancesByAccount(
      agencyId,
      from,
    );

    // 6) Agregación / resumen
    const summary = aggregateCashbox(
      year,
      month,
      from,
      to,
      movements,
      openingBalancesByAccount,
      balances,
    );

    return res.status(200).json({ ok: true, data: summary });
  } catch (err) {
    console.error("[API /cashbox] Error:", err);

    if (err instanceof HttpError) {
      return res.status(err.status).json({
        ok: false,
        error: err.message,
      });
    }

    return res.status(500).json({
      ok: false,
      error: "Error interno al calcular la caja del mes.",
    });
  }
}
