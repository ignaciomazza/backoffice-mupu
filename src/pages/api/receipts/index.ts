// src/pages/api/receipts/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, JWTPayload } from "jose";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { encodePublicId } from "@/lib/publicIds";
import {
  canAccessBookingByRole,
  getBookingComponentGrants,
  getFinanceSectionGrants,
} from "@/lib/accessControl";
import {
  normalizeReceiptVerificationRules,
  pickReceiptVerificationRule,
  ruleHasRestrictions,
} from "@/utils/receiptVerification";
import {
  canAccessBookingComponent,
  canAccessFinanceSection,
} from "@/utils/permissions";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";

/* ======================================================
 * Tipos
 * ====================================================== */

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

type DecodedUser = {
  id_user?: number;
  role?: string;
  id_agency?: number;
  email?: string;
};

// Línea de pago (NUEVO, con IDs)
export type ReceiptPaymentLine = {
  amount: number | string;
  payment_method_id: number;
  account_id?: number;

  // ✅ nuevo (no se persiste en ReceiptPayment, se usa para el FE)
  operator_id?: number;
};

// Respuesta normalizada (para no romper recibos viejos)
export type ReceiptPaymentOut = {
  amount: number;
  payment_method_id: number | null;
  account_id: number | null;

  // extras legacy para UI/PDF si existían como texto
  payment_method_text?: string;
  account_text?: string;
};

type ReceiptPaymentLineIn = {
  amount: unknown;
  payment_method_id: unknown;
  account_id?: unknown;
  operator_id?: unknown;
};

type ReceiptPaymentLineNormalized = {
  amount: number;
  payment_method_id: number;
  account_id?: number;
  operator_id?: number;
};

type ReceiptPostBody = {
  // Opcional si el recibo pertenece a una reserva
  booking?: { id_booking?: number };

  // Datos comunes
  concept: string;
  currency?: string; // Texto libre (para PDF / legacy)
  amountString: string; // "UN MILLÓN..."
  amountCurrency: string; // ISO del amount/amountString (ARS | USD | ...)
  amount: number | string;
  issue_date?: string;

  // NUEVO: pagos múltiples (si viene esto, el amount total sale de la suma)
  payments?: ReceiptPaymentLineIn[];

  // Costo financiero del medio de pago (misma moneda que amountCurrency)
  payment_fee_amount?: number | string;

  // Asociaciones
  serviceIds?: number[];
  clientIds?: number[];

  // Metadatos legacy (texto)
  payment_method?: string;
  account?: string;

  // legacy ids a nivel Receipt (existen en tu schema)
  payment_method_id?: number;
  account_id?: number;

  // FX opcional
  base_amount?: number | string;
  base_currency?: string;
  counter_amount?: number | string;
  counter_currency?: string;
};

/* ======================================================
 * JWT / Auth
 * ====================================================== */

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
): Promise<DecodedUser | null> {
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
    const role = p.role || "" || undefined;
    const email = p.email;

    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (u) {
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role,
          email: u.email,
        };
      }
    }

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

    return { id_user, id_agency, role, email };
  } catch {
    return null;
  }
}

/* ======================================================
 * Helpers
 * ====================================================== */

const toDec = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? undefined
    : new Prisma.Decimal(typeof v === "number" ? v : String(v));

const isNonEmptyString = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0;

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? NaN);
  return n;
};

function toLocalDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd)
    return new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      0,
      0,
      0,
      0,
    );
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

const toOptionalId = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number(v ?? NaN);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  return i > 0 ? i : undefined;
};

