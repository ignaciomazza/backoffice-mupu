// src/pages/api/receipts/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, JWTPayload } from "jose";

/* =========================
 * Tipos
 * ========================= */
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

type ReceiptPostBody = {
  // Opcional si el recibo pertenece a una reserva
  booking?: { id_booking?: number };

  // Datos comunes
  concept: string;
  currency?: string; // Texto libre heredado (para PDF)
  amountString: string; // "UN MILLÓN..."
  amountCurrency: string; // ISO del amount/amountString (ARS | USD | ...)
  amount: number;

  // Asociaciones
  serviceIds?: number[]; // Requerido si hay booking; vacío si es de agencia
  clientIds?: number[]; // Opcional

  // Metadatos de cobro (texto para PDF / legacy)
  payment_method?: string;
  account?: string;

  // Relación real (opcional) si tu modelo Receipt tiene account_id
  account_id?: number;

  // FX opcional (para equivalencias en PDF)
  base_amount?: number | string;
  base_currency?: string; // ISO
  counter_amount?: number | string;
  counter_currency?: string; // ISO
};

/* =========================
 * JWT / Auth
 * ========================= */
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
    const role = (p.role || "") as string | undefined;
    const email = p.email;

    // Resolver id_user por email si hace falta
    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: u.role,
          email: u.email,
        };
    }

    // Resolver id_agency si hace falta
    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u)
        return {
          id_user,
          id_agency: u.id_agency,
          role: role ?? u.role,
          email: email ?? u.email ?? undefined,
        };
    }

    return { id_user, id_agency, role, email };
  } catch {
    return null;
  }
}

/* =========================
 * Helpers
 * ========================= */
const toDec = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? undefined
    : new Prisma.Decimal(typeof v === "number" ? v : String(v));

const isNonEmptyString = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0;

async function ensureBookingInAgency(bookingId: number, agencyId: number) {
  const b = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    select: { id_booking: true, id_agency: true },
  });
  if (!b) throw new Error("La reserva no existe.");
  if (b.id_agency !== agencyId)
    throw new Error("Reserva no pertenece a tu agencia.");
}

async function nextReceiptNumberForBooking(bookingId: number) {
  const existing = await prisma.receipt.findMany({
    where: { receipt_number: { startsWith: `${bookingId}-` } },
    select: { receipt_number: true },
  });
  const used = existing
    .map((r) => parseInt(r.receipt_number.split("-")[1], 10))
    .filter((n) => Number.isFinite(n));
  const nextIdx = used.length ? Math.max(...used) + 1 : 1;
  return `${bookingId}-${nextIdx}`;
}

async function nextReceiptNumberForAgency(agencyId: number) {
  const existing = await prisma.receipt.findMany({
    where: {
      id_agency: agencyId,
      receipt_number: { startsWith: `A${agencyId}-` },
    },
    select: { receipt_number: true },
  });
  const used = existing
    .map((r) => parseInt(r.receipt_number.split("-")[1], 10))
    .filter((n) => Number.isFinite(n));
  const nextIdx = used.length ? Math.max(...used) + 1 : 1;
  return `A${agencyId}-${nextIdx}`;
}

