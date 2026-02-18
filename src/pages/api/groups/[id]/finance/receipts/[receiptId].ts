import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { groupApiError } from "@/lib/groups/apiErrors";
import {
  normalizeCurrencyCode,
  parseDateInput,
  parseOptionalPositiveInt,
  requireGroupFinanceContext,
  toDecimal,
} from "@/lib/groups/financeShared";

async function findReceipt(
  agencyId: number,
  groupId: number,
  receiptId: number,
) {
  const rows = await prisma.$queryRaw<
    Array<{ id_travel_group_receipt: number }>
  >(Prisma.sql`
    SELECT "id_travel_group_receipt"
    FROM "TravelGroupReceipt"
    WHERE "id_travel_group_receipt" = ${receiptId}
      AND "id_agency" = ${agencyId}
      AND "travel_group_id" = ${groupId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireGroupFinanceContext(req, res, { write: true });
  if (!ctx) return;
  if (!req.body || typeof req.body !== "object") {
    return groupApiError(res, 400, "Body inválido o vacío.", {
      code: "GROUP_FINANCE_BODY_INVALID",
    });
  }

  const receiptId = parseOptionalPositiveInt(
    Array.isArray(req.query.receiptId) ? req.query.receiptId[0] : req.query.receiptId,
  );
  if (!receiptId) {
    return groupApiError(res, 400, "El identificador del recibo es inválido.", {
      code: "GROUP_FINANCE_RECEIPT_ID_INVALID",
    });
  }

  const existing = await findReceipt(
    ctx.auth.id_agency,
    ctx.group.id_travel_group,
    receiptId,
  );
  if (!existing) {
    return groupApiError(res, 404, "No encontramos ese recibo de grupal.", {
      code: "GROUP_FINANCE_RECEIPT_NOT_FOUND",
    });
  }

  const body = req.body as {
    concept?: unknown;
    amount?: unknown;
    amountString?: unknown;
    amountCurrency?: unknown;
    issue_date?: unknown;
    payment_fee_amount?: unknown;
    payment_method?: unknown;
    account?: unknown;
    currency?: unknown;
    base_amount?: unknown;
    base_currency?: unknown;
    counter_amount?: unknown;
    counter_currency?: unknown;
    clientIds?: unknown;
    serviceIds?: unknown;
  };

  const conceptRaw =
    typeof body.concept === "string" ? body.concept.trim().slice(0, 300) : "";
  const concept = conceptRaw || "Cobro de grupal";

  const amount = toDecimal(Number(body.amount)).toDecimalPlaces(2);
  if (amount.lte(0)) {
    return groupApiError(res, 400, "El monto del recibo debe ser mayor a cero.", {
      code: "GROUP_FINANCE_AMOUNT_INVALID",
    });
  }

  const issueDate = parseDateInput(body.issue_date) ?? new Date();
  const amountString =
    typeof body.amountString === "string" && body.amountString.trim()
      ? body.amountString.trim().slice(0, 300)
      : "";
  const amountCurrency = normalizeCurrencyCode(body.amountCurrency);
  const paymentFeeAmount =
    body.payment_fee_amount === null ||
    body.payment_fee_amount === undefined ||
    body.payment_fee_amount === ""
      ? null
      : toDecimal(Number(body.payment_fee_amount)).toDecimalPlaces(2);
  const paymentMethod =
    typeof body.payment_method === "string" && body.payment_method.trim()
      ? body.payment_method.trim().slice(0, 120)
      : null;
  const account =
    typeof body.account === "string" && body.account.trim()
      ? body.account.trim().slice(0, 180)
      : null;
  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().slice(0, 120)
      : amountCurrency;

  const baseAmount =
    body.base_amount === null || body.base_amount === undefined || body.base_amount === ""
      ? null
      : toDecimal(Number(body.base_amount)).toDecimalPlaces(2);
  const baseCurrency =
    typeof body.base_currency === "string" && body.base_currency.trim()
      ? normalizeCurrencyCode(body.base_currency)
      : null;
  const counterAmount =
    body.counter_amount === null ||
    body.counter_amount === undefined ||
    body.counter_amount === ""
      ? null
      : toDecimal(Number(body.counter_amount)).toDecimalPlaces(2);
  const counterCurrency =
    typeof body.counter_currency === "string" && body.counter_currency.trim()
      ? normalizeCurrencyCode(body.counter_currency)
      : null;

  const clientIds = Array.isArray(body.clientIds)
    ? body.clientIds
        .map((item) => parseOptionalPositiveInt(item))
        .filter((item): item is number => !!item)
    : [];
  const serviceIds = Array.isArray(body.serviceIds)
    ? body.serviceIds
        .map((item) => parseOptionalPositiveInt(item))
        .filter((item): item is number => !!item)
    : [];

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "TravelGroupReceipt"
    SET "issue_date" = ${issueDate},
        "amount" = ${amount},
        "amount_string" = ${amountString},
        "amount_currency" = ${amountCurrency},
        "concept" = ${concept},
        "currency" = ${currency},
        "payment_method" = ${paymentMethod},
        "payment_fee_amount" = ${paymentFeeAmount},
        "account" = ${account},
        "base_amount" = ${baseAmount},
        "base_currency" = ${baseCurrency},
        "counter_amount" = ${counterAmount},
        "counter_currency" = ${counterCurrency},
        "client_ids" = ${clientIds},
        "service_refs" = ${serviceIds},
        "updated_at" = NOW()
    WHERE "id_travel_group_receipt" = ${receiptId}
      AND "id_agency" = ${ctx.auth.id_agency}
      AND "travel_group_id" = ${ctx.group.id_travel_group}
  `);

  return res.status(200).json({ success: true, id_receipt: receiptId });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireGroupFinanceContext(req, res, { write: true });
  if (!ctx) return;

  const receiptId = parseOptionalPositiveInt(
    Array.isArray(req.query.receiptId) ? req.query.receiptId[0] : req.query.receiptId,
  );
  if (!receiptId) {
    return groupApiError(res, 400, "El identificador del recibo es inválido.", {
      code: "GROUP_FINANCE_RECEIPT_ID_INVALID",
    });
  }

  const existing = await findReceipt(
    ctx.auth.id_agency,
    ctx.group.id_travel_group,
    receiptId,
  );
  if (!existing) {
    return groupApiError(res, 404, "No encontramos ese recibo de grupal.", {
      code: "GROUP_FINANCE_RECEIPT_NOT_FOUND",
    });
  }

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "TravelGroupReceipt"
    WHERE "id_travel_group_receipt" = ${receiptId}
      AND "id_agency" = ${ctx.auth.id_agency}
      AND "travel_group_id" = ${ctx.group.id_travel_group}
  `);

  return res.status(204).end();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "PATCH") return handlePatch(req, res);
  if (req.method === "DELETE") return handleDelete(req, res);
  res.setHeader("Allow", ["PATCH", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
