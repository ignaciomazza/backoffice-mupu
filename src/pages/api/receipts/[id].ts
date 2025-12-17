// src/pages/api/receipts/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
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
        include: { payments: true },
      });
      if (!receipt)
        return res.status(404).json({ error: "Recibo no encontrado" });

      return res.status(200).json({
        receipt: {
          ...receipt,
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
    try {
      await ensureReceiptInAgency(id, authAgencyId);
      await prisma.$transaction(async (tx) => {
        await deleteCreditEntriesForReceipt(tx, id, authAgencyId);
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
              .json({ error: "Algún cliente no pertenece a la reserva" });
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
