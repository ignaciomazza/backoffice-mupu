// src/pages/api/investments/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

/** ===== Auth helpers (unificado con otros endpoints) ===== */
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

// Mismo criterio que clients/index.ts e investments/index.ts
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

// Cookie "token" primero; luego Authorization: Bearer; luego otras cookies comunes
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

/** ===== Utils ===== */
function toLocalDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m)
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
// Igual que en receipts/investments index: Decimal opcional
const toDec = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? undefined
    : new Prisma.Decimal(typeof v === "number" ? v : String(v));
// Normaliza updates string: string -> trimmed | null -> null | else -> undefined (no tocar)
const normStrUpdate = (
  v: unknown,
  opts?: { upper?: boolean; allowEmpty?: boolean },
): string | null | undefined => {
  if (v === null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t && !opts?.allowEmpty) return undefined;
    return opts?.upper ? t.toUpperCase() : t;
  }
  return undefined;
};

// ===== Crédito operador: helpers internos (cascade) =====
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

async function removeLinkedCreditEntries(
  tx: Prisma.TransactionClient,
  investmentId: number,
  agencyId: number,
): Promise<number> {
  const entries = await tx.creditEntry.findMany({
    where: { id_agency: agencyId, investment_id: investmentId },
    select: { id_entry: true, account_id: true, amount: true, doc_type: true },
  });

  for (const e of entries) {
    const acc = await tx.creditAccount.findUnique({
      where: { id_credit_account: e.account_id },
      select: { balance: true },
    });
    if (!acc) continue;

    // Revertir el efecto que aplicó el alta: balance -= sign(dt) * amount
    const next = acc.balance.minus(deltaDecimal(Number(e.amount), e.doc_type));
    await tx.creditAccount.update({
      where: { id_credit_account: e.account_id },
      data: { balance: next },
    });

    await tx.creditEntry.delete({ where: { id_entry: e.id_entry } });
  }

  return entries.length;
}

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
    amount: Prisma.Decimal | number; // <- acepta Decimal o number
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

  // Normaliza a number (Decimal -> number)
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
      amount: new Prisma.Decimal(amountAbs), // siempre positivo
      currency: inv.currency,
      doc_type: "investment", // aplica signo negativo al balance
      reference: `INV-${inv.id_investment}`,
      value_date: inv.paid_at,
      investment_id: inv.id_investment,
    },
    select: { id_entry: true },
  });

  // Aplicar efecto en balance (investment => negativo)
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

/** ===== Scoped getters ===== */
function getInvestmentLite(id_investment: number, id_agency: number) {
  return prisma.investment.findFirst({
    where: { id_investment, id_agency },
    select: { id_investment: true },
  });
}
function getInvestmentFull(id_investment: number, id_agency: number) {
  return prisma.investment.findFirst({
    where: { id_investment, id_agency },
    include: {
      user: { select: { id_user: true, first_name: true, last_name: true } },
      operator: true,
      createdBy: {
        select: { id_user: true, first_name: true, last_name: true },
      },
      booking: { select: { id_booking: true } }, // incluir reserva asociada
    },
  });
}

