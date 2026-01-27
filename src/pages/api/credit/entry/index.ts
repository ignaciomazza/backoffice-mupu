// src/pages/api/credit/entry/index.ts
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

type EntryCreateBody = {
  // Opción A: identificar por cuenta
  account_id?: number;

  // Opción B: identificar por sujeto + moneda
  subject_type?: string; // "CLIENT" | "OPERATOR" (opcional, sólo validación)
  client_id?: number | null;
  operator_id?: number | null;
  currency: string;

  /**
   * amount SIEMPRE POSITIVO (la API aplica el signo según doc_type)
   * - investment -> negativo (resta saldo)
   * - receipt    -> positivo (suma saldo)
   * - otros      -> positivo (por defecto)
   */
  amount: number;
  concept: string;
  doc_type?: string | null;
  value_date?: string | null;
  reference?: string | null;

  // vínculos
  booking_id?: number | null;
  receipt_id?: number | null;
  investment_id?: number | null;
  operator_due_id?: number | null;

  // (mantengo por compatibilidad, ya no se usa para bloquear negativos)
  allowNegative?: boolean;
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
function toLocalDate(v?: string | null): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m)
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

// ----- Signo por tipo de documento -----
const DOC_SIGN: Record<string, number> = {
  investment: -1,
  receipt: 1,

  // NUEVOS: ajustes manuales
  adjust_up: 1,
  adjust_down: -1,
};

