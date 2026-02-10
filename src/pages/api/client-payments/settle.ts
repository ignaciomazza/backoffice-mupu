import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, type JWTPayload } from "jose";
import { getFinanceSectionGrants } from "@/lib/accessControl";
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

type SettleBody = {
  paymentIds?: unknown;
  receiptId?: unknown;
  reason?: unknown;
};

const RO_SETTLE = new Set([
  "vendedor",
  "administrativo",
  "gerente",
  "desarrollador",
  "lider",
]);

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

function normalizePersistedStatus(v: unknown): PersistedStatus {
  const s = String(v || "").trim().toUpperCase();
  if (s === "PAGADA") return "PAGADA";
  if (s === "CANCELADA") return "CANCELADA";
  return "PENDIENTE";
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

function toDistinctIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<number>();
  for (const item of value) {
    const n = Number(item);
    if (Number.isFinite(n) && n > 0) set.add(Math.trunc(n));
  }
  return Array.from(set);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await getUserFromAuth(req);
  if (!auth) {
    return res.status(401).json({ error: "No autenticado" });
  }

  const role = String(auth.role || "").toLowerCase();
  if (!RO_SETTLE.has(role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const plan = await ensurePlanFeatureAccess(auth.id_agency, "payment_plans");
  if (!plan.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canFinance = canAccessFinanceSection(role, financeGrants, "payment_plans");
  if (!canFinance) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  try {
    const body = (req.body || {}) as SettleBody;
    const paymentIds = toDistinctIds(body.paymentIds);
    const receiptId = Number(body.receiptId);
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : undefined;

    if (paymentIds.length === 0) {
      return res.status(400).json({ error: "paymentIds es requerido" });
    }
    if (!Number.isFinite(receiptId) || receiptId <= 0) {
      return res.status(400).json({ error: "receiptId inválido" });
    }

    const payments = await prisma.clientPayment.findMany({
      where: {
        id_payment: { in: paymentIds },
        id_agency: auth.id_agency,
      },
      include: {
        booking: {
          select: {
            id_booking: true,
            agency_booking_id: true,
            details: true,
            status: true,
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
          },
        },
      },
    });

    if (payments.length !== paymentIds.length) {
      return res.status(404).json({ error: "Alguna cuota no existe" });
    }

    const first = payments[0];
    const bookingId = first.booking_id;
    const clientId = first.client_id;
    const currency = String(first.currency || "").toUpperCase();

    for (const payment of payments) {
      const status = normalizePersistedStatus(payment.status);
      if (status !== "PENDIENTE") {
        return res.status(400).json({
          error: "Solo podés liquidar cuotas en estado PENDIENTE.",
        });
      }
      if (payment.booking_id !== bookingId) {
        return res.status(400).json({
          error: "Todas las cuotas deben pertenecer a la misma reserva.",
        });
      }
      if (payment.client_id !== clientId) {
        return res.status(400).json({
          error: "Todas las cuotas deben pertenecer al mismo pax.",
        });
      }
      if (String(payment.currency || "").toUpperCase() !== currency) {
        return res.status(400).json({
          error: "Todas las cuotas seleccionadas deben tener la misma moneda.",
        });
      }
    }

    const receipt = await prisma.receipt.findUnique({
      where: { id_receipt: receiptId },
      select: {
        id_receipt: true,
        id_agency: true,
        bookingId_booking: true,
        amount: true,
        amount_currency: true,
        issue_date: true,
        clientIds: true,
        booking: { select: { id_agency: true } },
      },
    });

    if (!receipt) {
      return res.status(404).json({ error: "Recibo no encontrado" });
    }

    const receiptAgency = receipt.booking?.id_agency ?? receipt.id_agency;
    if (receiptAgency !== auth.id_agency) {
      return res.status(403).json({ error: "Recibo fuera de tu agencia" });
    }

    if (receipt.bookingId_booking !== bookingId) {
      return res.status(400).json({
        error: "El recibo debe estar asociado a la misma reserva de las cuotas.",
      });
    }

    if (
      Array.isArray(receipt.clientIds) &&
      receipt.clientIds.length > 0 &&
      !receipt.clientIds.includes(clientId)
    ) {
      return res.status(400).json({
        error: "El recibo no está asociado al pax de las cuotas seleccionadas.",
      });
    }

    const receiptCurrency = String(receipt.amount_currency || "").toUpperCase();
    if (receiptCurrency !== currency) {
      return res.status(400).json({
        error:
          "La moneda del recibo debe coincidir con la moneda de las cuotas seleccionadas.",
      });
    }

    const totalInstallments = payments.reduce(
      (acc, p) => acc.plus(new Prisma.Decimal(p.amount)),
      new Prisma.Decimal(0),
    );
    const receiptAmount = new Prisma.Decimal(receipt.amount);
    const diff = totalInstallments.minus(receiptAmount).abs();

    if (diff.greaterThan(new Prisma.Decimal("0.009"))) {
      return res.status(400).json({
        error:
          "El monto del recibo debe coincidir con la suma de las cuotas seleccionadas (sin sobrepagos).",
      });
    }

    const note =
      reason ??
      `Pago registrado con recibo N° ${receipt.id_receipt} para ${payments.length} cuota(s)`;

    const settled = await prisma.$transaction(async (tx) => {
      await tx.clientPayment.updateMany({
        where: { id_payment: { in: paymentIds } },
        data: {
          status: "PAGADA",
          receipt_id: receipt.id_receipt,
          paid_at: receipt.issue_date ?? new Date(),
          paid_by: auth.id_user,
          status_reason: note,
        },
      });

      await tx.clientPaymentAudit.createMany({
        data: paymentIds.map((id_payment) => ({
          client_payment_id: id_payment,
          id_agency: auth.id_agency,
          action: "STATUS_CHANGE",
          from_status: "PENDIENTE",
          to_status: "PAGADA",
          reason: note,
          changed_by: auth.id_user,
          data: {
            receipt_id: receipt.id_receipt,
            mode: paymentIds.length > 1 ? "bulk" : "single",
          },
        })),
      });

      return tx.clientPayment.findMany({
        where: { id_payment: { in: paymentIds } },
        include: {
          booking: {
            select: {
              id_booking: true,
              agency_booking_id: true,
              details: true,
              status: true,
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
            },
          },
          receipt: {
            select: {
              id_receipt: true,
              receipt_number: true,
              issue_date: true,
              amount: true,
              amount_currency: true,
            },
          },
        },
      });
    });

    return res.status(200).json({
      payments: settled.map((payment) => mapPaymentWithDerived(payment)),
      receipt_id: receipt.id_receipt,
      total: totalInstallments,
      currency,
    });
  } catch (error) {
    console.error("[client-payments/settle][POST]", error);
    const msg =
      error instanceof Error
        ? error.message
        : "Error al registrar el pago de cuotas";
    return res.status(500).json({ error: msg });
  }
}
