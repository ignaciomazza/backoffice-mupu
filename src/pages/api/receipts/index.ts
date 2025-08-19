// src/pages/api/receipts/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, JWTPayload } from "jose";

// ============ Tipos ============
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
  booking: { id_booking: number };
  concept: string;

  // ojo: en tu DB "currency" es la moneda del recibo (no el método de pago)
  currency: string; // Descripcion del metodo de pago
  amountString: string; // "UN MILLON..."
  amountCurrency: string; // ARS|USD (moneda del amountString)
  amount: number; // importe numérico final
  serviceIds: number[]; // servicios involucrados
  clientIds?: number[]; // opcional

  // NUEVO: campos flexibles
  payment_method?: string; // "Efectivo", "Transferencia", etc.
  account?: string; // "Banco Galicia", "Mercado Pago", etc.

  // FX opcional (Decimal en DB)
  base_amount?: number | string;
  base_currency?: string; // ARS|USD
  counter_amount?: number | string;
  counter_currency?: string; // ARS|USD
};

// ============ JWT ============
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

// ============ Helpers ============
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
  // Leer existentes y calcular índice siguiente (tu formato: "<bookingId>-<n>")
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

// ============ GET ============
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authUser = await getUserFromAuth(req);
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;
    if (!authUserId || !authAgencyId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const bookingId = Number(
      Array.isArray(req.query.bookingId)
        ? req.query.bookingId[0]
        : req.query.bookingId,
    );
    if (!Number.isFinite(bookingId)) {
      return res.status(400).json({ error: "bookingId inválido" });
    }

    // seguridad: booking debe ser de mi agencia
    await ensureBookingInAgency(bookingId, authAgencyId);

    const receipts = await prisma.receipt.findMany({
      where: { bookingId_booking: bookingId },
      orderBy: { issue_date: "desc" },
    });

    return res.status(200).json({ receipts });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Error obteniendo recibos";
    return res.status(500).json({ error: msg });
  }
}

// ============ POST ============
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authUser = await getUserFromAuth(req);
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;
    if (!authUserId || !authAgencyId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Body inválido o vacío" });
    }

    const {
      booking,
      concept,
      currency,
      amountString,
      amountCurrency,
      serviceIds,
      clientIds = [],
      amount,
      payment_method,
      account,
      base_amount,
      base_currency,
      counter_amount,
      counter_currency,
    } = req.body as ReceiptPostBody;

    // Validaciones mínimas
    const bookingId = Number(booking?.id_booking);
    if (!Number.isFinite(bookingId)) {
      return res.status(400).json({ error: "booking.id_booking es requerido" });
    }
    if (!isNonEmptyString(concept)) {
      return res.status(400).json({ error: "concept es requerido" });
    }
    if (!isNonEmptyString(currency)) {
      return res
        .status(400)
        .json({ error: "currency (moneda del recibo) es requerido" });
    }
    if (!isNonEmptyString(amountString)) {
      return res.status(400).json({ error: "amountString es requerido" });
    }
    if (!isNonEmptyString(amountCurrency)) {
      return res.status(400).json({ error: "amountCurrency es requerido" });
    }
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
      return res
        .status(400)
        .json({ error: "serviceIds debe tener al menos un ID" });
    }
    if (!Number.isFinite(amount)) {
      return res.status(400).json({ error: "amount numérico inválido" });
    }

    // Seguridad: booking de mi agencia
    await ensureBookingInAgency(bookingId, authAgencyId);

    // Chequear que los services pertenezcan a la reserva
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

    // Si vienen clientIds, validar que estén en la reserva (titular o acompañantes)
    if (Array.isArray(clientIds) && clientIds.length > 0) {
      const bk = await prisma.booking.findUnique({
        where: { id_booking: bookingId },
        select: {
          titular_id: true,
          clients: { select: { id_client: true } },
        },
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

    // Número correlativo del recibo
    const receipt_number = await nextReceiptNumberForBooking(bookingId);

    // Construcción del payload para Prisma
    const data: Prisma.ReceiptCreateInput = {
      receipt_number,
      amount, // Float en el schema
      amount_string: amountString,
      amount_currency: amountCurrency,
      concept,
      currency, // moneda del recibo
      booking: { connect: { id_booking: bookingId } },
      serviceIds, // Int[]
      clientIds, // Int[]
      // flex
      ...(payment_method ? { payment_method } : {}),
      ...(account ? { account } : {}),
      // FX opcional (Decimals)
      ...(toDec(base_amount) ? { base_amount: toDec(base_amount) } : {}),
      ...(base_currency ? { base_currency: base_currency.toUpperCase() } : {}),
      ...(toDec(counter_amount)
        ? { counter_amount: toDec(counter_amount) }
        : {}),
      ...(counter_currency
        ? { counter_currency: counter_currency.toUpperCase() }
        : {}),
    };

    const receipt = await prisma.receipt.create({ data });
    return res.status(201).json({ receipt });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Error interno al crear recibo";
    return res.status(500).json({ error: msg });
  }
}

// ============ Router ============
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