const normDoc = (s?: string | null) => (s || "").trim().toLowerCase();
function signForDocType(dt?: string | null): number {
  return DOC_SIGN[normDoc(dt)] ?? 1;
}
function decimalDelta(amountAbs: number, dt?: string | null): Prisma.Decimal {
  const sign = signForDocType(dt);
  return new Prisma.Decimal(amountAbs).mul(sign);
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

  // ===== GET: listar movimientos con filtros y cursor =====
  if (req.method === "GET") {
    try {
      const takeParam =
        safeNumber(
          Array.isArray(req.query.take) ? req.query.take[0] : req.query.take,
        ) ?? 50;
      const take = Math.min(Math.max(takeParam, 1), 200);
      const cursorParam = safeNumber(
        Array.isArray(req.query.cursor)
          ? req.query.cursor[0]
          : req.query.cursor,
      );
      const cursor = cursorParam;

      const account_id = safeNumber(
        Array.isArray(req.query.account_id)
          ? req.query.account_id[0]
          : req.query.account_id,
      );

      const client_id = safeNumber(
        Array.isArray(req.query.client_id)
          ? req.query.client_id[0]
          : req.query.client_id,
      );
      const operator_id = safeNumber(
        Array.isArray(req.query.operator_id)
          ? req.query.operator_id[0]
          : req.query.operator_id,
      );
      const currency =
        typeof req.query.currency === "string" ? req.query.currency : undefined;
      const doc_type =
        typeof req.query.doc_type === "string" ? req.query.doc_type : undefined;

      // alias legacy: subject_type=CLIENT/OPERATOR → not null filter
      const subject_type =
        typeof req.query.subject_type === "string"
          ? String(req.query.subject_type).toUpperCase()
          : undefined;

      const investment_id = safeNumber(
        Array.isArray(req.query.investment_id)
          ? req.query.investment_id[0]
          : req.query.investment_id,
      );

      let accountFilter: Prisma.CreditAccountWhereInput | undefined;

      if (client_id != null || operator_id != null || subject_type) {
        accountFilter = {
          ...(client_id != null ? { client_id } : {}),
          ...(operator_id != null ? { operator_id } : {}),
          ...(subject_type === "CLIENT"
            ? { client_id: { not: null } }
            : subject_type === "OPERATOR"
              ? { operator_id: { not: null } }
              : {}),
        };
      }

      const where: Prisma.CreditEntryWhereInput = {
        id_agency: auth.id_agency,
        ...(account_id ? { account_id } : {}),
        ...(doc_type ? { doc_type } : {}),
        ...(currency ? { currency } : {}),
        ...(investment_id ? { investment_id } : {}), // 👈 nuevo
        ...(accountFilter ? { account: accountFilter } : {}),
      };

      const items = await prisma.creditEntry.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id_entry: "desc" }],
        take: take + 1,
        ...(cursor ? { cursor: { id_entry: cursor }, skip: 1 } : {}),
        include: {
          account: {
            select: {
              id_credit_account: true,
              currency: true,
              client_id: true,
              operator_id: true,
            },
          },
        },
      });

      const hasMore = items.length > take;
      const sliced = hasMore ? items.slice(0, take) : items;
      const nextCursor = hasMore ? sliced[sliced.length - 1].id_entry : null;
      return res.status(200).json({
        items: sliced,
        nextCursor,
        // opcional: si querés consumir firmado desde el FE, descomentá:
        // signed: sliced.map(i => ({
        //   ...i,
        //   signed_amount: Number(i.amount) * signForDocType(i.doc_type)
        // })),
      });
    } catch (e) {
      console.error("[credit/entry][GET]", e);
      return res.status(500).json({ error: "Error al obtener movimientos" });
    }
  }

  // ===== POST: crear movimiento =====
  if (req.method === "POST") {
    try {
      const b = (req.body ?? {}) as Partial<EntryCreateBody>;

      const amountRaw = b.amount;
      if (
        amountRaw == null ||
        !Number.isFinite(Number(amountRaw)) ||
        Number(amountRaw) <= 0
      ) {
        return res
          .status(400)
          .json({ error: "amount es obligatorio y debe ser > 0." });
      }
      const amountAbs = Math.abs(Number(amountRaw));

      const currency = String(b.currency || "").trim();
      if (!currency)
        return res.status(400).json({ error: "currency es obligatorio." });

      const concept = String(b.concept || "").trim();
      if (!concept)
        return res.status(400).json({ error: "concept es obligatorio." });

      const doc_type = b.doc_type ? String(b.doc_type) : "manual";
      const value_date = b.value_date ? toLocalDate(b.value_date) : undefined;

      let accountId = b.account_id ? Number(b.account_id) : undefined;

      // Buscar/crear cuenta si vino sujeto+moneda
      if (!accountId) {
        const client_id = b.client_id != null ? Number(b.client_id) : undefined;
        const operator_id =
          b.operator_id != null ? Number(b.operator_id) : undefined;

        const hasClient = typeof client_id === "number";
        const hasOperator = typeof operator_id === "number";

        const legacy = String(b.subject_type || "").toUpperCase();
        if (legacy) {
          if (legacy === "CLIENT" && !hasClient) {
            return res.status(400).json({
              error:
                "subject_type=CLIENT requiere client_id (uno solo; no operator_id).",
            });
          }
          if (legacy === "OPERATOR" && !hasOperator) {
            return res.status(400).json({
              error:
                "subject_type=OPERATOR requiere operator_id (uno solo; no client_id).",
            });
          }
        }

        if (Number(hasClient) + Number(hasOperator) !== 1) {
          return res.status(400).json({
            error: "Debe indicar client_id u operator_id (uno solo).",
          });
        }

        // Validar pertenencia
        if (hasClient) {
          const c = await prisma.client.findUnique({
            where: { id_client: client_id! },
            select: { id_agency: true },
          });
          if (!c || c.id_agency !== auth.id_agency)
            return res
              .status(400)
              .json({ error: "Pax inválido para tu agencia." });
        }
        if (hasOperator) {
          const o = await prisma.operator.findUnique({
            where: { id_operator: operator_id! },
            select: { id_agency: true },
          });
          if (!o || o.id_agency !== auth.id_agency)
            return res
              .status(400)
              .json({ error: "Operador inválido para tu agencia." });
        }

        // Buscar cuenta idempotente por (sujeto + moneda)
        const acct = await prisma.creditAccount.findFirst({
          where: {
            id_agency: auth.id_agency,
            currency,
            ...(hasClient
              ? { client_id: client_id!, operator_id: null }
              : { operator_id: operator_id!, client_id: null }),
          },
        });

        if (acct) {
          accountId = acct.id_credit_account;
        } else {
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
                client_id: hasClient ? client_id! : null,
                operator_id: hasOperator ? operator_id! : null,
                currency,
                balance: new Prisma.Decimal(0),
                enabled: true,
              },
            });
          });
          accountId = created.id_credit_account;
        }
      }

      // Cargar cuenta y validar moneda/agencia
      const account = await prisma.creditAccount.findUnique({
        where: { id_credit_account: Number(accountId) },
      });
      if (!account)
        return res.status(404).json({ error: "Cuenta no encontrada." });
      if (account.id_agency !== auth.id_agency)
        return res
          .status(403)
          .json({ error: "No autorizado para esta cuenta." });
      if (account.currency !== currency) {
        return res.status(400).json({
          error: `La moneda del movimiento (${currency}) no coincide con la de la cuenta (${account.currency}).`,
        });
      }
      if (!account.enabled) {
        return res.status(400).json({ error: "La cuenta está deshabilitada." });
      }

      // Transacción: crear entry + actualizar balance con signo por doc_type
      const created = await prisma.$transaction(async (tx) => {
        const fresh = await tx.creditAccount.findUnique({
          where: { id_credit_account: account.id_credit_account },
          select: { balance: true },
        });
        if (!fresh) throw new Error("Cuenta inexistente (TX).");

        const delta = decimalDelta(amountAbs, doc_type); // +/- según doc_type
        const next = fresh.balance.add(delta);

        const agencyEntryId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "credit_entry",
        );
        const entry = await tx.creditEntry.create({
          data: {
            id_agency: auth.id_agency,
            agency_credit_entry_id: agencyEntryId,
            account_id: account.id_credit_account,
            created_by: auth.id_user,
            concept,
            amount: new Prisma.Decimal(amountAbs), // siempre positivo
            currency,
            doc_type,
            reference: b.reference ?? null,
            value_date: value_date ?? null,
            booking_id: b.booking_id ?? null,
            receipt_id: b.receipt_id ?? null,
            investment_id: b.investment_id ?? null,
            operator_due_id: b.operator_due_id ?? null,
          },
        });

        await tx.creditAccount.update({
          where: { id_credit_account: account.id_credit_account },
          data: { balance: next },
        });

        return entry;
      });

      return res.status(201).json(created);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[credit/entry][POST]", e);
      return res.status(500).json({ error: "Error al crear movimiento", msg });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