/** ===== Handler ===== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await getUserFromAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  const idParam = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = safeNumber(idParam);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  if (req.method === "GET") {
    try {
      const inv = await getInvestmentFull(id, auth.id_agency);
      if (!inv)
        return res.status(404).json({ error: "Inversión no encontrada" });
      return res.status(200).json(inv);
    } catch (e) {
      console.error("[investments/:id][GET]", e);
      return res.status(500).json({ error: "Error al obtener la inversión" });
    }
  }

  if (req.method === "PUT") {
    try {
      const exists = await getInvestmentLite(id, auth.id_agency);
      if (!exists)
        return res.status(404).json({ error: "Inversión no encontrada" });

      const b = req.body ?? {};
      const category =
        typeof b.category === "string" ? b.category.trim() : undefined;
      const description =
        typeof b.description === "string" ? b.description.trim() : undefined;
      const currency =
        typeof b.currency === "string" ? b.currency.trim() : undefined;
      const amount = safeNumber(b.amount);

      const paid_at =
        b.paid_at === null
          ? null
          : b.paid_at !== undefined
            ? toLocalDate(String(b.paid_at))
            : undefined;

      const operator_id =
        b.operator_id === null ? null : safeNumber(b.operator_id);
      const user_id = b.user_id === null ? null : safeNumber(b.user_id);

      // booking_id editable (validamos agencia si viene)
      let booking_id: number | null | undefined = undefined;
      if (b.booking_id !== undefined) {
        if (b.booking_id === null) {
          booking_id = null;
        } else {
          const bid = safeNumber(b.booking_id);
          if (!bid) {
            return res
              .status(400)
              .json({ error: "booking_id inválido (debe ser numérico)" });
          }
          const bkg = await prisma.booking.findFirst({
            where: { id_booking: bid, id_agency: auth.id_agency },
            select: { id_booking: true },
          });
          if (!bkg) {
            return res.status(400).json({
              error: "La reserva no existe o no pertenece a tu agencia",
            });
          }
          booking_id = bid;
        }
      }

      // método de pago / cuenta (acepta string o null para limpiar)
      const payment_method = normStrUpdate(b.payment_method);
      const account = normStrUpdate(b.account);

      // conversión (acepta Decimal o null para limpiar)
      const base_amount =
        b.base_amount === null
          ? null
          : (toDec(b.base_amount) as Prisma.Decimal | undefined);
      const counter_amount =
        b.counter_amount === null
          ? null
          : (toDec(b.counter_amount) as Prisma.Decimal | undefined);
      const base_currency = normStrUpdate(b.base_currency, { upper: true });
      const counter_currency = normStrUpdate(b.counter_currency, {
        upper: true,
      });

      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
        return res.status(400).json({ error: "El monto debe ser positivo" });
      }
      if (b.paid_at !== undefined && paid_at === undefined) {
        return res.status(400).json({ error: "Fecha de pago inválida" });
      }

      // Reglas por categoría si se envía cambio de categoría
      const nextCat = (category ?? "").toLowerCase();
      if (
        nextCat === "operador" &&
        b.operator_id !== undefined &&
        operator_id == null
      ) {
        return res.status(400).json({
          error: "Para categoría Operador, operator_id es obligatorio",
        });
      }
      if (
        ["sueldo", "comision"].includes(nextCat) &&
        b.user_id !== undefined &&
        user_id == null
      ) {
        return res
          .status(400)
          .json({ error: "Para Sueldo/Comision, user_id es obligatorio" });
      }

      // === TX: actualizar la inversión + (re)sincronizar cuenta de crédito si corresponde
      const updated = await prisma.$transaction(async (tx) => {
        // 1) Traigo el estado previo (opcional; útil para auditoría si la sumás)
        const before = await tx.investment.findFirst({
          where: { id_investment: id, id_agency: auth.id_agency },
          select: {
            id_investment: true,
            category: true,
            description: true,
            currency: true,
            amount: true,
            paid_at: true,
            operator_id: true,
            payment_method: true,
          },
        });
        if (!before) throw new Error("Inversión no encontrada (TX)");

        // 2) Actualizo investment
        const data: Prisma.InvestmentUncheckedUpdateInput = {};
        if (category !== undefined) data.category = category;
        if (description !== undefined) data.description = description;
        if (currency !== undefined) data.currency = currency;
        if (amount !== undefined) data.amount = amount;
        if (paid_at !== undefined) data.paid_at = paid_at;
        if (operator_id !== undefined) data.operator_id = operator_id;
        if (user_id !== undefined) data.user_id = user_id;
        if (booking_id !== undefined) data.booking_id = booking_id;

        if (payment_method !== undefined) data.payment_method = payment_method;
        if (account !== undefined) data.account = account;

        if (base_amount !== undefined) data.base_amount = base_amount;
        if (base_currency !== undefined)
          data.base_currency = base_currency || undefined;
        if (counter_amount !== undefined) data.counter_amount = counter_amount;
        if (counter_currency !== undefined)
          data.counter_currency = counter_currency || undefined;

        const after = await tx.investment.update({
          where: { id_investment: id },
          data,
          include: {
            user: {
              select: { id_user: true, first_name: true, last_name: true },
            },
            operator: true,
            createdBy: {
              select: { id_user: true, first_name: true, last_name: true },
            },
            booking: { select: { id_booking: true } },
          },
        });

        // 3) Cascade: limpiar movimientos previos vinculados a esta investment
        await removeLinkedCreditEntries(
          tx,
          after.id_investment,
          auth.id_agency,
        );

        // 4) Si ahora corresponde, crear movimiento de crédito (investment => negativo)
        if (
          shouldHaveCreditEntry({
            category: after.category,
            operator_id: after.operator_id,
            payment_method: after.payment_method ?? undefined,
          })
        ) {
          if (!after.operator_id) {
            throw new Error(
              "Para Crédito operador se requiere operator_id definido.",
            );
          }
          await createCreditEntryForInvestment(
            tx,
            auth.id_agency,
            auth.id_user,
            {
              id_investment: after.id_investment,
              agency_investment_id: after.agency_investment_id,
              operator_id: after.operator_id,
              currency: after.currency,
              amount: after.amount,
              description: after.description,
              paid_at: after.paid_at,
            },
          );
        }

        return after;
      });

      return res.status(200).json(updated);
    } catch (e) {
      console.error("[investments/:id][PUT]", e);
      return res
        .status(500)
        .json({ error: "Error al actualizar la inversión" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const exists = await getInvestmentLite(id, auth.id_agency);
      if (!exists)
        return res.status(404).json({ error: "Inversión no encontrada" });

      await prisma.$transaction(async (tx) => {
        // 1) Borrar entries de CC vinculados y revertir sus efectos en el balance
        await removeLinkedCreditEntries(tx, id, auth.id_agency);
        // 2) Borrar la inversión
        await tx.investment.delete({ where: { id_investment: id } });
      });

      return res.status(204).end();
    } catch (e) {
      console.error("[investments/:id][DELETE]", e);
      return res.status(500).json({ error: "Error al eliminar la inversión" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
