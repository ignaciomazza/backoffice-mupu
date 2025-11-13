// src/pages/api/receipts/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { jwtVerify, JWTPayload } from "jose";

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

// Seguridad: aceptar recibos con booking o con agencia
async function ensureReceiptInAgency(receiptId: number, agencyId: number) {
  const r = await prisma.receipt.findUnique({
    where: { id_receipt: receiptId },
    select: {
      id_receipt: true,
      id_agency: true,
      booking: { select: { id_agency: true } },
    },
  });
  if (!r) throw new Error("Recibo no encontrado");
  const belongs = r.booking
    ? r.booking.id_agency === agencyId
    : r.id_agency === agencyId;
  if (!belongs) throw new Error("No autorizado para este recibo");
}

// NUEVO: validar que la reserva exista y pertenezca a la agencia
async function ensureBookingInAgency(bookingId: number, agencyId: number) {
  const b = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    select: { id_booking: true, id_agency: true },
  });
  if (!b) throw new Error("La reserva no existe");
  if (b.id_agency !== agencyId)
    throw new Error("Reserva no pertenece a tu agencia");
}

type PatchBody = {
  booking?: { id_booking?: number }; // requerido para "attach"
  serviceIds?: number[]; // requerido para "attach"
  clientIds?: number[]; // opcional; si vienen, se validan
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const rawId = req.query.id;
  if (!rawId || Array.isArray(rawId) || isNaN(Number(rawId))) {
    return res.status(400).json({ error: "ID inválido" });
  }
  const id = Number(rawId);

  const authUser = await getUserFromAuth(req);
  const authUserId = authUser?.id_user;
  const authAgencyId = authUser?.id_agency;
  if (!authUserId || !authAgencyId) {
    return res.status(401).json({ error: "No autenticado" });
  }

  if (req.method === "GET") {
    try {
      await ensureReceiptInAgency(id, authAgencyId);
      const receipt = await prisma.receipt.findUnique({
        where: { id_receipt: id },
      });
      if (!receipt)
        return res.status(404).json({ error: "Recibo no encontrado" });
      return res.status(200).json({ receipt });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Error al obtener el recibo";
      const status = msg.includes("No autorizado")
        ? 403
        : msg.includes("no encontrado")
          ? 404
          : 500;
      return res.status(status).json({ error: msg });
    }
  }

  if (req.method === "DELETE") {
    try {
      await ensureReceiptInAgency(id, authAgencyId);
      await prisma.receipt.delete({ where: { id_receipt: id } });
      return res.status(204).end();
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el recibo";
      const status = msg.includes("No autorizado")
        ? 403
        : msg.includes("no encontrado")
          ? 404
          : 500;
      return res.status(status).json({ error: msg });
    }
  }

  // NUEVO: Attach vía PATCH
  if (req.method === "PATCH") {
    try {
      // 1) control de pertenencia del recibo
      await ensureReceiptInAgency(id, authAgencyId);

      const body = (req.body || {}) as PatchBody;
      const bookingId = Number(body.booking?.id_booking);
      const serviceIds = Array.isArray(body.serviceIds) ? body.serviceIds : [];

      if (!Number.isFinite(bookingId) || bookingId <= 0)
        return res.status(400).json({ error: "id_booking inválido" });
      if (serviceIds.length === 0)
        return res
          .status(400)
          .json({ error: "serviceIds debe contener al menos un ID" });

      // 2) control de pertenencia de la reserva
      await ensureBookingInAgency(bookingId, authAgencyId);

      // 3) validar que todos los servicios pertenezcan a la reserva
      const svcs = await prisma.service.findMany({
        where: { id_service: { in: serviceIds }, booking_id: bookingId },
        select: { id_service: true },
      });
      const ok = new Set(svcs.map((s) => s.id_service));
      const bad = serviceIds.filter((sid) => !ok.has(sid));
      if (bad.length)
        return res
          .status(400)
          .json({ error: "Algún servicio no pertenece a la reserva" });

      // 4) validar clientIds (si vienen)
      let nextClientIds: number[] | undefined = undefined;
      if (Array.isArray(body.clientIds)) {
        if (body.clientIds.length) {
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
          const invalid = body.clientIds.filter((cid) => !allowed.has(cid));
          if (invalid.length)
            return res
              .status(400)
              .json({ error: "Algún cliente no pertenece a la reserva" });
          nextClientIds = body.clientIds;
        } else {
          nextClientIds = [];
        }
      }

      // 5) update: conectar booking, desconectar agency si venía como de agencia, setear arrays
      const updated = await prisma.receipt.update({
        where: { id_receipt: id },
        data: {
          booking: { connect: { id_booking: bookingId } },
          agency: { disconnect: true },
          serviceIds,
          ...(nextClientIds !== undefined ? { clientIds: nextClientIds } : {}),
        },
      });

      return res.status(200).json({ receipt: updated });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Error actualizando recibo";
      const status = msg.includes("No autorizado")
        ? 403
        : msg.includes("no existe") || msg.includes("no encontrado")
          ? 404
          : 500;
      return res.status(status).json({ error: msg });
    }
  }

  res.setHeader("Allow", ["GET", "DELETE", "PATCH"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
