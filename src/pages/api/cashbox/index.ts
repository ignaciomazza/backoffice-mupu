import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";

/* =========================================================
 * Tipos de dominio para Cashbox
 * ========================================================= */

type DecimalLike = number | Prisma.Decimal;

type MovementKind =
  | "income" // Ingresos (cobros, recibos, etc.)
  | "expense" // Egresos (gastos, pagos, etc.)
  | "client_debt" // Deuda de clientes hacia la agencia
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

  // Saldos globales (foto actual) por moneda
  balances: {
    clientDebtByCurrency: DebtSummary[]; // lo que los clientes deben a la agencia
    operatorDebtByCurrency: DebtSummary[]; // lo que la agencia debe a operadores
  };

  // Deudas con vencimiento dentro del rango (por ahora: ClientPayment + OperatorDue)
  upcomingDue: CashboxMovement[];

  // Lista plana de movimientos del rango (ingresos, egresos, deudas del mes)
  movements: CashboxMovement[];
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/* =========================================================
 * Auth
 * ========================================================= */

type UserRole =
  | "gerente"
  | "lider"
  | "administrativo"
  | "desarrollador"
  | "vendedor";

interface AuthPayload extends JWTPayload {
  id_user: number;
  id_agency: number;
  role?: UserRole | string;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getAuth(req: NextApiRequest): Promise<AuthPayload> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Falta token de autenticación.");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new HttpError(
      500,
      "Configuración inválida del servidor (JWT_SECRET no definido).",
    );
  }

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    const typed = payload as AuthPayload;

    if (!typed.id_user || !typed.id_agency) {
      throw new HttpError(401, "Token inválido (faltan campos requeridos).");
    }

    return typed;
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
 * - Deuda clientes / operadores por moneda (puede venir override)
 * - Próximos vencimientos dentro del rango
 */
