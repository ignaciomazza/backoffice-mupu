// src/pages/api/investments/recurring/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";
import { hasSchemaColumn } from "@/lib/schemaColumns";

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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

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

const toDec = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? undefined
    : new Prisma.Decimal(typeof v === "number" ? v : String(v));

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const normSoft = (s?: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

async function getOperatorCategoryNames(
  agencyId: number,
): Promise<string[]> {
  const hasScope = await hasSchemaColumn("ExpenseCategory", "scope");
  const rows = await prisma.expenseCategory.findMany({
    where: hasScope
      ? {
          id_agency: agencyId,
          scope: "INVESTMENT",
          requires_operator: true,
        }
      : { id_agency: agencyId, requires_operator: true },
    select: { name: true },
  });
  return rows.map((r) => r.name).filter((n) => typeof n === "string");
}

async function getUserCategoryNames(agencyId: number): Promise<string[]> {
  const hasScope = await hasSchemaColumn("ExpenseCategory", "scope");
  const rows = await prisma.expenseCategory.findMany({
    where: hasScope
      ? {
          id_agency: agencyId,
          scope: "INVESTMENT",
          requires_user: true,
        }
      : { id_agency: agencyId, requires_user: true },
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

function buildUserCategorySet(names: string[]): Set<string> {
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

function isUserCategoryName(name: string, userCategorySet?: Set<string>) {
  const n = normSoft(name);
  if (!n) return false;
  if (
    n === "sueldo" ||
    n === "sueldos" ||
    n === "comision" ||
    n === "comisiones"
  )
    return true;
  return userCategorySet ? userCategorySet.has(n) : false;
}

function parseDayOfMonth(v: unknown): number | undefined {
  const n = safeNumber(v);
  if (!n) return undefined;
  const day = Math.floor(n);
  if (day < 1 || day > 31) return undefined;
  return day;
}

function parseIntervalMonths(v: unknown): number {
  const n = safeNumber(v);
  if (!n) return 1;
  const months = Math.floor(n);
  if (months < 1 || months > 12) return 1;
  return months;
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  const planAccess = await ensurePlanFeatureAccess(
    auth.id_agency,
    "investments",
  );
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canInvestments = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "investments",
  );
  if (!canInvestments) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  try {
    const items = await prisma.recurringInvestment.findMany({
      where: { id_agency: auth.id_agency },
      include: {
        user: { select: { id_user: true, first_name: true, last_name: true } },
        operator: { select: { id_operator: true, name: true } },
        createdBy: { select: { id_user: true, first_name: true, last_name: true } },
      },
      orderBy: { id_recurring: "desc" },
    });
    return res.status(200).json(items);
  } catch (e) {
    console.error("[investments/recurring][GET]", e);
    return res.status(500).json({ error: "Error al obtener gastos automáticos" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const auth = await getUserFromAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  const planAccess = await ensurePlanFeatureAccess(
    auth.id_agency,
    "investments",
  );
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canInvestments = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "investments",
  );
  if (!canInvestments) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  try {
    const b = req.body ?? {};
    const category = String(b.category ?? "").trim();
    const description = String(b.description ?? "").trim();
    const currency = String(b.currency ?? "").trim().toUpperCase();
    const amount = Number(b.amount);

    if (!category || !description || !currency || !Number.isFinite(amount)) {
      return res.status(400).json({
        error: "category, description, currency y amount son obligatorios",
      });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: "El monto debe ser positivo" });
    }

    const day_of_month =
      parseDayOfMonth(b.day_of_month ?? b.dayOfMonth) ?? undefined;
    if (!day_of_month) {
      return res
        .status(400)
        .json({ error: "day_of_month inválido (1-31)" });
    }

    const interval_months = parseIntervalMonths(
      b.interval_months ?? b.intervalMonths,
    );

    const start_date =
      toLocalDate(
        typeof b.start_date === "string" ? b.start_date : b.startDate,
      ) ?? new Date();

    const operator_id = Number.isFinite(Number(b.operator_id))
      ? Number(b.operator_id)
      : undefined;
    const user_id = Number.isFinite(Number(b.user_id))
      ? Number(b.user_id)
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

    const operatorCategoryNames = await getOperatorCategoryNames(auth.id_agency);
    const operatorCategorySet = buildOperatorCategorySet(
      operatorCategoryNames,
    );
    const categoryIsOperator = isOperatorCategoryName(
      category,
      operatorCategorySet,
    );
    const userCategoryNames = await getUserCategoryNames(auth.id_agency);
    const userCategorySet = buildUserCategorySet(userCategoryNames);
    const categoryIsUser = isUserCategoryName(category, userCategorySet);

    if (categoryIsOperator && !operator_id) {
      return res
        .status(400)
        .json({ error: "Para categoría Operador, operator_id es obligatorio" });
    }
    if (categoryIsUser && !user_id) {
      return res.status(400).json({
        error: "Para categorías con usuario, user_id es obligatorio",
      });
    }

    const active = typeof b.active === "boolean" ? b.active : true;

    const created = await prisma.$transaction(async (tx) => {
      const agencyRecurringId = await getNextAgencyCounter(
        tx,
        auth.id_agency,
        "recurring_investment",
      );
      return tx.recurringInvestment.create({
        data: {
          id_agency: auth.id_agency,
          agency_recurring_investment_id: agencyRecurringId,
          category,
          description,
          amount,
          currency,
          start_date,
          day_of_month,
          interval_months,
          active,
          operator_id: operator_id ?? null,
          user_id: user_id ?? null,
          created_by: auth.id_user,
          ...(payment_method ? { payment_method } : {}),
          ...(account ? { account } : {}),
          ...(base_amount ? { base_amount } : {}),
          ...(base_currency ? { base_currency } : {}),
          ...(counter_amount ? { counter_amount } : {}),
          ...(counter_currency ? { counter_currency } : {}),
        },
        include: {
          user: { select: { id_user: true, first_name: true, last_name: true } },
          operator: { select: { id_operator: true, name: true } },
          createdBy: {
            select: { id_user: true, first_name: true, last_name: true },
          },
        },
      });
    });

    return res.status(201).json(created);
  } catch (e) {
    console.error("[investments/recurring][POST]", e);
    return res.status(500).json({ error: "Error al crear gasto automático" });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