/* =========================
 * GET /api/receipts
 * ========================= */
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authUser = await getUserFromAuth(req);
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;
    if (!authUserId || !authAgencyId)
      return res.status(401).json({ error: "No autenticado" });

    // Compatibilidad: listar por bookingId
    const bookingIdParam = Array.isArray(req.query.bookingId)
      ? req.query.bookingId[0]
      : req.query.bookingId;
    const bookingId = Number(bookingIdParam);

    if (Number.isFinite(bookingId)) {
      await ensureBookingInAgency(bookingId, authAgencyId);
      const receipts = await prisma.receipt.findMany({
        where: { booking: { id_booking: bookingId } },
        orderBy: { issue_date: "desc" },
      });
      return res.status(200).json({ receipts });
    }

    // ====== Listado mixto (reserva + agencia) ======
    const q =
      (Array.isArray(req.query.q) ? req.query.q[0] : req.query.q)?.trim() || "";

    // Filtro ISO por amount_currency (nuevo param claro)
    const amountCurrencyQuery = (
      Array.isArray(req.query.amountCurrency)
        ? req.query.amountCurrency[0]
        : req.query.amountCurrency
    )
      ?.toString()
      .toUpperCase()
      .trim();

    // Back-compat y/o texto libre
    const currencyParamRaw =
      (Array.isArray(req.query.currency)
        ? req.query.currency[0]
        : req.query.currency) ?? "";
    const currencyTextParam =
      (Array.isArray(req.query.currencyText)
        ? req.query.currencyText[0]
        : req.query.currencyText) ?? "";

    const payment_method =
      (Array.isArray(req.query.payment_method)
        ? req.query.payment_method[0]
        : req.query.payment_method) || undefined;
    const account =
      (Array.isArray(req.query.account)
        ? req.query.account[0]
        : req.query.account) || undefined;

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

    // 1) Alcance por agencia
    const agencyScope: Prisma.ReceiptWhereInput =
      Number.isFinite(ownerId) && ownerId > 0
        ? { booking: { id_agency: authAgencyId, user: { id_user: ownerId } } }
        : {
            OR: [
              { booking: { id_agency: authAgencyId } },
              { id_agency: authAgencyId },
            ],
          };

    // 2) Resto de filtros
    const whereAND: Prisma.ReceiptWhereInput[] = [agencyScope];

    if (q) {
      const maybeNum = Number(q);
      whereAND.push({
        OR: [
          { concept: { contains: q, mode: "insensitive" } },
          { amount_string: { contains: q, mode: "insensitive" } },
          { receipt_number: { contains: q, mode: "insensitive" } },
          ...(Number.isFinite(maybeNum)
            ? [
                {
                  booking: { id_booking: maybeNum },
                } as Prisma.ReceiptWhereInput,
              ]
            : []),
        ],
      });
    }

    // amount_currency (ISO)
    if (amountCurrencyQuery && /^[A-Z]{3}$/.test(amountCurrencyQuery)) {
      whereAND.push({ amount_currency: amountCurrencyQuery });
    }

    // currency back-compat:
    const currencyParam = currencyParamRaw.toString().trim();
    if (currencyParam) {
      if (/^[A-Za-z]{3}$/.test(currencyParam)) {
        // Si mandan "USD" como antes, filtramos por amount_currency (ISO)
        whereAND.push({ amount_currency: currencyParam.toUpperCase() });
      } else {
        // Si mandan texto (ej. "saldo", "caja", "macro"), buscar en currency (texto libre)
        whereAND.push({
          currency: { contains: currencyParam, mode: "insensitive" },
        });
      }
    }

    // currencyText explícito (texto libre)
    if (currencyTextParam) {
      whereAND.push({
        currency: { contains: currencyTextParam, mode: "insensitive" },
      });
    }

    if (payment_method) whereAND.push({ payment_method });
    if (account) whereAND.push({ account });

    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) range.lte = new Date(`${to}T23:59:59.999Z`);
    if (range.gte || range.lte) whereAND.push({ issue_date: range });

    const amountRange: Prisma.FloatFilter = {};
    if (Number.isFinite(minAmount)) amountRange.gte = Number(minAmount);
    if (Number.isFinite(maxAmount)) amountRange.lte = Number(maxAmount);
    if (amountRange.gte !== undefined || amountRange.lte !== undefined)
      whereAND.push({ amount: amountRange });

    const baseWhere: Prisma.ReceiptWhereInput = { AND: whereAND };

    const items = await prisma.receipt.findMany({
      where: cursorId
        ? { AND: [baseWhere, { id_receipt: { lt: cursorId } }] }
        : baseWhere,
      orderBy: { id_receipt: "desc" },
      take,
      select: {
        id_receipt: true,
        receipt_number: true,
        issue_date: true,
        amount: true,
        amount_currency: true, // ISO (clave contable)
        concept: true,
        currency: true, // Texto libre (para PDF/legado)
        payment_method: true,
        account: true,
        base_amount: true,
        base_currency: true,
        counter_amount: true,
        counter_currency: true,
        serviceIds: true,
        clientIds: true,
        booking: {
          select: {
            id_booking: true,
            user: {
              select: { id_user: true, first_name: true, last_name: true },
            },
            titular: {
              select: { id_client: true, first_name: true, last_name: true },
            },
          },
        },
        agency: { select: { id_agency: true, name: true } }, // recibos sin booking
      },
    });

    const nextCursor =
      items.length === take
        ? (items[items.length - 1]?.id_receipt ?? null)
        : null;

    return res.status(200).json({ items, nextCursor });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Error obteniendo recibos";
    return res.status(500).json({ error: msg });
  }
}

