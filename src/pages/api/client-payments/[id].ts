// src/pages/api/client-payments/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";

/** ===== Roles ===== */
const RO_WRITE = new Set(["administrativo", "gerente", "desarrollador"]);

/** ===== Auth helpers (idéntico criterio) ===== */
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

/** ===== Utils ===== */
function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
const toDec = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? undefined
    : new Prisma.Decimal(typeof v === "number" ? v : String(v));

const normStrUpdateNN = (
  v: unknown,
  opts?: { upper?: boolean; allowEmpty?: boolean },
): string | undefined => {
  if (v === null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t && !opts?.allowEmpty) return undefined;
    return opts?.upper ? t.toUpperCase() : t;
  }
  return undefined;
};

/** Acepta "YYYY-MM-DD" o ISO; si es date-only, setea medianoche UTC */
function parseDueDate(input: unknown): Date | undefined {
  if (input === null || input === undefined) return undefined;
  const s = String(input).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isFinite(d.getTime()) ? d : undefined;
  }
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

/** ===== Scoped getters ===== */
function getPaymentLite(id_payment: number, id_agency: number) {
  return prisma.clientPayment.findFirst({
    where: { id_payment, booking: { id_agency } },
    select: { id_payment: true, booking_id: true, client_id: true },
  });
}
function getPaymentFull(id_payment: number, id_agency: number) {
  return prisma.clientPayment.findFirst({
    where: { id_payment, booking: { id_agency } },
    include: {
      booking: {
        select: {
          id_booking: true,
          id_agency: true,
          titular: {
            select: { id_client: true, first_name: true, last_name: true },
          },
        },
      },
      client: {
        select: { id_client: true, first_name: true, last_name: true },
      },
    },
  });
}

/** Validación: pax debe pertenecer a la MISMA AGENCIA */
async function ensureClientInAgency(clientId: number, agencyId: number) {
  const c = await prisma.client.findUnique({
    where: { id_client: clientId },
    select: { id_client: true, id_agency: true },
  });
  if (!c) throw new Error("Pax no encontrado");
  if (c.id_agency !== agencyId)
    throw new Error("El pax no pertenece a tu agencia.");
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
      const pay = await getPaymentFull(id, auth.id_agency);
      if (!pay) return res.status(404).json({ error: "Pago no encontrado" });
      return res.status(200).json(pay);
    } catch (e) {
      console.error("[client-payments/:id][GET]", e);
      return res.status(500).json({ error: "Error al obtener el pago" });
    }
  }

  if (req.method === "PUT") {
    try {
      // Permisos: solo administración/gerencia/desarrollo pueden modificar
      if (!RO_WRITE.has(auth.role)) {
        return res
          .status(403)
          .json({ error: "No autorizado a modificar pagos del pax." });
      }

      const exists = await getPaymentLite(id, auth.id_agency);
      if (!exists) return res.status(404).json({ error: "Pago no encontrado" });

      const b = req.body ?? {};

      // ❌ Campos no-null: si viene null => 400
      if (b.currency === null)
        return res.status(400).json({ error: "currency no puede ser null" });
      if (b.amount === null)
        return res.status(400).json({ error: "amount no puede ser null" });
      if (b.client_id === null)
        return res.status(400).json({ error: "client_id no puede ser null" });
      if (b.booking_id === null)
        return res.status(400).json({ error: "booking_id no puede ser null" });
      if (b.due_date === null)
        return res.status(400).json({ error: "due_date no puede ser null" });

      // Normalizaciones
      const currency = normStrUpdateNN(b.currency, { upper: true });
      const amount = toDec(b.amount); // Decimal | undefined
      const due_date = parseDueDate(b.due_date); // Date | undefined

      // booking_id (si cambia, validar por agencia)
      let booking_id: number | undefined;
      if (b.booking_id !== undefined) {
        const bid = safeNumber(b.booking_id);
        if (!bid) return res.status(400).json({ error: "booking_id inválido" });
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

      // client_id (si cambia, validar por agencia)
      let client_id: number | undefined;
      if (b.client_id !== undefined) {
        const cid = safeNumber(b.client_id);
        if (!cid) return res.status(400).json({ error: "client_id inválido" });
        await ensureClientInAgency(cid, auth.id_agency);
        client_id = cid;
      }

      // Validaciones de valores
      if (amount !== undefined && amount.lte(0)) {
        return res.status(400).json({ error: "El monto debe ser positivo" });
      }
      if (due_date !== undefined && !Number.isFinite(due_date.getTime())) {
        return res.status(400).json({ error: "due_date inválida" });
      }

      const data: Prisma.ClientPaymentUncheckedUpdateInput = {};
      if (currency !== undefined) data.currency = currency;
      if (amount !== undefined) data.amount = amount.toDecimalPlaces(2);
      if (client_id !== undefined) data.client_id = client_id;
      if (booking_id !== undefined) data.booking_id = booking_id;
      if (due_date !== undefined) data.due_date = due_date;

      const updated = await prisma.clientPayment.update({
        where: { id_payment: id },
        data,
        include: {
          booking: { select: { id_booking: true } },
          client: {
            select: { id_client: true, first_name: true, last_name: true },
          },
        },
      });

      return res.status(200).json(updated);
    } catch (e) {
      console.error("[client-payments/:id][PUT]", e);
      const msg =
        e instanceof Error ? e.message : "Error al actualizar el pago";
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "DELETE") {
    try {
      // Permisos: solo administración/gerencia/desarrollo pueden eliminar
      if (!RO_WRITE.has(auth.role)) {
        return res
          .status(403)
          .json({ error: "No autorizado a eliminar pagos del pax." });
      }

      const exists = await getPaymentLite(id, auth.id_agency);
      if (!exists) return res.status(404).json({ error: "Pago no encontrado" });

      await prisma.clientPayment.delete({ where: { id_payment: id } });
      return res.status(204).end();
    } catch (e) {
      console.error("[client-payments/:id][DELETE]", e);
      return res.status(500).json({ error: "Error al eliminar el pago" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