function normalizePaymentsFromReceipt(r: unknown): ReceiptPaymentOut[] {
  if (!r || typeof r !== "object") return [];

  const obj = r as Record<string, unknown>;
  const rel = Array.isArray(obj.payments) ? obj.payments : [];

  if (rel.length > 0) {
    return rel.map((p) => {
      const pay = (p ?? {}) as Record<string, unknown>;
      const pm = Number(pay.payment_method_id);
      const acc = Number(pay.account_id);
      return {
        amount: Number(pay.amount ?? 0),
        payment_method_id: Number.isFinite(pm) && pm > 0 ? pm : null,
        account_id: Number.isFinite(acc) && acc > 0 ? acc : null,
      };
    });
  }

  const amt = toNum(obj.amount);
  const pmText = String(obj.payment_method ?? "").trim();
  const accText = String(obj.account ?? "").trim();

  const pmIdRaw = Number(obj.payment_method_id);
  const accIdRaw = Number(obj.account_id);

  const pmId = Number.isFinite(pmIdRaw) && pmIdRaw > 0 ? pmIdRaw : null;
  const accId = Number.isFinite(accIdRaw) && accIdRaw > 0 ? accIdRaw : null;

  if (Number.isFinite(amt) && (pmText || accText || pmId || accId)) {
    return [
      {
        amount: amt,
        payment_method_id: pmId,
        account_id: accId,
        ...(pmText ? { payment_method_text: pmText } : {}),
        ...(accText ? { account_text: accText } : {}),
      },
    ];
  }

  return [];
}

async function ensureBookingInAgency(
  bookingId: number,
  agencyId: number,
): Promise<{ id_booking: number; id_agency: number; id_user: number }> {
  const b = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    select: { id_booking: true, id_agency: true, id_user: true },
  });

  if (!b) throw new Error("La reserva no existe.");
  if (b.id_agency !== agencyId)
    throw new Error("La reserva no pertenece a tu agencia.");
  return b;
}

async function nextReceiptNumberForBooking(bookingId: number) {
  const existing = await prisma.receipt.findMany({
    where: { receipt_number: { startsWith: `${bookingId}-` } },
    select: { receipt_number: true },
  });

  const used = existing
    .map((r) => parseInt(String(r.receipt_number).split("-")[1], 10))
    .filter((n) => Number.isFinite(n));

  const nextIdx = used.length ? Math.max(...used) + 1 : 1;
  return `${bookingId}-${nextIdx}`;
}

async function nextReceiptNumberForAgency(agencyId: number) {
  const existing = await prisma.receipt.findMany({
    where: {
      receipt_number: { startsWith: `A${agencyId}-` },
    },
    select: { receipt_number: true },
  });

  const used = existing
    .map((r) => parseInt(String(r.receipt_number).split("-")[1], 10))
    .filter((n) => Number.isFinite(n));

  const nextIdx = used.length ? Math.max(...used) + 1 : 1;
  return `A${agencyId}-${nextIdx}`;
}

