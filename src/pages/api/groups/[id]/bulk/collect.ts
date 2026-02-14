import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import {
  canWriteGroups,
  isLockedGroupStatus,
  parseGroupWhereInput,
  parseOptionalString,
  requireAuth,
  toDistinctPositiveInts,
} from "@/lib/groups/apiShared";
import { groupApiError } from "@/lib/groups/apiErrors";

type Body = {
  paymentIds?: unknown;
  passengerIds?: unknown;
  createReceipts?: unknown;
  issue_date?: unknown;
  concept?: unknown;
  amountString?: unknown;
  payment_fee_amount?: unknown;
  payment_method_id?: unknown;
  account_id?: unknown;
};

function pickParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    return new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      0,
      0,
      0,
      0,
    );
  }
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return groupApiError(res, 405, "Método no permitido para esta ruta.", {
      code: "METHOD_NOT_ALLOWED",
      details: `Método recibido: ${req.method ?? "desconocido"}.`,
      solution: "Usá una solicitud POST para cobrar en lote.",
    });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;
  if (!canWriteGroups(auth.role)) {
    return groupApiError(res, 403, "No tenés permisos para cobrar en lote.", {
      code: "GROUP_COLLECT_FORBIDDEN",
      solution: "Solicitá permisos de edición de grupales a un administrador.",
    });
  }

  const rawGroupId = pickParam(req.query.id);
  if (!rawGroupId) {
    return groupApiError(res, 400, "El identificador de la grupal es inválido.", {
      code: "GROUP_ID_INVALID",
      solution: "Volvé al listado de grupales y abrila nuevamente.",
    });
  }
  const groupWhere = parseGroupWhereInput(rawGroupId, auth.id_agency);
  if (!groupWhere) {
    return groupApiError(res, 404, "No encontramos la grupal solicitada.", {
      code: "GROUP_NOT_FOUND",
      solution: "Revisá que exista y pertenezca a tu agencia.",
    });
  }
  const group = await prisma.travelGroup.findFirst({
    where: groupWhere,
    select: { id_travel_group: true, status: true, name: true },
  });
  if (!group) {
    return groupApiError(res, 404, "No encontramos la grupal solicitada.", {
      code: "GROUP_NOT_FOUND",
      solution: "Revisá que exista y pertenezca a tu agencia.",
    });
  }
  if (isLockedGroupStatus(group.status)) {
    return groupApiError(
      res,
      409,
      "No se pueden cobrar pagos en grupales cerradas o canceladas.",
      {
        code: "GROUP_LOCKED",
        solution: "Cambiá el estado de la grupal antes de cobrar.",
      },
    );
  }

  const body = (req.body ?? {}) as Body;
  const paymentIdsFromBody = toDistinctPositiveInts(body.paymentIds);
  const passengerIdsFromBody = toDistinctPositiveInts(body.passengerIds);

  const createReceipts = body.createReceipts !== false;
  const issueDate = parseDate(body.issue_date);
  if (issueDate === undefined) {
    return groupApiError(res, 400, "La fecha de emisión es inválida.", {
      code: "GROUP_COLLECT_ISSUE_DATE_INVALID",
      solution: "Ingresá una fecha válida con formato AAAA-MM-DD.",
    });
  }
  const concept =
    parseOptionalString(body.concept, 200) ?? `Cobro masivo grupal ${group.name}`;
  const amountString = parseOptionalString(body.amountString, 200) ?? "COBRO MASIVO";

  const paymentMethodId = toPositiveInt(body.payment_method_id);
  if (createReceipts && !paymentMethodId) {
    return groupApiError(
      res,
      400,
      "Para emitir recibos masivos debés indicar un método de cobro.",
      {
        code: "GROUP_COLLECT_METHOD_REQUIRED",
        solution: "Elegí un método de pago y volvé a intentar.",
      },
    );
  }
  const accountId = toPositiveInt(body.account_id);

  const feeAmountRaw =
    body.payment_fee_amount == null || body.payment_fee_amount === ""
      ? null
      : Number(String(body.payment_fee_amount).replace(",", "."));
  if (feeAmountRaw != null && (!Number.isFinite(feeAmountRaw) || feeAmountRaw < 0)) {
    return groupApiError(res, 400, "El costo adicional del cobro es inválido.", {
      code: "GROUP_COLLECT_FEE_INVALID",
      solution: "Ingresá un valor numérico mayor o igual a 0.",
    });
  }

  let paymentIds = paymentIdsFromBody;
  if (paymentIds.length === 0 && passengerIdsFromBody.length > 0) {
    const passengers = await prisma.travelGroupPassenger.findMany({
      where: {
        id_agency: auth.id_agency,
        travel_group_id: group.id_travel_group,
        id_travel_group_passenger: { in: passengerIdsFromBody },
      },
      select: { booking_id: true, client_id: true },
    });
    if (passengers.length === 0) {
      return groupApiError(
        res,
        400,
        "No se encontraron pasajeros válidos para cobrar.",
        {
          code: "GROUP_COLLECT_PASSENGERS_INVALID",
          solution: "Seleccioná pasajeros de esta grupal y volvé a intentar.",
        },
      );
    }

    const pairs = passengers
      .filter(
        (item): item is { booking_id: number; client_id: number } =>
          typeof item.booking_id === "number" &&
          item.booking_id > 0 &&
          typeof item.client_id === "number" &&
          item.client_id > 0,
      )
      .map((item) => ({ booking_id: item.booking_id, client_id: item.client_id }));

    if (pairs.length === 0) {
      return groupApiError(
        res,
        400,
        "Los pasajeros seleccionados no tienen pagos asociables.",
        {
          code: "GROUP_COLLECT_NO_ASSOCIATED_PAYMENTS",
          solution: "Verificá que tengan reservas y cuotas pendientes.",
        },
      );
    }

    const pending = await prisma.clientPayment.findMany({
      where: {
        id_agency: auth.id_agency,
        status: "PENDIENTE",
        OR: pairs.map((pair) => ({
          booking_id: pair.booking_id,
          client_id: pair.client_id,
        })),
      },
      select: { id_payment: true },
    });
    paymentIds = pending.map((item) => item.id_payment);
  }

  if (paymentIds.length === 0) {
    return groupApiError(
      res,
      400,
      "No encontramos cuotas pendientes para cobrar.",
      {
        code: "GROUP_COLLECT_EMPTY",
        solution: "Seleccioná pasajeros con cuotas pendientes o indicá pagos válidos.",
      },
    );
  }

  const payments = await prisma.clientPayment.findMany({
    where: {
      id_agency: auth.id_agency,
      id_payment: { in: paymentIds },
    },
    include: {
      booking: {
        select: {
          id_booking: true,
          travel_group_id: true,
        },
      },
    },
  });
  if (payments.length !== paymentIds.length) {
    return groupApiError(res, 404, "Alguno de los pagos seleccionados no existe.", {
      code: "GROUP_COLLECT_PAYMENT_NOT_FOUND",
      solution: "Refrescá la pantalla y volvé a seleccionar los pagos.",
    });
  }

  for (const payment of payments) {
    if (payment.booking?.travel_group_id !== group.id_travel_group) {
      return groupApiError(
        res,
        400,
        "Hay pagos que no pertenecen a la grupal indicada.",
        {
          code: "GROUP_COLLECT_PAYMENT_SCOPE_INVALID",
          solution: "Seleccioná únicamente pagos de esta grupal.",
        },
      );
    }
    if (payment.status !== "PENDIENTE") {
      return groupApiError(
        res,
        400,
        "Solo se pueden cobrar cuotas en estado pendiente.",
        {
          code: "GROUP_COLLECT_PAYMENT_STATUS_INVALID",
          solution: "Quitá pagos ya cobrados o cancelados de la selección.",
        },
      );
    }
  }

  const buckets = new Map<
    string,
    {
      booking_id: number;
      client_id: number;
      currency: string;
      payments: typeof payments;
    }
  >();

  for (const payment of payments) {
    const bookingId = payment.booking_id;
    const clientId = payment.client_id;
    const currency = String(payment.currency || "").toUpperCase();
    const key = `${bookingId}::${clientId}::${currency}`;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, {
        booking_id: bookingId,
        client_id: clientId,
        currency,
        payments: [payment],
      });
    } else {
      current.payments.push(payment);
    }
  }

  const now = new Date();
  const paidAt = issueDate ?? now;
  let settledCount = 0;
  const receiptsCreated: Array<{
    booking_id: number;
    client_id: number;
    currency: string;
    receipt_id: number | null;
    payment_ids: number[];
  }> = [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const bucket of buckets.values()) {
        const total = bucket.payments.reduce(
          (acc, payment) => acc.plus(payment.amount),
          new Prisma.Decimal(0),
        );

        let createdReceiptId: number | null = null;
        if (createReceipts) {
          const agencyReceiptId = await getNextAgencyCounter(
            tx,
            auth.id_agency,
            "receipt",
          );
          const receipt = await tx.receipt.create({
            data: {
              agency_receipt_id: agencyReceiptId,
              receipt_number: `A${auth.id_agency}-${agencyReceiptId}`,
              issue_date: paidAt,
              amount: total.toNumber(),
              amount_string: amountString,
              amount_currency: bucket.currency,
              concept,
              currency: bucket.currency,
              payment_fee_amount:
                feeAmountRaw == null ? null : new Prisma.Decimal(feeAmountRaw),
              payment_method_id: paymentMethodId,
              account_id: accountId ?? null,
              bookingId_booking: bucket.booking_id,
              id_agency: auth.id_agency,
              clientIds: [bucket.client_id],
              serviceIds: Array.from(
                new Set(
                  bucket.payments
                    .map((item) => item.service_id)
                    .filter((id): id is number => typeof id === "number" && id > 0),
                ),
              ),
              payments: {
                create: [
                  {
                    amount: total,
                    payment_method_id: paymentMethodId!,
                    account_id: accountId ?? null,
                  },
                ],
              },
            },
            select: { id_receipt: true },
          });
          createdReceiptId = receipt.id_receipt;
        }

        await tx.clientPayment.updateMany({
          where: { id_payment: { in: bucket.payments.map((item) => item.id_payment) } },
          data: {
            status: "PAGADA",
            paid_at: paidAt,
            paid_by: auth.id_user,
            receipt_id: createdReceiptId,
            status_reason: "Cobro masivo de grupal",
          },
        });

        for (const payment of bucket.payments) {
          await tx.clientPaymentAudit.create({
            data: {
              client_payment_id: payment.id_payment,
              id_agency: auth.id_agency,
              action: "STATUS_CHANGED",
              from_status: payment.status,
              to_status: "PAGADA",
              reason: "Cobro masivo grupal",
              changed_by: auth.id_user,
              data: {
                group_id: group.id_travel_group,
                receipt_id: createdReceiptId,
              },
            },
          });
        }

        settledCount += bucket.payments.length;
        receiptsCreated.push({
          booking_id: bucket.booking_id,
          client_id: bucket.client_id,
          currency: bucket.currency,
          receipt_id: createdReceiptId,
          payment_ids: bucket.payments.map((item) => item.id_payment),
        });
      }
    });

    return res.status(200).json({
      ok: true,
      settled_count: settledCount,
      receipts_count: receiptsCreated.filter((item) => item.receipt_id != null).length,
      buckets: receiptsCreated,
    });
  } catch (error) {
    console.error("[groups][bulk][collect]", error);
    return groupApiError(res, 500, "No pudimos cobrar los pagos en lote.", {
      code: "GROUP_COLLECT_ERROR",
      solution: "Reintentá en unos segundos.",
    });
  }
}