/* =========================
 * POST /api/receipts
 * ========================= */
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authUser = await getUserFromAuth(req);
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;
    if (!authUserId || !authAgencyId)
      return res.status(401).json({ error: "No autenticado" });

    if (!req.body || typeof req.body !== "object")
      return res.status(400).json({ error: "Body inválido o vacío" });

    const {
      booking,
      concept,
      currency, // Texto libre, se guarda tal cual (si no viene, se cae al ISO)
      amountString,
      amountCurrency,
      serviceIds = [],
      clientIds = [],
      amount,
      payment_method,
      account,
      base_amount,
      base_currency,
      counter_amount,
      counter_currency,
    } = req.body as ReceiptPostBody;

    // Normalizaciones ISO (solo para campos ISO)
    const amountCurrencyISO = (amountCurrency || "").toUpperCase();
    const baseCurrencyISO = base_currency
      ? base_currency.toUpperCase()
      : undefined;
    const counterCurrencyISO = counter_currency
      ? counter_currency.toUpperCase()
      : undefined;

    // booking opcional
    const bookingId = Number(booking?.id_booking);
    const hasBooking = Number.isFinite(bookingId);

    // Validaciones mínimas comunes
    if (!isNonEmptyString(concept))
      return res.status(400).json({ error: "concept es requerido" });
    if (!isNonEmptyString(amountString))
      return res.status(400).json({ error: "amountString es requerido" });
    if (!isNonEmptyString(amountCurrencyISO))
      return res
        .status(400)
        .json({ error: "amountCurrency es requerido (ISO)" });
    if (!Number.isFinite(amount))
      return res.status(400).json({ error: "amount numérico inválido" });

    // Si hay booking: validaciones de pertenencia y servicios
    if (hasBooking) {
      await ensureBookingInAgency(bookingId, authAgencyId);
      if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
        return res.status(400).json({
          error:
            "serviceIds debe tener al menos un ID para recibos con reserva",
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
        select: { titular_id: true, clients: { select: { id_client: true } } },
      });
      const allowed = new Set<number>([
        bk!.titular_id,
        ...bk!.clients.map((c) => c.id_client),
      ]);
      const badClients = clientIds.filter((id) => !allowed.has(id));
      if (badClients.length > 0) {
        return res
          .status(400)
          .json({ error: "Algún cliente no pertenece a la reserva" });
      }
    }

    // Número de recibo
    const receipt_number = hasBooking
      ? await nextReceiptNumberForBooking(bookingId)
      : await nextReceiptNumberForAgency(authAgencyId);

    // Payload Prisma
    // Payload Prisma (sin account_id)
    const data: Prisma.ReceiptCreateInput = {
      receipt_number,
      amount,
      amount_string: amountString,
      amount_currency: amountCurrencyISO, // ISO clave
      concept,
      // currency: texto libre; si no viene, caemos al ISO
      currency: isNonEmptyString(currency) ? currency : amountCurrencyISO,
      serviceIds, // siempre enviar (vacío si es de agencia)
      clientIds, // idem
      ...(payment_method ? { payment_method } : {}),
      ...(account ? { account } : {}),
      ...(toDec(base_amount) ? { base_amount: toDec(base_amount) } : {}),
      ...(baseCurrencyISO ? { base_currency: baseCurrencyISO } : {}),
      ...(toDec(counter_amount)
        ? { counter_amount: toDec(counter_amount) }
        : {}),
      ...(counterCurrencyISO ? { counter_currency: counterCurrencyISO } : {}),
      ...(hasBooking
        ? { booking: { connect: { id_booking: bookingId } } }
        : { agency: { connect: { id_agency: authAgencyId } } }),
    };

    const receipt = await prisma.receipt.create({ data });
    // 👉 ayuda a los clientes a extraer el ID sin leer el body
    res.setHeader("Location", `/api/receipts/${receipt.id_receipt}`);
    res.setHeader("X-Receipt-Id", String(receipt.id_receipt));
    return res.status(201).json({ receipt });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Error interno al crear recibo";
    return res.status(500).json({ error: msg });
  }
}

/* =========================
 * Router
 * ========================= */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