/* ======================================================
 * GET /api/receipts
 * ====================================================== */

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authUser = await getUserFromAuth(req);
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;
    const authRole = authUser?.role ?? "";

    if (!authUserId || !authAgencyId) {
      return res.status(401).json({ error: "No autenticado" });
    }
    const auth = authUser as DecodedUser;

    // ====== Modo detalle: por booking ======
    const bookingIdParam = Array.isArray(req.query.bookingId)
      ? req.query.bookingId[0]
      : req.query.bookingId;
    const bookingId = Number(bookingIdParam);

    const financeGrants = await getFinanceSectionGrants(
      authAgencyId,
      authUserId,
    );
    const canReceipts = canAccessFinanceSection(
      authRole,
      financeGrants,
      "receipts",
    );
    const canVerify = canAccessFinanceSection(
      authRole,
      financeGrants,
      "receipts_verify",
    );
    const needsBookingScope = Number.isFinite(bookingId);
    let canBookingReceipts = false;
    if (!canReceipts && !canVerify && needsBookingScope) {
      const bookingGrants = await getBookingComponentGrants(
        authAgencyId,
        authUserId,
      );
      canBookingReceipts = canAccessBookingComponent(
        authRole,
        bookingGrants,
        "receipts_form",
      );
    }

    if (Number.isFinite(bookingId)) {
      const booking = await ensureBookingInAgency(bookingId, authAgencyId);
      const canReadByRole = await canAccessBookingByRole(auth, booking);
      if (!canReceipts && !canVerify && !canBookingReceipts && !canReadByRole) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      const receipts = await prisma.receipt.findMany({
        where: { booking: { id_booking: bookingId } },
        orderBy: { issue_date: "desc" },
        include: { payments: true },
      });

      const normalized = receipts.map((r) => ({
        ...r,
        public_id:
          r.agency_receipt_id != null
            ? encodePublicId({
                t: "receipt",
                a: r.id_agency ?? authAgencyId,
                i: r.agency_receipt_id,
              })
            : null,
        payments: normalizePaymentsFromReceipt(r),
      }));

      return res.status(200).json({ receipts: normalized });
    }
    if (!canReceipts && !canVerify) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    // ====== Listado mixto (por filtros) ======
    const q =
      (Array.isArray(req.query.q) ? req.query.q[0] : req.query.q)?.trim() || "";

    const amountCurrencyQuery = (
      Array.isArray(req.query.amountCurrency)
        ? req.query.amountCurrency[0]
        : req.query.amountCurrency
    )
      ?.toString()
      .toUpperCase()
      .trim();

    const currencyParamRaw =
      (Array.isArray(req.query.currency)
        ? req.query.currency[0]
        : req.query.currency) ?? "";

    const currencyTextParam =
      (Array.isArray(req.query.currencyText)
        ? req.query.currencyText[0]
        : req.query.currencyText) ?? "";

    // legacy filtros por texto (Receipt.payment_method / Receipt.account)
    const payment_method_text =
      (Array.isArray(req.query.payment_method)
        ? req.query.payment_method[0]
        : req.query.payment_method) || undefined;

    const account_text =
      (Array.isArray(req.query.account)
        ? req.query.account[0]
        : req.query.account) || undefined;

    // NUEVO filtros por IDs (ReceiptPayment)
    const payment_method_id = Number(
      Array.isArray(req.query.payment_method_id)
        ? req.query.payment_method_id[0]
        : req.query.payment_method_id,
    );

    const account_id = Number(
      Array.isArray(req.query.account_id)
        ? req.query.account_id[0]
        : req.query.account_id,
    );

    const ownerId = Number(
      Array.isArray(req.query.userId) ? req.query.userId[0] : req.query.userId,
    );

    const from =
      (Array.isArray(req.query.from) ? req.query.from[0] : req.query.from) ||
      "";
    const to =
      (Array.isArray(req.query.to) ? req.query.to[0] : req.query.to) || "";

    const minAmount = Number(
      Array.isArray(req.query.minAmount)
        ? req.query.minAmount[0]
        : req.query.minAmount,
    );
    const maxAmount = Number(
      Array.isArray(req.query.maxAmount)
        ? req.query.maxAmount[0]
        : req.query.maxAmount,
    );

    const associationParamRaw = Array.isArray(req.query.association)
      ? req.query.association[0]
      : req.query.association;
    const association = String(associationParamRaw || "")
      .trim()
      .toLowerCase();

    const verificationStatusRaw = Array.isArray(req.query.verification_status)
      ? req.query.verification_status[0]
      : Array.isArray(req.query.verificationStatus)
        ? req.query.verificationStatus[0]
        : req.query.verification_status ?? req.query.verificationStatus ?? "";

    const verificationStatus = String(verificationStatusRaw || "")
      .trim()
      .toUpperCase();

    const verificationScopeRaw = Array.isArray(req.query.verification_scope)
      ? req.query.verification_scope[0]
      : Array.isArray(req.query.verify_scope)
        ? req.query.verify_scope[0]
        : Array.isArray(req.query.verificationScope)
          ? req.query.verificationScope[0]
          : req.query.verification_scope ??
            req.query.verify_scope ??
            req.query.verificationScope ??
            "";

    const verificationScope = ["1", "true", "yes", "on"].includes(
      String(verificationScopeRaw || "")
        .trim()
        .toLowerCase(),
    );

    if (verificationScope || verificationStatus) {
      const planAccess = await ensurePlanFeatureAccess(
        authAgencyId,
        "receipts_verify",
      );
      if (!planAccess.allowed) {
        return res.status(403).json({ error: "Plan insuficiente" });
      }
    }

    const take = Math.max(
      1,
      Math.min(
        200,
        Number(
          Array.isArray(req.query.take) ? req.query.take[0] : req.query.take,
        ) || 120,
      ),
    );

    const cursorId = Number(
      Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor,
    );

    // 1) Alcance por agencia / usuario
    const agencyScope: Prisma.ReceiptWhereInput =
      Number.isFinite(ownerId) && ownerId > 0
        ? { booking: { id_agency: authAgencyId, user: { id_user: ownerId } } }
        : {
            OR: [
              { booking: { id_agency: authAgencyId } },
              { id_agency: authAgencyId },
            ],
          };

    const whereAND: Prisma.ReceiptWhereInput[] = [agencyScope];

    // 2) Búsqueda libre
    if (q) {
      const maybeNum = Number(q);
      whereAND.push({
        OR: [
          { concept: { contains: q, mode: "insensitive" } },
          { amount_string: { contains: q, mode: "insensitive" } },
          { receipt_number: { contains: q, mode: "insensitive" } },
          ...(Number.isFinite(maybeNum)
            ? [{ agency_receipt_id: maybeNum }]
            : []),
          ...(Number.isFinite(maybeNum)
            ? [
                { booking: { id_booking: maybeNum } },
                { booking: { agency_booking_id: maybeNum } },
              ]
            : []),
        ],
      });
    }

    // 3) Filtros por moneda / texto
    if (amountCurrencyQuery && /^[A-Z]{3}$/.test(amountCurrencyQuery)) {
      whereAND.push({ amount_currency: amountCurrencyQuery });
    }

    const currencyParam = currencyParamRaw.toString().trim();
    if (currencyParam) {
      if (/^[A-Za-z]{3}$/.test(currencyParam)) {
        whereAND.push({ amount_currency: currencyParam.toUpperCase() });
      } else {
        whereAND.push({
          currency: { contains: currencyParam, mode: "insensitive" },
        });
      }
    }

    if (currencyTextParam) {
      whereAND.push({
        currency: { contains: currencyTextParam, mode: "insensitive" },
      });
    }

    // 3bis) filtros legacy texto
    if (payment_method_text)
      whereAND.push({ payment_method: payment_method_text });
    if (account_text) whereAND.push({ account: account_text });

    // 3ter) filtros nuevos por IDs (payments)
    if (Number.isFinite(payment_method_id) && payment_method_id > 0) {
      whereAND.push({ payments: { some: { payment_method_id } } });
    }
    if (Number.isFinite(account_id) && account_id > 0) {
      whereAND.push({ payments: { some: { account_id } } });
    }

    // 4) Rango de fechas
    const dateRange: Prisma.DateTimeFilter = {};
    if (from) dateRange.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) dateRange.lte = new Date(`${to}T23:59:59.999Z`);
    if (dateRange.gte || dateRange.lte)
      whereAND.push({ issue_date: dateRange });

    // 5) Rango de importes (total del recibo)
    const amountRange: Prisma.FloatFilter = {};
    if (Number.isFinite(minAmount)) amountRange.gte = Number(minAmount);
    if (Number.isFinite(maxAmount)) amountRange.lte = Number(maxAmount);
    if (amountRange.gte !== undefined || amountRange.lte !== undefined) {
      whereAND.push({ amount: amountRange });
    }

    if (association === "linked" || association === "associated") {
      whereAND.push({ bookingId_booking: { not: null } });
    } else if (
      association === "unlinked" ||
      association === "unassociated" ||
      association === "none"
    ) {
      whereAND.push({ bookingId_booking: null });
    }

    if (verificationStatus && verificationStatus !== "ALL") {
      if (["PENDING", "VERIFIED"].includes(verificationStatus)) {
        whereAND.push({ verification_status: verificationStatus });
      }
    }

    if (verificationScope) {
      const config = await prisma.financeConfig.findFirst({
        where: { id_agency: authAgencyId },
        select: { receipt_verification_rules: true },
      });
      const rules = normalizeReceiptVerificationRules(
        config?.receipt_verification_rules,
      );
      const rule = pickReceiptVerificationRule(rules, authUserId);

      if (rule && ruleHasRestrictions(rule)) {
        if (rule.payment_method_ids.length > 0) {
          whereAND.push({
            OR: [
              { payment_method_id: { in: rule.payment_method_ids } },
              {
                payments: {
                  some: {
                    payment_method_id: { in: rule.payment_method_ids },
                  },
                },
              },
            ],
          });
        }

        if (rule.account_ids.length > 0) {
          whereAND.push({
            OR: [
              { account_id: { in: rule.account_ids } },
              {
                payments: {
                  some: {
                    account_id: { in: rule.account_ids },
                  },
                },
              },
            ],
          });
        }
      }
    }

    const baseWhere: Prisma.ReceiptWhereInput = { AND: whereAND };

    const items = await prisma.receipt.findMany({
      where: cursorId
        ? { AND: [baseWhere, { id_receipt: { lt: cursorId } }] }
        : baseWhere,
      orderBy: { id_receipt: "desc" },
      take,
      select: {
        id_receipt: true,
        agency_receipt_id: true,
        receipt_number: true,
        issue_date: true,
        amount: true,
        amount_string: true,
        amount_currency: true,
        payment_fee_amount: true,
        verification_status: true,
        verified_at: true,
        verified_by: true,

        concept: true,
        currency: true,

        // legacy (Receipt)
        payment_method: true,
        account: true,
        payment_method_id: true,
        account_id: true,

        base_amount: true,
        base_currency: true,
        counter_amount: true,
        counter_currency: true,
        serviceIds: true,
        clientIds: true,

        // NUEVO (ReceiptPayment)
        payments: {
          select: {
            id_receipt_payment: true,
            amount: true,
            payment_method_id: true,
            account_id: true,
          },
        },

        booking: {
          select: {
            id_booking: true,
            agency_booking_id: true,
            user: {
              select: { id_user: true, first_name: true, last_name: true },
            },
            titular: {
              select: { id_client: true, first_name: true, last_name: true },
            },
          },
        },
        verifiedBy: {
          select: { id_user: true, first_name: true, last_name: true },
        },
        agency: { select: { id_agency: true, name: true } },
      },
    });

    const normalized = items.map((r) => {
      const public_id =
        r.agency_receipt_id != null
          ? encodePublicId({
              t: "receipt",
              a: r.agency?.id_agency ?? authAgencyId,
              i: r.agency_receipt_id,
            })
          : null;
      const bookingPublicId =
        r.booking?.agency_booking_id != null
          ? encodePublicId({
              t: "booking",
              a: authAgencyId,
              i: r.booking.agency_booking_id,
            })
          : null;
      return {
        ...r,
        public_id,
        booking: r.booking
          ? { ...r.booking, public_id: bookingPublicId }
          : r.booking,
        payments: normalizePaymentsFromReceipt(r),
      };
    });

    const nextCursor =
      items.length === take
        ? (items[items.length - 1]?.id_receipt ?? null)
        : null;

    return res.status(200).json({ items: normalized, nextCursor });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Error obteniendo recibos";
    const stack = error instanceof Error ? error.stack : undefined;
    // eslint-disable-next-line no-console
    console.error("[API] GET /api/receipts error:", { msg, stack });
    return res.status(500).json({ error: msg });
  }
}

