// src/pages/api/receipts/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { decodePublicId, encodePublicId } from "@/lib/publicIds";
import { Prisma } from "@prisma/client";
import { jwtVerify, JWTPayload } from "jose";
import {
  canAccessBookingByRole,
  getBookingComponentGrants,
  getFinanceSectionGrants,
} from "@/lib/accessControl";
import {
  canAccessBookingComponent,
  canAccessFinanceSection,
} from "@/utils/permissions";

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

type ReceiptWithPayments = Prisma.ReceiptGetPayload<{
  include: { payments: true };
}>;

type ReceiptPaymentOut = {
  amount: number;
  payment_method_id: number | null;
  account_id: number | null;
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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

const CREDIT_DOC_SIGN: Record<string, number> = {
  receipt: 1,
  investment: -1,
  adjust_up: 1,
  adjust_down: -1,
};

const normDocType = (s?: string | null) => (s || "").trim().toLowerCase();
const creditSignForDoc = (dt?: string | null) =>
  CREDIT_DOC_SIGN[normDocType(dt)] ?? 1;

const toDec = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? undefined
    : new Prisma.Decimal(typeof v === "number" ? v : String(v));

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

const isNonEmptyString = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0;

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

async function deleteCreditEntriesForReceipt(
  tx: Prisma.TransactionClient,
  receiptId: number,
  agencyId: number,
) {
  const entries = await tx.creditEntry.findMany({
    where: { receipt_id: receiptId, id_agency: agencyId },
    select: {
      id_entry: true,
      account_id: true,
      amount: true,
      doc_type: true,
    },
  });

  for (const entry of entries) {
    const account = await tx.creditAccount.findUnique({
      where: { id_credit_account: entry.account_id },
      select: { balance: true },
    });

    if (account) {
      const delta = new Prisma.Decimal(entry.amount).mul(
        new Prisma.Decimal(creditSignForDoc(entry.doc_type)),
      );
      const next = account.balance.minus(delta);
      await tx.creditAccount.update({
        where: { id_credit_account: entry.account_id },
        data: { balance: next },
      });
    }

    await tx.creditEntry.delete({ where: { id_entry: entry.id_entry } });
  }
}

function normalizePaymentsFromReceipt(
  r: ReceiptWithPayments,
): ReceiptPaymentOut[] {
  const rel = Array.isArray(r.payments) ? r.payments : [];
  if (rel.length > 0) {
    return rel.map((p) => ({
      amount: Number((p as { amount?: unknown }).amount ?? 0),
      payment_method_id:
        Number.isFinite(Number(p.payment_method_id)) &&
        Number(p.payment_method_id) > 0
          ? Number(p.payment_method_id)
          : null,
      account_id:
        Number.isFinite(Number(p.account_id)) && Number(p.account_id) > 0
          ? Number(p.account_id)
          : null,
    }));
  }

  const amt = Number(r.amount ?? 0);
  const pmText = String(
    (r as unknown as { payment_method?: unknown })?.payment_method ?? "",
  ).trim();
  const accText = String(
    (r as unknown as { account?: unknown })?.account ?? "",
  ).trim();

  const pmId =
    Number.isFinite(
      Number(
        (r as unknown as { payment_method_id?: unknown })?.payment_method_id,
      ),
    ) &&
    Number(
      (r as unknown as { payment_method_id?: unknown })?.payment_method_id,
    ) > 0
      ? Number(
          (r as unknown as { payment_method_id?: unknown })?.payment_method_id,
        )
      : null;

  const accId =
    Number.isFinite(
      Number((r as unknown as { account_id?: unknown })?.account_id),
    ) && Number((r as unknown as { account_id?: unknown })?.account_id) > 0
      ? Number((r as unknown as { account_id?: unknown })?.account_id)
      : null;

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

// validar que la reserva exista y pertenezca a la agencia
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
  booking?: { id_booking?: number };
  serviceIds?: number[];
  clientIds?: number[];

  concept?: string;
  currency?: string;
  amountString?: string;
  amountCurrency?: string;
  amount?: number | string;
  payments?: ReceiptPaymentLineIn[];
  payment_fee_amount?: number | string;
  payment_method?: string;
  account?: string;
  payment_method_id?: number;
  account_id?: number;
  base_amount?: number | string;
  base_currency?: string;
  counter_amount?: number | string;
  counter_currency?: string;
  issue_date?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const rawId = req.query.id;
  if (!rawId || Array.isArray(rawId)) {
    return res.status(400).json({ error: "ID inválido" });
  }
  const rawIdStr = String(rawId);
  const parsedId = Number(rawIdStr);
  const decoded =
    Number.isFinite(parsedId) && parsedId > 0
      ? null
      : decodePublicId(rawIdStr);
  if (decoded && decoded.t !== "receipt") {
    return res.status(400).json({ error: "ID inválido" });
  }
  if (!decoded && (!Number.isFinite(parsedId) || parsedId <= 0)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  const authUser = await getUserFromAuth(req);
  const authUserId = authUser?.id_user;
  const authAgencyId = authUser?.id_agency;
  const authRole = authUser?.role ?? "";
  if (!authUserId || !authAgencyId) {
    return res.status(401).json({ error: "No autenticado" });
  }
  const auth = authUser as DecodedUser;

  const financeGrants = await getFinanceSectionGrants(
    authAgencyId,
    authUserId,
  );
  const bookingGrants = await getBookingComponentGrants(
    authAgencyId,
    authUserId,
  );
  const canReceipts = canAccessFinanceSection(
    authRole,
    financeGrants,
    "receipts",
  );
  const canReceiptsForm = canAccessBookingComponent(
    authRole,
    bookingGrants,
    "receipts_form",
  );

  const id = decoded
    ? (
        await prisma.receipt.findFirst({
          where: { id_agency: authAgencyId, agency_receipt_id: decoded.i },
          select: { id_receipt: true },
        })
      )?.id_receipt
    : parsedId;
  if (!id) {
    return res.status(404).json({ error: "Recibo no encontrado" });
  }

  if (req.method === "GET") {
    try {
      await ensureReceiptInAgency(id, authAgencyId);
      const receipt = await prisma.receipt.findUnique({
        where: { id_receipt: id },
        include: { payments: true, booking: true },
      });
      if (!receipt)
        return res.status(404).json({ error: "Recibo no encontrado" });
      const canReadByRole = receipt.booking
        ? await canAccessBookingByRole(auth, {
            id_user: receipt.booking.id_user,
            id_agency: receipt.booking.id_agency,
          })
        : false;
      if (!canReceipts && !canReceiptsForm && !canReadByRole) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      const public_id =
        receipt.agency_receipt_id != null && receipt.id_agency != null
          ? encodePublicId({
              t: "receipt",
              a: receipt.id_agency,
              i: receipt.agency_receipt_id,
            })
          : null;
      const { booking, ...receiptData } = receipt;
      void booking;

      return res.status(200).json({
        receipt: {
          ...receiptData,
          public_id,
          payments: normalizePaymentsFromReceipt(receipt),
        },
      });
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
    if (!canReceipts) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    try {
      await ensureReceiptInAgency(id, authAgencyId);
      await prisma.$transaction(async (tx) => {
        await deleteCreditEntriesForReceipt(tx, id, authAgencyId);

        const linkedPayments = await tx.clientPayment.findMany({
          where: { id_agency: authAgencyId, receipt_id: id },
          select: { id_payment: true, status: true },
        });

        if (linkedPayments.length > 0) {
          const linkedIds = linkedPayments.map((p) => p.id_payment);

          await tx.clientPayment.updateMany({
            where: { id_payment: { in: linkedIds } },
            data: {
              status: "PENDIENTE",
              paid_at: null,
              paid_by: null,
              receipt_id: null,
              status_reason: `Recibo ${id} eliminado. Cuota reabierta.`,
            },
          });

          await tx.clientPaymentAudit.createMany({
            data: linkedPayments.map((p) => ({
              client_payment_id: p.id_payment,
              id_agency: authAgencyId,
              action: "RECEIPT_DELETED_REOPEN",
              from_status: p.status,
              to_status: "PENDIENTE",
              reason: `Se elimino el recibo #${id}. Cuota reabierta.`,
              changed_by: authUserId,
              data: {
                receipt_id: id,
              },
            })),
          });
        }

        await tx.receipt.delete({ where: { id_receipt: id } });
      });
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

  // Attach vía PATCH (igual que tenías)
  if (req.method === "PATCH") {
    try {
      const body = (req.body || {}) as PatchBody;
      const bookingId = Number(body.booking?.id_booking);
      const serviceIds = Array.isArray(body.serviceIds) ? body.serviceIds : [];
      const isAttach = Number.isFinite(bookingId) || serviceIds.length > 0;

      if (!canReceipts && !canReceiptsForm) {
        return res.status(403).json({ error: "Sin permisos" });
      }

      await ensureReceiptInAgency(id, authAgencyId);

      if (!canReceipts && !isAttach) {
        const linkedReceipt = await prisma.receipt.findUnique({
          where: { id_receipt: id },
          select: {
            bookingId_booking: true,
            booking: {
              select: {
                id_user: true,
                id_agency: true,
              },
            },
          },
        });

        if (!linkedReceipt?.bookingId_booking || !linkedReceipt.booking) {
          return res.status(403).json({ error: "Sin permisos" });
        }

        const canEditByRole = await canAccessBookingByRole(auth, {
          id_user: linkedReceipt.booking.id_user,
          id_agency: linkedReceipt.booking.id_agency,
        });
        if (!canEditByRole) {
          return res.status(403).json({ error: "Sin permisos" });
        }
      }

      if (isAttach) {
        if (!Number.isFinite(bookingId) || bookingId <= 0)
          return res.status(400).json({ error: "id_booking inválido" });
        if (serviceIds.length === 0)
          return res
            .status(400)
            .json({ error: "serviceIds debe contener al menos un ID" });

        await ensureBookingInAgency(bookingId, authAgencyId);

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
                .json({ error: "Algún pax no pertenece a la reserva" });
            nextClientIds = body.clientIds;
          } else {
            nextClientIds = [];
          }
        }

        const updated = await prisma.receipt.update({
          where: { id_receipt: id },
          data: {
            booking: { connect: { id_booking: bookingId } },
            agency: { disconnect: true },
            serviceIds,
            ...(nextClientIds !== undefined ? { clientIds: nextClientIds } : {}),
          },
          include: { payments: true },
        });

        return res.status(200).json({
          receipt: {
            ...updated,
            payments: normalizePaymentsFromReceipt(updated),
          },
        });
      }

      const existing = await prisma.receipt.findUnique({
        where: { id_receipt: id },
        select: { id_receipt: true, bookingId_booking: true },
      });

      if (!existing)
        return res.status(404).json({ error: "Recibo no encontrado" });

      const {
        concept,
        currency,
        amountString,
        amountCurrency,
        amount,
        payments,
        payment_fee_amount,
        payment_method,
        account,
        payment_method_id,
        account_id,
        base_amount,
        base_currency,
        counter_amount,
        counter_currency,
        clientIds,
        issue_date,
      } = body;

      let nextClientIds: number[] | undefined = undefined;
      if (Array.isArray(clientIds)) {
        if (existing.bookingId_booking && clientIds.length > 0) {
          const bk = await prisma.booking.findUnique({
            where: { id_booking: existing.bookingId_booking },
            select: {
              titular_id: true,
              clients: { select: { id_client: true } },
            },
          });

          if (!bk) {
            return res.status(400).json({
              error: "La reserva asociada al recibo no existe.",
            });
          }

          const allowed = new Set<number>([
            bk.titular_id,
            ...bk.clients.map((c) => c.id_client),
          ]);
          const invalid = clientIds.filter((cid) => !allowed.has(cid));
          if (invalid.length) {
            return res
              .status(400)
              .json({ error: "Algún pax no pertenece a la reserva" });
          }
        }
        nextClientIds = clientIds;
      }

      const amountCurrencyISO = (amountCurrency || "").toUpperCase();
      const baseCurrencyISO = base_currency
        ? base_currency.toUpperCase()
        : undefined;
      const counterCurrencyISO = counter_currency
        ? counter_currency.toUpperCase()
        : undefined;

      if (!isNonEmptyString(concept)) {
        return res.status(400).json({ error: "concept es requerido" });
      }
      if (!isNonEmptyString(amountString)) {
        return res.status(400).json({ error: "amountString es requerido" });
      }
      if (!isNonEmptyString(amountCurrencyISO)) {
        return res.status(400).json({
          error: "amountCurrency es requerido (ISO)",
        });
      }

      const parsedIssueDate = issue_date ? toLocalDate(issue_date) : undefined;
      if (issue_date && !parsedIssueDate) {
        return res.status(400).json({ error: "issue_date inválida" });
      }

      const hasPayments = Array.isArray(payments) && payments.length > 0;
      let normalizedPayments: ReceiptPaymentLineNormalized[] = [];

      if (hasPayments) {
        normalizedPayments = (payments || []).map((p) => ({
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

      const legacyAmountNum = toNum(amount);
      const amountNum = hasPayments
        ? normalizedPayments.reduce((acc, p) => acc + Number(p.amount), 0)
        : legacyAmountNum;

      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: "amount numérico inválido" });
      }

      const legacyPmId = hasPayments
        ? normalizedPayments[0]?.payment_method_id
        : Number.isFinite(Number(payment_method_id)) &&
            Number(payment_method_id) > 0
          ? Number(payment_method_id)
          : undefined;

      const legacyAccId = hasPayments
        ? normalizedPayments[0]?.account_id
        : Number.isFinite(Number(account_id)) && Number(account_id) > 0
          ? Number(account_id)
          : undefined;

      const updateData: Prisma.ReceiptUpdateInput = {
        concept: concept.trim(),
        amount: amountNum,
        amount_string: amountString.trim(),
        amount_currency: amountCurrencyISO,
        currency: isNonEmptyString(currency) ? currency : amountCurrencyISO,

        ...(isNonEmptyString(payment_method) ? { payment_method } : {}),
        ...(isNonEmptyString(account) ? { account } : {}),

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

        ...(parsedIssueDate ? { issue_date: parsedIssueDate } : {}),
        ...(nextClientIds !== undefined ? { clientIds: nextClientIds } : {}),
      };

      const updated = await prisma.$transaction(async (tx) => {
        if (hasPayments) {
          await tx.receiptPayment.deleteMany({ where: { receipt_id: id } });
          await tx.receiptPayment.createMany({
            data: normalizedPayments.map((p) => ({
              receipt_id: id,
              amount: new Prisma.Decimal(Number(p.amount)),
              payment_method_id: Number(p.payment_method_id),
              account_id: p.account_id ? Number(p.account_id) : null,
            })),
          });
        }

        return tx.receipt.update({
          where: { id_receipt: id },
          data: updateData,
          include: { payments: true },
        });
      });

      return res.status(200).json({
        receipt: {
          ...updated,
          payments: normalizePaymentsFromReceipt(updated),
        },
      });
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