function aggregateCashbox(
  year: number,
  month: number,
  from: Date,
  to: Date,
  movements: CashboxMovement[],
  balancesOverride?: {
    clientDebtByCurrency?: DebtSummary[];
    operatorDebtByCurrency?: DebtSummary[];
  },
): CashboxSummaryResponse {
  const totalsByCurrencyMap = new Map<
    string,
    { currency: string; income: number; expenses: number }
  >();

  const clientDebtByCurrencyMap = new Map<string, number>();
  const operatorDebtByCurrencyMap = new Map<string, number>();
  const upcomingDue: CashboxMovement[] = [];

  for (const m of movements) {
    // === Totales por moneda (solo ingresos / egresos) ===
    if (!totalsByCurrencyMap.has(m.currency)) {
      totalsByCurrencyMap.set(m.currency, {
        currency: m.currency,
        income: 0,
        expenses: 0,
      });
    }

    const currentTotals = totalsByCurrencyMap.get(m.currency);
    if (!currentTotals) continue;

    if (m.type === "income") {
      currentTotals.income += m.amount;
    } else if (m.type === "expense") {
      currentTotals.expenses += m.amount;
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

  // Totales caja por moneda
  const totalsByCurrency: CurrencySummary[] = Array.from(
    totalsByCurrencyMap.values(),
  ).map((t) => ({
    ...t,
    net: t.income - t.expenses,
  }));

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
};

/**
 * Movimientos mensuales para Caja:
 * - Receipt (ingresos)
 * - Investment (egresos)
 * - ClientPayment (deuda de clientes + vencimientos)
 * - OperatorDue (deuda con operadores + vencimientos)
 */
async function getMonthlyMovements(
  agencyId: number,
  from: Date,
  to: Date,
  options: GetMonthlyMovementsOptions = {},
): Promise<CashboxMovement[]> {
  const { hideOperatorExpenses } = options;

  /* ----------------------------
   * 1) INGRESOS: Recibos
   * ---------------------------- */

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

  // Alineamos con la pantalla de Recibos:
  // ignoramos recibos soft-deleted / deshabilitados (enabled === false)
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
      ? `#${booking.id_booking} • ${booking.details}`.trim()
      : null;

    // 👇 clave: usar siempre la moneda ISO del importe (amount_currency)
    const currency =
      (r as { amount_currency?: string | null }).amount_currency ??
      r.currency ??
      "ARS";

    return {
      id: `receipt:${r.id_receipt}`,
      date: r.issue_date.toISOString(),
      type: "income",
      source: "receipt",
      description: r.concept ?? `Recibo ${r.receipt_number}`,
      currency,
      amount: decimalToNumber(r.amount),
      clientName,
      bookingLabel,
      dueDate: null,
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

  // Si está configurado ocultar gastos de operador, filtramos investments con operator_id
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
          details: true,
        },
      },
    },
  });

  const investmentMovements: CashboxMovement[] = investments.map((inv) => {
    const date = inv.paid_at ?? inv.created_at;
    const operatorName = inv.operator?.name ?? null;
    const bookingLabel = inv.booking
      ? `#${inv.booking.id_booking} • ${inv.booking.details}`
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
    };
  });

  /* ----------------------------
   * 3) DEUDA CLIENTES: ClientPayment
   *    (vencimientos del mes)
   * ---------------------------- */

  const clientPayments = await prisma.clientPayment.findMany({
    where: {
      booking: {
        id_agency: agencyId,
      },
      // Focalizamos en vencimientos dentro del rango
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
          details: true,
        },
      },
    },
  });

  const clientPaymentMovements: CashboxMovement[] = clientPayments.map((cp) => {
    const clientName = `${cp.client.first_name} ${cp.client.last_name}`;
    const bookingLabel = `#${cp.booking.id_booking} • ${cp.booking.details}`;

    return {
      id: `client_payment:${cp.id_payment}`,
      // Fecha principal: creación del registro, pero usamos también dueDate
      date: cp.created_at.toISOString(),
      type: "client_debt",
      source: "client_payment",
      description: "Pago de cliente pendiente",
      currency: cp.currency,
      amount: decimalToNumber(cp.amount),
      clientName,
      bookingLabel,
      dueDate: cp.due_date.toISOString(),
    };
  });

  /* ----------------------------
   * 4) DEUDA OPERADORES: OperatorDue
   *    (vencimientos del mes)
   * ---------------------------- */

  const operatorDues = await prisma.operatorDue.findMany({
    where: {
      booking: {
        id_agency: agencyId,
      },
      // Mismo criterio: deudas con vencimiento dentro del rango
      due_date: {
        gte: from,
        lte: to,
      },
      // Si más adelante definís status "paid"/"cancelled",
      // acá se puede filtrar solo "pendientes".
    },
    include: {
      booking: {
        select: {
          id_booking: true,
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
    const bookingLabel = `#${od.booking.id_booking} • ${od.booking.details}`;

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

/**
 * Usa CreditAccount.balance para obtener una foto global de:
 * - lo que los clientes deben a la agencia (clientDebtByCurrency)
 * - lo que la agencia debe a operadores (operatorDebtByCurrency)
 *
 * Heurística para clientes:
 * - Si hay balances < 0, se asume que esos son "cliente le debe a la agencia"
 *   (se toma el valor absoluto).
 * - Si NO hay balances < 0 para una moneda pero sí > 0, usamos los > 0 como deuda.
 */
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

    // Cuentas de clientes
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

    // Cuentas de operadores
    if (acc.operator_id != null) {
      if (bal > 0) {
        // agencia le debe al operador
        const current = operatorMap.get(currency) ?? 0;
        operatorMap.set(currency, current + bal);
      }
      continue;
    }

    // Otros tipos de cuentas se pueden manejar acá en el futuro.
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
    // 1) Auth
    const auth = await getAuth(req);

    // 2) Params básicos (año/mes)
    const now = new Date();

    const year = getNumberFromQuery(req.query.year) ?? now.getFullYear();
    const month = getNumberFromQuery(req.query.month) ?? now.getMonth() + 1;

    const requestedAgencyId = getNumberFromQuery(req.query.agencyId);
    const isManagerOrDev =
      auth.role === "gerente" || auth.role === "desarrollador";

    // Si no mandan agencyId, usamos la del token
    const agencyId = requestedAgencyId ?? auth.id_agency;

    // Si mandan agencyId distinta, solo gerente / desarrollador pueden ver otras agencias
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

    // 3) Config financiera de la agencia (para ocultar gastos de operador si corresponde)
    const financeConfig = await prisma.financeConfig.findUnique({
      where: { id_agency: agencyId },
      select: {
        hide_operator_expenses_in_investments: true,
      },
    });

    const hideOperatorExpenses =
      !!financeConfig?.hide_operator_expenses_in_investments;

    // 4) Movimientos del mes
    const movements = await getMonthlyMovements(agencyId, from, to, {
      hideOperatorExpenses,
    });

    // 5) Saldos globales de deuda (clientes / operadores)
    const balances = await getDebtBalances(agencyId);

    // 6) Agregación / resumen
    const summary = aggregateCashbox(
      year,
      month,
      from,
      to,
      movements,
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