/* ======================================================
 * POST /api/receipts
 * ====================================================== */

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
    const authUser = await getUserFromAuth(req);
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;
    const authRole = authUser?.role ?? "";

    if (!authUserId || !authAgencyId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const financeGrants = await getFinanceSectionGrants(
      authAgencyId,
      authUserId,
    );
    const canReceipts = canAccessFinanceSection(
      authRole,
      financeGrants,
      "receipts",
    );
    let canReceiptsForm = false;
    if (!canReceipts) {
      const bookingGrants = await getBookingComponentGrants(
        authAgencyId,
        authUserId,
      );
      canReceiptsForm = canAccessBookingComponent(
        authRole,
        bookingGrants,
        "receipts_form",
      );
    }

    if (!canReceipts && !canReceiptsForm) {
      return res.status(403).json({ error: "Sin permisos" });
    }

  const rawBody = req.body;
  // eslint-disable-next-line no-console
  console.log("[API] POST /api/receipts raw body:", rawBody);

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return res.status(400).json({ error: "Body inválido o vacío" });
  }

  const {
    booking,
    concept,
    currency,
    amountString,
    amountCurrency,
    serviceIds = [],
    clientIds = [],
    amount,
    issue_date,
    payments,
    payment_fee_amount,

    // legacy
    payment_method,
    account,
    payment_method_id,
    account_id,

    base_amount,
    base_currency,
    counter_amount,
    counter_currency,
  } = rawBody as ReceiptPostBody;

  const amountCurrencyISO = (amountCurrency || "").toUpperCase();
  const baseCurrencyISO = base_currency
    ? base_currency.toUpperCase()
    : undefined;
  const counterCurrencyISO = counter_currency
    ? counter_currency.toUpperCase()
    : undefined;

  const bookingId = Number(booking?.id_booking);
  const hasBooking = Number.isFinite(bookingId);

  if (!isNonEmptyString(concept)) {
    return res.status(400).json({ error: "concept es requerido" });
  }
  if (!isNonEmptyString(amountString)) {
    return res.status(400).json({ error: "amountString es requerido" });
  }
  if (!isNonEmptyString(amountCurrencyISO)) {
    return res.status(400).json({ error: "amountCurrency es requerido (ISO)" });
  }

  const parsedIssueDate = issue_date ? toLocalDate(issue_date) : undefined;
  if (issue_date && !parsedIssueDate) {
    return res.status(400).json({ error: "issue_date inválida" });
  }

  // ---- NUEVO: validar pagos múltiples si vienen
  const hasPayments = Array.isArray(payments) && payments.length > 0;

  let normalizedPayments: ReceiptPaymentLineNormalized[] = [];

  if (Array.isArray(payments) && payments.length > 0) {
    normalizedPayments = payments.map((p) => ({
      amount: toNum(p.amount),
      payment_method_id: Number(p.payment_method_id),
      account_id: toOptionalId(p.account_id),
      operator_id: toOptionalId(p.operator_id),
    }));

    const invalid = normalizedPayments.find(
      (p) =>
        !Number.isFinite(p.amount) ||
        p.amount <= 0 ||
        !Number.isFinite(p.payment_method_id) ||
        p.payment_method_id <= 0,
    );

    if (invalid) {
      return res.status(400).json({
        error:
          "payments inválido: cada línea debe tener amount > 0 y payment_method_id válido",
      });
    }
  }

  // amount total
  const legacyAmountNum = toNum(amount);
  const amountNum = hasPayments
    ? normalizedPayments.reduce((acc, p) => acc + Number(p.amount), 0)
    : legacyAmountNum;

  if (!Number.isFinite(amountNum)) {
    return res.status(400).json({ error: "amount numérico inválido" });
  }

  try {
    // Si hay booking: validar pertenencia y servicios
    if (hasBooking) {
      await ensureBookingInAgency(bookingId, authAgencyId);

      if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
        return res.status(400).json({
          error:
            "serviceIds debe tener al menos un ID para recibos asociados a una reserva",
        });
      }

      const services = await prisma.service.findMany({
        where: { id_service: { in: serviceIds }, booking_id: bookingId },
        select: { id_service: true },
      });
      const okServiceIds = new Set(services.map((s) => s.id_service));
      const badServices = serviceIds.filter((id) => !okServiceIds.has(id));

      if (badServices.length > 0) {
        return res
          .status(400)
          .json({ error: "Algún servicio no pertenece a la reserva" });
      }
    }

    // Validar clientIds contra la reserva (solo si hay booking)
    if (hasBooking && Array.isArray(clientIds) && clientIds.length > 0) {
      const bk = await prisma.booking.findUnique({
        where: { id_booking: bookingId },
        select: {
          titular_id: true,
          clients: { select: { id_client: true } },
        },
      });

      if (!bk) {
        return res.status(400).json({ error: "La reserva no existe" });
      }

      const allowed = new Set<number>();
      if (bk.titular_id) allowed.add(bk.titular_id);
      bk.clients.forEach((c) => allowed.add(c.id_client));

      const badClients = clientIds.filter((id) => !allowed.has(id));

      if (badClients.length > 0) {
        return res
          .status(400)
          .json({ error: "Algún pax no pertenece a la reserva" });
      }
    }

    const receipt_number = hasBooking
      ? await nextReceiptNumberForBooking(bookingId)
      : await nextReceiptNumberForAgency(authAgencyId);

    // legacy fields: si hay payments => seteo ids a nivel Receipt (primera línea)
    const legacyPmId = hasPayments
      ? normalizedPayments[0].payment_method_id
      : Number.isFinite(Number(payment_method_id)) &&
          Number(payment_method_id) > 0
        ? Number(payment_method_id)
        : undefined;

    const legacyAccId = hasPayments
      ? normalizedPayments[0].account_id
      : Number.isFinite(Number(account_id)) && Number(account_id) > 0
        ? Number(account_id)
        : undefined;

    const data: Prisma.ReceiptCreateInput = {
      receipt_number,
      concept,
      amount: amountNum,
      amount_string: amountString,
      amount_currency: amountCurrencyISO,
      currency: isNonEmptyString(currency) ? currency : amountCurrencyISO,
      serviceIds,
      clientIds,
      issue_date: parsedIssueDate ?? new Date(),

      // legacy texto (para no romper listados viejos)
      ...(isNonEmptyString(payment_method) ? { payment_method } : {}),
      ...(isNonEmptyString(account) ? { account } : {}),

      // ids a nivel Receipt (existen en tu schema)
      ...(legacyPmId ? { payment_method_id: legacyPmId } : {}),
      ...(legacyAccId ? { account_id: legacyAccId ?? undefined } : {}),

      ...(toDec(base_amount) ? { base_amount: toDec(base_amount) } : {}),
      ...(baseCurrencyISO ? { base_currency: baseCurrencyISO } : {}),
      ...(toDec(counter_amount)
        ? { counter_amount: toDec(counter_amount) }
        : {}),
      ...(counterCurrencyISO ? { counter_currency: counterCurrencyISO } : {}),
      ...(toDec(payment_fee_amount)
        ? { payment_fee_amount: toDec(payment_fee_amount) }
        : {}),

      agency: { connect: { id_agency: authAgencyId } },
      ...(hasBooking
        ? { booking: { connect: { id_booking: bookingId } } }
        : {}),
    };

    // ---- Crear recibo + payments en transacción
    const createdReceipt = await prisma.$transaction(async (tx) => {
      const agencyReceiptId = await getNextAgencyCounter(
        tx,
        authAgencyId,
        "receipt",
      );
      const created = await tx.receipt.create({
        data: {
          ...data,
          agency_receipt_id: agencyReceiptId,
        },
      });

      if (hasPayments) {
        await tx.receiptPayment.createMany({
          data: normalizedPayments.map((p) => ({
            receipt_id: created.id_receipt,
            amount: new Prisma.Decimal(Number(p.amount)),
            payment_method_id: Number(p.payment_method_id),
            account_id: p.account_id ? Number(p.account_id) : null,
          })),
        });
      } else {
        // Si no vinieron payments, no forzamos crear ReceiptPayment (así no “cambiás” históricos)
        // Si después querés “uniformar”, lo hacemos con un script/migración controlada.
      }

      return created;
    });

    res.setHeader("Location", `/api/receipts/${createdReceipt.id_receipt}`);
    res.setHeader("X-Receipt-Id", String(createdReceipt.id_receipt));

    const full = await prisma.receipt.findUnique({
      where: { id_receipt: createdReceipt.id_receipt },
      include: { payments: true },
    });

    const createdPublicId =
      createdReceipt.agency_receipt_id != null
        ? encodePublicId({
            t: "receipt",
            a: authAgencyId,
            i: createdReceipt.agency_receipt_id,
          })
        : null;

    return res.status(201).json({
      receipt: full
        ? {
            ...full,
            public_id: createdPublicId,
            payments: normalizePaymentsFromReceipt(full),
          }
        : { ...createdReceipt, public_id: createdPublicId },
    });
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.log("[API] POST /api/receipts error:", error);
    const msg =
      error instanceof Error ? error.message : "Error interno al crear recibo";
    return res.status(500).json({ error: msg });
  }
}

/* ======================================================
 * Router principal
 * ====================================================== */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
