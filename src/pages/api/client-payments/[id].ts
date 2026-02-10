import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import {
  canAccessBookingByRole,
  getFinanceSectionGrants,
} from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";

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

type PersistedStatus = "PENDIENTE" | "PAGADA" | "CANCELADA";
type DerivedStatus = PersistedStatus | "VENCIDA";

const RO_MUTATE = new Set([
  "vendedor",
  "administrativo",
  "gerente",
  "desarrollador",
  "lider",
]);
const RO_DELETE = new Set(["administrativo", "gerente", "desarrollador"]);

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

function safeNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

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

function toDec(v: unknown): Prisma.Decimal | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return new Prisma.Decimal(typeof v === "number" ? v : String(v));
}

function normalizePersistedStatus(v: unknown): PersistedStatus {
  const s = String(v || "").trim().toUpperCase();
  if (s === "PAGADA") return "PAGADA";
  if (s === "CANCELADA") return "CANCELADA";
  return "PENDIENTE";
}

function parseStatusForUpdate(v: unknown): PersistedStatus | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim().toUpperCase();
  if (!s) return undefined;
  if (s === "VENCIDA") {
    throw new Error("El estado VENCIDA es derivado y no se puede guardar.");
  }
  if (s !== "PENDIENTE" && s !== "PAGADA" && s !== "CANCELADA") {
    throw new Error("Estado inválido.");
  }
  return s as PersistedStatus;
}

function dateKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function deriveStatus(status: PersistedStatus, dueDate: Date): {
  derivedStatus: DerivedStatus;
  isOverdue: boolean;
} {
  if (status !== "PENDIENTE") {
    return { derivedStatus: status, isOverdue: false };
  }
  const isOverdue = dateKeyUtc(dueDate) < dateKeyUtc(new Date());
  return { derivedStatus: isOverdue ? "VENCIDA" : "PENDIENTE", isOverdue };
}

function mapPaymentWithDerived<T extends { status: string; due_date: Date }>(
  payment: T,
): T & {
  status: PersistedStatus;
  derived_status: DerivedStatus;
  is_overdue: boolean;
} {
  const status = normalizePersistedStatus(payment.status);
  const { derivedStatus, isOverdue } = deriveStatus(status, payment.due_date);
  return {
    ...payment,
    status,
    derived_status: derivedStatus,
    is_overdue: isOverdue,
  };
}

async function ensurePlanAccess(agencyId: number): Promise<void> {
  const planAccess = await ensurePlanFeatureAccess(agencyId, "payment_plans");
  if (!planAccess.allowed) {
    throw new Error("PLAN_INSUFICIENTE");
  }
}

async function canAccessFinanceModule(auth: DecodedAuth): Promise<boolean> {
  const grants = await getFinanceSectionGrants(auth.id_agency, auth.id_user);
  return canAccessFinanceSection(auth.role, grants, "payment_plans");
}

async function getPaymentFull(id_payment: number, id_agency: number) {
  return prisma.clientPayment.findFirst({
    where: { id_payment, id_agency },
    include: {
      booking: {
        select: {
          id_booking: true,
          agency_booking_id: true,
          details: true,
          status: true,
          id_user: true,
          id_agency: true,
          titular_id: true,
          clients: { select: { id_client: true } },
        },
      },
      client: {
        select: {
          id_client: true,
          agency_client_id: true,
          first_name: true,
          last_name: true,
        },
      },
      service: {
        select: {
          id_service: true,
          agency_service_id: true,
          description: true,
          type: true,
          booking_id: true,
        },
      },
      receipt: {
        select: {
          id_receipt: true,
          receipt_number: true,
          issue_date: true,
          amount: true,
          amount_currency: true,
          bookingId_booking: true,
        },
      },
      audits: {
        orderBy: { changed_at: "desc" },
        include: {
          changedBy: {
            select: { id_user: true, first_name: true, last_name: true },
          },
        },
      },
    },
  });
}

