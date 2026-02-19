// src/pages/api/operator-dues/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { parseDateInputInBuenosAires } from "@/lib/buenosAiresDate";

/** ===== Roles (política): sólo administrativo/gerente/desarrollador pueden EDITAR o ELIMINAR ===== */
const RO_MUTATE = new Set(["administrativo", "gerente", "desarrollador"]);

/** ===== Auth helpers (idéntico criterio a otros endpoints) ===== */
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
function toLocalDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const parsed = parseDateInputInBuenosAires(v);
  return parsed ?? undefined;
}
function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
const toDec = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? undefined
    : new Prisma.Decimal(typeof v === "number" ? v : String(v));

// No-null normalizer: nunca devuelve null (sólo string | undefined)
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

/** ===== Scoped getters ===== */
// Chequea que el due pertenezca a una booking de la agencia
function getDueLite(id_due: number, id_agency: number) {
  return prisma.operatorDue.findFirst({
    where: { id_due, booking: { id_agency } },
    select: { id_due: true, booking_id: true, service_id: true },
  });
}
function getDueFull(id_due: number, id_agency: number) {
  return prisma.operatorDue.findFirst({
    where: { id_due, booking: { id_agency } },
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
      service: {
        select: {
          id_service: true,
          type: true,
          description: true,
          currency: true,
          sale_price: true,
          booking_id: true,
        },
      },
    },
  });
}

async function ensureServiceInBooking(serviceId: number, bookingId: number) {
  const svc = await prisma.service.findFirst({
    where: { id_service: serviceId, booking_id: bookingId },
    select: { id_service: true },
  });
  if (!svc) {
    throw new Error("El servicio no pertenece a la reserva indicada.");
  }
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
      const due = await getDueFull(id, auth.id_agency);
      if (!due)
        return res.status(404).json({ error: "Vencimiento no encontrado" });
      return res.status(200).json(due);
    } catch (e) {
      console.error("[operator-dues/:id][GET]", e);
      return res.status(500).json({ error: "Error al obtener el vencimiento" });
    }
  }

  if (req.method === "PUT") {
    try {
      // Permisos: sólo roles elevados pueden modificar
      if (!RO_MUTATE.has(auth.role)) {
        return res
          .status(403)
          .json({ error: "No autorizado a modificar vencimientos." });
      }

      const exists = await getDueLite(id, auth.id_agency);
      if (!exists)
        return res.status(404).json({ error: "Vencimiento no encontrado" });

      const b = req.body ?? {};

      // ❌ Campos no-null: si viene null => 400
      if (b.concept === null)
        return res.status(400).json({ error: "concept no puede ser null" });
      if (b.status === null)
        return res.status(400).json({ error: "status no puede ser null" });
      if (b.currency === null)
        return res.status(400).json({ error: "currency no puede ser null" });
      if (b.amount === null)
        return res.status(400).json({ error: "amount no puede ser null" });
      if (b.due_date === null)
        return res.status(400).json({ error: "due_date no puede ser null" });
      if (b.service_id === null)
        return res.status(400).json({ error: "service_id no puede ser null" });
      if (b.booking_id === null)
        return res.status(400).json({ error: "booking_id no puede ser null" });

      // Normalizaciones (sin nulls)
      const concept = normStrUpdateNN(b.concept);
      const status = normStrUpdateNN(b.status);
      const currency = normStrUpdateNN(b.currency, { upper: true });
      const amount = toDec(b.amount); // Decimal | undefined

      // due_date (Date | undefined)
      let due_date: Date | undefined;
      if (b.due_date !== undefined) {
        const d = toLocalDate(String(b.due_date));
        if (!d)
          return res
            .status(400)
            .json({ error: "Fecha de vencimiento inválida" });
        due_date = d;
      }

      // booking_id (opcional, pero no null). Validar agencia.
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

      // service_id (si cambia, validar pertenencia a la booking destino)
      let service_id: number | undefined;
      if (b.service_id !== undefined) {
        const sid = safeNumber(b.service_id);
        if (!sid) return res.status(400).json({ error: "service_id inválido" });

        const targetBookingId =
          booking_id !== undefined ? booking_id : exists.booking_id;

        await ensureServiceInBooking(sid, targetBookingId);
        service_id = sid;
      }

      // Validaciones de negocio
      if (amount !== undefined && amount.lte(0)) {
        return res.status(400).json({ error: "El monto debe ser positivo" });
      }

      const data: Prisma.OperatorDueUncheckedUpdateInput = {};
      if (concept !== undefined) data.concept = concept;
      if (status !== undefined) data.status = status;
      if (currency !== undefined) data.currency = currency;
      if (amount !== undefined) data.amount = amount.toDecimalPlaces(2);
      if (due_date !== undefined) data.due_date = due_date;
      if (service_id !== undefined) data.service_id = service_id;
      if (booking_id !== undefined) data.booking_id = booking_id;

      const updated = await prisma.operatorDue.update({
        where: { id_due: id },
        data,
        include: {
          booking: { select: { id_booking: true } },
          service: { select: { id_service: true, booking_id: true } },
        },
      });

      return res.status(200).json(updated);
    } catch (e) {
      console.error("[operator-dues/:id][PUT]", e);
      return res
        .status(500)
        .json({ error: "Error al actualizar el vencimiento" });
    }
  }

  if (req.method === "DELETE") {
    try {
      // Permisos: sólo roles elevados pueden eliminar
      if (!RO_MUTATE.has(auth.role)) {
        return res
          .status(403)
          .json({ error: "No autorizado a eliminar vencimientos." });
      }

      const exists = await getDueLite(id, auth.id_agency);
      if (!exists)
        return res.status(404).json({ error: "Vencimiento no encontrado" });

      await prisma.operatorDue.delete({ where: { id_due: id } });
      return res.status(204).end();
    } catch (e) {
      console.error("[operator-dues/:id][DELETE]", e);
      return res
        .status(500)
        .json({ error: "Error al eliminar el vencimiento" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
