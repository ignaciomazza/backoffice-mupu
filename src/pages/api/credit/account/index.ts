// src/pages/api/credit/account/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";

/* ================== Tipos ================== */
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

type AccountCreateBody = {
  client_id?: number | null;
  operator_id?: number | null;
  currency: string;
  enabled?: boolean;
  initial_balance?: number | string; // <-- NUEVO
};

/* ================== Constantes ================== */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

/* ================== Helpers ================== */
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
    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role, email: email ?? undefined };
  } catch {
    return null;
  }
}

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/* ================== Handler ================== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ error: "No autenticado o token inválido." });
  }

  const planAccess = await ensurePlanFeatureAccess(
    auth.id_agency,
    "credits",
  );
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canCredits = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "credits",
  );
  if (!canCredits) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  // ===== GET: listar =====
  if (req.method === "GET") {
    try {
      const takeParam =
        safeNumber(
          Array.isArray(req.query.take) ? req.query.take[0] : req.query.take,
        ) ?? 24;
      const take = Math.min(Math.max(takeParam, 1), 100);
      const cursorParam = safeNumber(
        Array.isArray(req.query.cursor)
          ? req.query.cursor[0]
          : req.query.cursor,
      );
      const cursor = cursorParam;

      const client_id = safeNumber(req.query.client_id);
      const operator_id = safeNumber(req.query.operator_id);
      const currency =
        typeof req.query.currency === "string" ? req.query.currency : undefined;
      const enabledStr =
        typeof req.query.enabled === "string" ? req.query.enabled : undefined;
      const enabled =
        enabledStr === undefined ? undefined : enabledStr === "true";

      const where: Prisma.CreditAccountWhereInput = {
        id_agency: auth.id_agency,
        ...(typeof client_id === "number" ? { client_id } : {}),
        ...(typeof operator_id === "number" ? { operator_id } : {}),
        ...(currency ? { currency } : {}),
        ...(enabled === undefined ? {} : { enabled }),
      };

      const items = await prisma.creditAccount.findMany({
        where,
        orderBy: [{ updated_at: "desc" }, { id_credit_account: "desc" }],
        take: take + 1,
        ...(cursor ? { cursor: { id_credit_account: cursor }, skip: 1 } : {}),
        include: {
          client: {
            select: { id_client: true, first_name: true, last_name: true },
          },
          operator: { select: { id_operator: true, name: true } },
          _count: { select: { entries: true } },
        },
      });

      const hasMore = items.length > take;
      const sliced = hasMore ? items.slice(0, take) : items;
      const nextCursor = hasMore
        ? sliced[sliced.length - 1].id_credit_account
        : null;

      return res.status(200).json({ items: sliced, nextCursor });
    } catch (e) {
      console.error("[credit/account][GET]", e);
      return res
        .status(500)
        .json({ error: "Error al obtener cuentas de crédito" });
    }
  }

  // ===== POST: crear =====
  if (req.method === "POST") {
    try {
      const body = (req.body ?? {}) as Partial<AccountCreateBody>;
      const currency = String(body.currency || "").trim();
      const client_id =
        body.client_id != null ? Number(body.client_id) : undefined;
      const operator_id =
        body.operator_id != null ? Number(body.operator_id) : undefined;
      const enabled = body.enabled == null ? true : Boolean(body.enabled);

      // ----- Balance inicial -----
      const rawInitialBalance = body.initial_balance;
      const hasInitialBalance =
        rawInitialBalance !== undefined &&
        rawInitialBalance !== null &&
        rawInitialBalance !== "";

      const initialBalanceNumber = hasInitialBalance
        ? Number(rawInitialBalance)
        : 0;

      if (hasInitialBalance && !Number.isFinite(initialBalanceNumber)) {
        return res
          .status(400)
          .json({ error: "initial_balance debe ser un número válido." });
      }

      if (!currency) {
        return res.status(400).json({ error: "currency es obligatorio." });
      }
      if (!client_id && !operator_id) {
        return res
          .status(400)
          .json({ error: "Debe tener pax u operador." });
      }
      if (client_id && operator_id) {
        return res
          .status(400)
          .json({ error: "No puede tener ambos (pax y operador)." });
      }

      // Validar pertenencia
      if (client_id) {
        const c = await prisma.client.findUnique({
          where: { id_client: client_id },
          select: { id_agency: true },
        });
        if (!c || c.id_agency !== auth.id_agency)
          return res
            .status(400)
            .json({ error: "Pax inválido para tu agencia." });
      }
      if (operator_id) {
        const o = await prisma.operator.findUnique({
          where: { id_operator: operator_id },
          select: { id_agency: true },
        });
        if (!o || o.id_agency !== auth.id_agency)
          return res
            .status(400)
            .json({ error: "Operador inválido para tu agencia." });
      }

      const existing = await prisma.creditAccount.findFirst({
        where: {
          id_agency: auth.id_agency,
          client_id: client_id ?? null,
          operator_id: operator_id ?? null,
          currency,
        },
      });
      if (existing) return res.status(200).json(existing);

      const created = await prisma.$transaction(async (tx) => {
        const agencyAccountId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "credit_account",
        );
        return tx.creditAccount.create({
          data: {
            id_agency: auth.id_agency,
            agency_credit_account_id: agencyAccountId,
            client_id: client_id ?? null,
            operator_id: operator_id ?? null,
            currency,
            balance: new Prisma.Decimal(initialBalanceNumber),
            enabled,
          },
        });
      });

      return res.status(201).json(created);
    } catch (e) {
      console.error("[credit/account][POST]", e);
      return res
        .status(500)
        .json({ error: "Error al crear cuenta de crédito" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