async function ensureClientInBooking(
  clientId: number,
  bookingId: number,
  agencyId: number,
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id_booking: bookingId },
    select: {
      id_agency: true,
      titular_id: true,
      clients: { select: { id_client: true } },
    },
  });

  if (!booking) throw new Error("La reserva no existe.");
  if (booking.id_agency !== agencyId) {
    throw new Error("La reserva no pertenece a tu agencia.");
  }

  const allowed = new Set<number>([
    booking.titular_id,
    ...booking.clients.map((c) => c.id_client),
  ]);

  if (!allowed.has(clientId)) {
    throw new Error("El pax no pertenece a la reserva.");
  }
}

async function ensureServiceInBooking(
  serviceId: number,
  bookingId: number,
  agencyId: number,
): Promise<void> {
  const service = await prisma.service.findFirst({
    where: {
      id_service: serviceId,
      booking_id: bookingId,
      id_agency: agencyId,
    },
    select: { id_service: true },
  });

  if (!service) {
    throw new Error("El servicio no pertenece a la reserva.");
  }
}

async function ensureReceiptInAgency(
  receiptId: number,
  agencyId: number,
): Promise<{
  id_receipt: number;
  id_agency: number | null;
  bookingId_booking: number | null;
}> {
  const receipt = await prisma.receipt.findUnique({
    where: { id_receipt: receiptId },
    select: {
      id_receipt: true,
      id_agency: true,
      bookingId_booking: true,
      booking: { select: { id_agency: true } },
    },
  });

  if (!receipt) {
    throw new Error("Recibo no encontrado.");
  }

  const receiptAgency = receipt.booking?.id_agency ?? receipt.id_agency;
  if (receiptAgency !== agencyId) {
    throw new Error("El recibo no pertenece a tu agencia.");
  }

  return {
    id_receipt: receipt.id_receipt,
    id_agency: receipt.id_agency,
    bookingId_booking: receipt.bookingId_booking,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const auth = await getUserFromAuth(req);
  if (!auth) return res.status(401).json({ error: "No autenticado" });

  try {
    await ensurePlanAccess(auth.id_agency);
  } catch (error) {
    if (error instanceof Error && error.message === "PLAN_INSUFICIENTE") {
      return res.status(403).json({ error: "Plan insuficiente" });
    }
    return res.status(500).json({ error: "Error validando plan" });
  }

  const idParam = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = safeNumber(idParam);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  const payment = await getPaymentFull(id, auth.id_agency);
  if (!payment) {
    return res.status(404).json({ error: "Cuota no encontrada" });
  }

  const canFinance = await canAccessFinanceModule(auth);
  const canBooking = await canAccessBookingByRole(auth, {
    id_user: payment.booking.id_user,
    id_agency: payment.booking.id_agency,
  });

  if (req.method === "GET") {
    if (!canFinance && !canBooking) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    return res.status(200).json(mapPaymentWithDerived(payment));
  }

  if (req.method === "PUT") {
    try {
      if (!RO_MUTATE.has(auth.role.toLowerCase())) {
        return res
          .status(403)
          .json({ error: "No autorizado a modificar cuotas." });
      }

      if (!canFinance && !canBooking) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      const body = req.body ?? {};

      if (body.currency === null) {
        return res.status(400).json({ error: "currency no puede ser null" });
      }
      if (body.amount === null) {
        return res.status(400).json({ error: "amount no puede ser null" });
      }
      if (body.client_id === null) {
        return res.status(400).json({ error: "client_id no puede ser null" });
      }
      if (body.booking_id === null) {
        return res.status(400).json({ error: "booking_id no puede ser null" });
      }
      if (body.due_date === null) {
        return res.status(400).json({ error: "due_date no puede ser null" });
      }

      const currency =
        typeof body.currency === "string" && body.currency.trim()
          ? body.currency.trim().toUpperCase()
          : undefined;

      const amount = toDec(body.amount);
      const due_date = parseDueDate(body.due_date);
      const nextStatus = parseStatusForUpdate(body.status);

      const reason =
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim()
          : typeof body.status_reason === "string" && body.status_reason.trim()
            ? body.status_reason.trim()
            : undefined;

      const paidAtFromBody =
        body.paid_at === null
          ? null
          : body.paid_at !== undefined
            ? parseDueDate(body.paid_at)
            : undefined;

      if (body.paid_at !== undefined && body.paid_at !== null && !paidAtFromBody) {
        return res.status(400).json({ error: "paid_at inválida" });
      }

      let booking_id: number | undefined;
      if (body.booking_id !== undefined) {
        const bid = safeNumber(body.booking_id);
        if (!bid) return res.status(400).json({ error: "booking_id inválido" });

        const booking = await prisma.booking.findFirst({
          where: { id_booking: bid, id_agency: auth.id_agency },
          select: { id_booking: true },
        });

        if (!booking) {
          return res.status(400).json({
            error: "La reserva no existe o no pertenece a tu agencia",
          });
        }

        booking_id = bid;
      }

      const targetBookingId = booking_id ?? payment.booking_id;

      let client_id: number | undefined;
      if (body.client_id !== undefined) {
        const cid = safeNumber(body.client_id);
        if (!cid) return res.status(400).json({ error: "client_id inválido" });
        await ensureClientInBooking(cid, targetBookingId, auth.id_agency);
        client_id = cid;
      }

      let service_id: number | null | undefined;
      if (body.service_id !== undefined) {
        if (body.service_id === null || body.service_id === "") {
          service_id = null;
        } else {
          const sid = safeNumber(body.service_id);
          if (!sid) {
            return res.status(400).json({ error: "service_id inválido" });
          }
          await ensureServiceInBooking(sid, targetBookingId, auth.id_agency);
          service_id = sid;
        }
      }

      let receipt_id: number | null | undefined;
      if (body.receipt_id !== undefined) {
        if (body.receipt_id === null || body.receipt_id === "") {
          receipt_id = null;
        } else {
          const rid = safeNumber(body.receipt_id);
          if (!rid) {
            return res.status(400).json({ error: "receipt_id inválido" });
          }
          const receipt = await ensureReceiptInAgency(rid, auth.id_agency);
          if (receipt.bookingId_booking && receipt.bookingId_booking !== targetBookingId) {
            return res.status(400).json({
              error: "El recibo pertenece a otra reserva.",
            });
          }
          receipt_id = rid;
        }
      }

      if (amount !== undefined && amount.lte(0)) {
        return res.status(400).json({ error: "El monto debe ser positivo" });
      }
      if (due_date !== undefined && !Number.isFinite(due_date.getTime())) {
        return res.status(400).json({ error: "due_date inválida" });
      }

      const currentStatus = normalizePersistedStatus(payment.status);
      const statusToSave = nextStatus ?? currentStatus;

      const effectiveReceiptId =
        receipt_id === undefined ? payment.receipt_id : receipt_id;

      if (statusToSave === "PAGADA" && !effectiveReceiptId) {
        return res.status(400).json({
          error: "Para marcar una cuota como pagada debés vincular un recibo.",
        });
      }

      if (statusToSave !== "PAGADA" && receipt_id !== undefined && receipt_id !== null) {
        return res.status(400).json({
          error: "Solo podés vincular recibo cuando la cuota está en estado PAGADA.",
        });
      }

      const updateData: Prisma.ClientPaymentUncheckedUpdateInput = {};

      if (currency !== undefined) updateData.currency = currency;
      if (amount !== undefined) updateData.amount = amount.toDecimalPlaces(2);
      if (client_id !== undefined) updateData.client_id = client_id;
      if (booking_id !== undefined) updateData.booking_id = booking_id;
      if (due_date !== undefined) updateData.due_date = due_date;
      if (service_id !== undefined) updateData.service_id = service_id;
      if (receipt_id !== undefined) updateData.receipt_id = receipt_id;

      if (nextStatus !== undefined) {
        updateData.status = nextStatus;
      }

      if (statusToSave === "PAGADA") {
        updateData.paid_at =
          paidAtFromBody === null
            ? null
            : paidAtFromBody === undefined
              ? new Date()
              : paidAtFromBody;
        updateData.paid_by = auth.id_user;
      } else {
        if (paidAtFromBody !== undefined) {
          updateData.paid_at = paidAtFromBody;
        } else if (nextStatus !== undefined) {
          updateData.paid_at = null;
        }
        if (nextStatus !== undefined) {
          updateData.paid_by = null;
        }
      }

      if (reason !== undefined) {
        updateData.status_reason = reason;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const up = await tx.clientPayment.update({
          where: { id_payment: id },
          data: updateData,
        });

        const statusChanged = currentStatus !== normalizePersistedStatus(up.status);
        const action = statusChanged ? "STATUS_CHANGE" : "UPDATED";

        await tx.clientPaymentAudit.create({
          data: {
            client_payment_id: id,
            id_agency: auth.id_agency,
            action,
            from_status: statusChanged ? currentStatus : null,
            to_status: statusChanged ? normalizePersistedStatus(up.status) : null,
            reason:
              reason ??
              (statusChanged
                ? `Cambio de estado a ${normalizePersistedStatus(up.status)}`
                : "Cuota actualizada"),
            changed_by: auth.id_user,
            data: {
              updated_fields: Object.keys(updateData),
              receipt_id: up.receipt_id,
              service_id: up.service_id,
            },
          },
        });

        return tx.clientPayment.findUnique({
          where: { id_payment: id },
          include: {
            booking: {
              select: {
                id_booking: true,
                agency_booking_id: true,
                details: true,
                status: true,
                id_user: true,
                id_agency: true,
              },
            },
            client: {
              select: {
                id_client: true,
                agency_client_id: true,
                first_name: true,
                last_name: true,
              },
            },
            service: {
              select: {
                id_service: true,
                agency_service_id: true,
                description: true,
                type: true,
                booking_id: true,
              },
            },
            receipt: {
              select: {
                id_receipt: true,
                receipt_number: true,
                issue_date: true,
                amount: true,
                amount_currency: true,
                bookingId_booking: true,
              },
            },
            audits: {
              orderBy: { changed_at: "desc" },
              include: {
                changedBy: {
                  select: { id_user: true, first_name: true, last_name: true },
                },
              },
            },
          },
        });
      });

      if (!updated) {
        return res.status(404).json({ error: "Cuota no encontrada" });
      }

      return res.status(200).json(mapPaymentWithDerived(updated));
    } catch (error) {
      console.error("[client-payments/:id][PUT]", error);
      const msg =
        error instanceof Error ? error.message : "Error al actualizar la cuota";
      const badRequest =
        msg.includes("inválido") ||
        msg.includes("inválida") ||
        msg.includes("derivado") ||
        msg.includes("no puede") ||
        msg.includes("Solo podés");
      return res.status(badRequest ? 400 : 500).json({ error: msg });
    }
  }

  if (req.method === "DELETE") {
    try {
      if (!RO_DELETE.has(auth.role.toLowerCase())) {
        return res
          .status(403)
          .json({ error: "No autorizado a eliminar cuotas." });
      }

      if (!canFinance) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      if (normalizePersistedStatus(payment.status) === "PAGADA") {
        return res.status(400).json({
          error: "No se puede eliminar una cuota pagada.",
        });
      }

      await prisma.clientPayment.delete({ where: { id_payment: id } });
      return res.status(204).end();
    } catch (error) {
      console.error("[client-payments/:id][DELETE]", error);
      return res.status(500).json({ error: "Error al eliminar la cuota" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
