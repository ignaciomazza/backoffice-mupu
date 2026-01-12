// src/pages/api/operator-dues/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { jwtVerify, JWTPayload } from "jose";

/** ===== Roles ===== */
const RO_CREATE = new Set([
  "vendedor",
  "administrativo",
  "gerente",
  "desarrollador",
]);

// ========= Tipos =========
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

type OperatorDuePostBody = {
  bookingId: number;
  serviceId: number;
  dueDate: string; // "YYYY-MM-DD" o ISO
  concept: string;
  status: string; // "Pendiente" | "Pago" (libre)
  amount: number | string; // Decimal(18,2) en DB
  currency: string; // "ARS" | "USD" | libre
};

// ========= JWT =========
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

// ========= Helpers =========
const toDec = (v: unknown) =>
  new Prisma.Decimal(typeof v === "number" ? v : String(v));

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

async function ensureBookingInAgency(bookingId: number, agencyId: number) {
  const b = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    select: { id_booking: true, id_agency: true },
  });
  if (!b) throw new Error("La reserva no existe.");
  if (b.id_agency !== agencyId)
    throw new Error("La reserva no pertenece a tu agencia.");
}

async function ensureServiceBelongsToBooking(
  serviceId: number,
  bookingId: number,
) {
  const svc = await prisma.service.findUnique({
    where: { id_service: serviceId },
    select: { booking_id: true },
  });
  if (!svc || svc.booking_id !== bookingId) {
    throw new Error("El servicio no pertenece a la reserva indicada.");
  }
}

// ========= GET =========
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authUser = await getUserFromAuth(req);
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;
    if (!authUserId || !authAgencyId)
      return res.status(401).json({ error: "No autenticado" });

    const bookingId = Number(
      Array.isArray(req.query.bookingId)
        ? req.query.bookingId[0]
        : req.query.bookingId,
    );
    if (!Number.isFinite(bookingId))
      return res.status(400).json({ error: "bookingId inválido" });

    await ensureBookingInAgency(bookingId, authAgencyId);

    const dues = await prisma.operatorDue.findMany({
      where: { booking_id: bookingId },
      orderBy: [{ due_date: "asc" }, { id_due: "asc" }],
    });

    return res.status(200).json({ dues });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Error obteniendo vencimientos";
    return res.status(500).json({ error: msg });
  }
}

// ========= POST =========
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authUser = await getUserFromAuth(req);
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;
    const role = (authUser?.role || "").toLowerCase();
    if (!authUserId || !authAgencyId)
      return res.status(401).json({ error: "No autenticado" });

    // Permisos: vendedores (y superiores) pueden crear
    if (!RO_CREATE.has(role)) {
      return res
        .status(403)
        .json({ error: "No autorizado a crear cuotas al operador." });
    }

    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Body inválido o vacío" });
    }

    const { bookingId, serviceId, dueDate, concept, status, amount, currency } =
      req.body as OperatorDuePostBody;

    const bId = Number(bookingId);
    const sId = Number(serviceId);
    if (!Number.isFinite(bId))
      return res.status(400).json({ error: "bookingId es requerido" });
    if (!Number.isFinite(sId))
      return res.status(400).json({ error: "serviceId es requerido" });
    if (!concept || typeof concept !== "string")
      return res.status(400).json({ error: "concept es requerido" });
    if (!status || typeof status !== "string")
      return res.status(400).json({ error: "status es requerido" });
    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({ error: "amount es requerido" });
    }
    if (!currency || typeof currency !== "string") {
      return res.status(400).json({ error: "currency es requerido" });
    }

    // fecha
    const parsedDue = toLocalDate(dueDate);
    if (!parsedDue) return res.status(400).json({ error: "dueDate inválida" });

    // seguridad
    await ensureBookingInAgency(bId, authAgencyId);
    await ensureServiceBelongsToBooking(sId, bId);

    // validación de monto positivo
    const decAmount = toDec(amount).toDecimalPlaces(2);
    if (decAmount.lte(0)) {
      return res.status(400).json({ error: "El monto debe ser > 0" });
    }

    // crear
    const created = await prisma.$transaction(async (tx) => {
      const agencyDueId = await getNextAgencyCounter(
        tx,
        authAgencyId,
        "operator_due",
      );

      return tx.operatorDue.create({
        data: {
          agency_operator_due_id: agencyDueId,
          id_agency: authAgencyId,
          booking_id: bId,
          service_id: sId,
          due_date: parsedDue,
          concept: concept.trim(),
          status: status.trim(),
          amount: decAmount,
          currency: currency.trim().toUpperCase(),
        },
      });
    });

    return res.status(201).json({ due: created, success: true });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Error creando vencimiento";
    return res.status(500).json({ error: msg });
  }
}

// ========= Router =========
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
