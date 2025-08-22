// src/pages/api/client-payments/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, JWTPayload } from "jose";

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

type ClientPaymentsPostBody = {
  bookingId: number;
  clientId: number;
  count?: number; // si no se envían 'amounts', usamos esto
  amount: number | string; // total
  currency: string; // "ARS" | "USD" (o libre)
  amounts?: Array<number | string>; // montos por cuota (length = n)
  dueDates: string[]; // ISO o "YYYY-MM-DD" (length = n) -> NUEVO OBLIGATORIO
};

// ========= Roles =========
const RO_CREATE = new Set([
  "vendedor",
  "administrativo",
  "gerente",
  "desarrollador",
]);

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

// ========= Helpers =========
async function ensureBookingInAgency(bookingId: number, agencyId: number) {
  const b = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    select: { id_booking: true, id_agency: true },
  });
  if (!b) throw new Error("La reserva no existe.");
  if (b.id_agency !== agencyId)
    throw new Error("La reserva no pertenece a tu agencia.");
}

async function ensureClientInAgency(clientId: number, agencyId: number) {
  const c = await prisma.client.findUnique({
    where: { id_client: clientId },
    select: { id_client: true, id_agency: true },
  });
  if (!c) throw new Error("El cliente no existe.");
  if (c.id_agency !== agencyId)
    throw new Error("El cliente no pertenece a tu agencia.");
}

/** Acepta "YYYY-MM-DD" o cualquier ISO Date string válido. Devuelve Date UTC a medianoche si es date-only. */
function parseDueDate(input: string): Date | null {
  const s = String(input ?? "").trim();
  if (!s) return null;
  // "YYYY-MM-DD" -> medianoche UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
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

    const payments = await prisma.clientPayment.findMany({
      where: { booking_id: bookingId },
      orderBy: [{ due_date: "asc" }, { id_payment: "asc" }],
    });

    return res.status(200).json({ payments });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Error obteniendo pagos";
    return res.status(500).json({ error: msg });
  }
}

// ========= POST =========
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const authUser = await getUserFromAuth(req);
    const authUserId = authUser?.id_user;
    const authAgencyId = authUser?.id_agency;
    const role = String(authUser?.role || "").toLowerCase();
    if (!authUserId || !authAgencyId)
      return res.status(401).json({ error: "No autenticado" });

    // Permisos: vendedores también pueden crear
    if (!RO_CREATE.has(role)) {
      return res
        .status(403)
        .json({ error: "No autorizado a crear pagos del cliente." });
    }

    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Body inválido o vacío" });
    }

    const {
      bookingId,
      clientId,
      count = 1,
      amount,
      currency,
      amounts,
      dueDates, // <<< nuevo requerido
    } = req.body as ClientPaymentsPostBody;

    const bId = Number(bookingId);
    const cId = Number(clientId);
    if (!Number.isFinite(bId))
      return res.status(400).json({ error: "bookingId es requerido" });
    if (!Number.isFinite(cId))
      return res.status(400).json({ error: "clientId es requerido" });

    if (amount === undefined || amount === null || amount === "")
      return res.status(400).json({ error: "amount es requerido" });

    if (!currency || typeof currency !== "string")
      return res.status(400).json({ error: "currency es requerido" });

    // Seguridad: reserva y cliente deben ser de la misma agencia
    await ensureBookingInAgency(bId, authAgencyId);
    await ensureClientInAgency(cId, authAgencyId);

    // Determinar n (cantidad de cuotas)
    const hasAmounts = Array.isArray(amounts);
    const n = hasAmounts
      ? (amounts as unknown[]).length
      : Math.max(1, Number(count || 1));

    // dueDates requerido y debe tener n elementos
    if (!Array.isArray(dueDates) || dueDates.length !== n) {
      return res.status(400).json({
        error: "Debés enviar 'dueDates' con exactamente una fecha por cuota.",
      });
    }

    // Parseo de fechas
    const dueDatesParsed: Date[] = [];
    for (let i = 0; i < n; i++) {
      const parsed = parseDueDate(dueDates[i]);
      if (!parsed) {
        return res.status(400).json({
          error: `La fecha de la cuota N°${i + 1} es inválida.`,
        });
      }
      dueDatesParsed.push(parsed);
    }

    const cur = currency.trim().toUpperCase();

    // =========================
    // Distribución de montos
    // =========================
    let perInstallmentDecimals: Prisma.Decimal[] = [];

    if (hasAmounts) {
      // Usamos montos personalizados
      const parsed = (amounts as Array<number | string>).map((x, i) => {
        const d = new Prisma.Decimal(typeof x === "number" ? x : String(x));
        if (d.lte(0)) {
          throw new Error(`Monto de la cuota N°${i + 1} debe ser > 0.`);
        }
        return d.toDecimalPlaces(2);
      });

      // Validamos contra el total (tolerancia 1 centavo)
      const totalFromArray = parsed.reduce(
        (acc, d) => acc.plus(d),
        new Prisma.Decimal(0),
      );
      const totalFromBody = new Prisma.Decimal(
        typeof amount === "number" ? amount : String(amount),
      ).toDecimalPlaces(2);

      const diffCents = totalFromArray
        .minus(totalFromBody)
        .mul(100)
        .abs()
        .toNumber();

      if (diffCents >= 1) {
        return res.status(400).json({
          error:
            "La suma de los montos por cuota no coincide con el monto total.",
        });
      }

      perInstallmentDecimals = parsed;
    } else {
      // Reparto equitativo sin pérdida por redondeo
      const total = new Prisma.Decimal(
        typeof amount === "number" ? amount : String(amount),
      ).toDecimalPlaces(2);

      const totalCents = total.mul(100); // en centavos
      const base = totalCents.div(n).floor(); // centavos base por cuota
      const remainder = totalCents.minus(base.mul(n)).toNumber(); // 0..n-1

      perInstallmentDecimals = Array.from({ length: n }, (_, i) => {
        const cents = base.plus(i < remainder ? 1 : 0);
        return cents.div(100).toDecimalPlaces(2);
      });
    }

    // =========================
    // Persistencia
    // =========================
    const created = await prisma.$transaction(async (tx) => {
      const items = [];
      for (let i = 0; i < n; i++) {
        const it = await tx.clientPayment.create({
          data: {
            booking_id: bId,
            client_id: cId,
            amount: perInstallmentDecimals[i], // Decimal(18,2)
            currency: cur,
            due_date: dueDatesParsed[i],
          },
        });
        items.push(it);
      }
      return items;
    });

    return res.status(201).json({ payments: created, success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error creando pagos";
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
