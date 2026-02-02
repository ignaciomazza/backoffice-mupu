// src/pages/api/investments/recurring/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
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
      if (u) {
        return {
          id_user,
          id_agency: u.id_agency,
          role: role || u.role.toLowerCase(),
          email: email ?? u.email ?? undefined,
        };
      }
    }

    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true },
      });
      if (u) {
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role.toLowerCase(),
          email,
        };
      }
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
  return Number.isNaN(d.getTime()) ? undefined : d;
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
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

  const idParam = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = safeNumber(idParam);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  if (req.method === "GET") {
    try {
      const item = await prisma.recurringInvestment.findFirst({
        where: { id_recurring: id, id_agency: auth.id_agency },
        include: {
          user: { select: { id_user: true, first_name: true, last_name: true } },
          operator: { select: { id_operator: true, name: true } },
          createdBy: {
            select: { id_user: true, first_name: true, last_name: true },
          },
        },
      });
      if (!item)
        return res.status(404).json({ error: "Gasto automático no encontrado" });
      return res.status(200).json(item);
    } catch (e) {
      console.error("[investments/recurring/:id][GET]", e);
      return res.status(500).json({ error: "Error al obtener gasto automático" });
    }
  }

  if (req.method === "PUT") {
    try {
      const existing = await prisma.recurringInvestment.findFirst({
        where: { id_recurring: id, id_agency: auth.id_agency },
        select: { id_recurring: true },
      });
      if (!existing)
        return res.status(404).json({ error: "Gasto automático no encontrado" });

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

      if (categoryIsOperator && !operator_id) {
        return res.status(400).json({
          error: "Para categoría Operador, operator_id es obligatorio",
        });
      }
      if (["sueldo", "comision"].includes(category.toLowerCase()) && !user_id) {
        return res
          .status(400)
          .json({ error: "Para Sueldo/Comision, user_id es obligatorio" });
      }

      const active = typeof b.active === "boolean" ? b.active : true;

      const updated = await prisma.recurringInvestment.update({
        where: { id_recurring: id },
        data: {
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
          ...(payment_method ? { payment_method } : { payment_method: null }),
          ...(account ? { account } : { account: null }),
          ...(base_amount ? { base_amount } : { base_amount: null }),
          ...(base_currency ? { base_currency } : { base_currency: null }),
          ...(counter_amount ? { counter_amount } : { counter_amount: null }),
          ...(counter_currency ? { counter_currency } : { counter_currency: null }),
        },
        include: {
          user: { select: { id_user: true, first_name: true, last_name: true } },
          operator: { select: { id_operator: true, name: true } },
          createdBy: {
            select: { id_user: true, first_name: true, last_name: true },
          },
        },
      });

      return res.status(200).json(updated);
    } catch (e) {
      console.error("[investments/recurring/:id][PUT]", e);
      return res
        .status(500)
        .json({ error: "Error al actualizar gasto automático" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const existing = await prisma.recurringInvestment.findFirst({
        where: { id_recurring: id, id_agency: auth.id_agency },
        select: { id_recurring: true },
      });
      if (!existing)
        return res.status(404).json({ error: "Gasto automático no encontrado" });

      await prisma.recurringInvestment.delete({ where: { id_recurring: id } });
      return res.status(204).end();
    } catch (e) {
      console.error("[investments/recurring/:id][DELETE]", e);
      return res
        .status(500)
        .json({ error: "Error al eliminar gasto automático" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
