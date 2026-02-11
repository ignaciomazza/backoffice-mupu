import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import { isFinanceDateLocked } from "@/lib/financeLocks";

type DecimalLike = number | { toString(): string } | null | undefined;

function toNum(value: DecimalLike): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value.toString());
}

function toCurrency(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      0,
      0,
      0,
      0,
    );
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBool(value: unknown): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function optionalPositiveNumber() {
  return z.preprocess(
    (v) => {
      if (v == null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    },
    z.number().positive().optional(),
  );
}

function optionalPositiveInt() {
  return z.preprocess(
    (v) => {
      if (v == null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : v;
    },
    z.number().int().positive().optional(),
  );
}

const createSchema = z.object({
  transfer_date: z.string().trim().optional(),
  note: z.string().trim().max(2000).nullish(),

  origin_account_id: optionalPositiveInt(),
  origin_method_id: optionalPositiveInt(),
  origin_currency: z.string().trim().min(2),
  origin_amount: z.coerce.number().positive(),

  destination_account_id: optionalPositiveInt(),
  destination_method_id: optionalPositiveInt(),
  destination_currency: z.string().trim().min(2),
  destination_amount: z.coerce.number().positive(),

  fx_rate: optionalPositiveNumber(),

  fee_amount: optionalPositiveNumber(),
  fee_currency: z.string().trim().min(2).nullish(),
  fee_account_id: optionalPositiveInt(),
  fee_method_id: optionalPositiveInt(),
  fee_note: z.string().trim().max(2000).nullish(),
});

type TransferEntity = {
  id_transfer: number;
  transfer_date: Date;
  note: string | null;
  origin_account_id: number | null;
  origin_method_id: number | null;
  origin_currency: string;
  origin_amount: DecimalLike;
  destination_account_id: number | null;
  destination_method_id: number | null;
  destination_currency: string;
  destination_amount: DecimalLike;
  fx_rate: DecimalLike;
  fee_amount: DecimalLike;
  fee_currency: string | null;
  fee_account_id: number | null;
  fee_method_id: number | null;
  fee_note: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: number | null;
  delete_reason: string | null;
};

function serializeTransfer(
  transfer: TransferEntity,
  accountNameById: Map<number, string>,
  methodNameById: Map<number, string>,
) {
  return {
    id_transfer: transfer.id_transfer,
    transfer_date: transfer.transfer_date,
    note: transfer.note,
    origin_account_id: transfer.origin_account_id,
    origin_account_name:
      transfer.origin_account_id != null
        ? (accountNameById.get(transfer.origin_account_id) ?? null)
        : null,
    origin_method_id: transfer.origin_method_id,
    origin_method_name:
      transfer.origin_method_id != null
        ? (methodNameById.get(transfer.origin_method_id) ?? null)
        : null,
    origin_currency: transfer.origin_currency,
    origin_amount: toNum(transfer.origin_amount),

    destination_account_id: transfer.destination_account_id,
    destination_account_name:
      transfer.destination_account_id != null
        ? (accountNameById.get(transfer.destination_account_id) ?? null)
        : null,
    destination_method_id: transfer.destination_method_id,
    destination_method_name:
      transfer.destination_method_id != null
        ? (methodNameById.get(transfer.destination_method_id) ?? null)
        : null,
    destination_currency: transfer.destination_currency,
    destination_amount: toNum(transfer.destination_amount),

    fx_rate: transfer.fx_rate != null ? toNum(transfer.fx_rate) : null,
    fee_amount: transfer.fee_amount != null ? toNum(transfer.fee_amount) : null,
    fee_currency: transfer.fee_currency,
    fee_account_id: transfer.fee_account_id,
    fee_account_name:
      transfer.fee_account_id != null
        ? (accountNameById.get(transfer.fee_account_id) ?? null)
        : null,
    fee_method_id: transfer.fee_method_id,
    fee_method_name:
      transfer.fee_method_id != null
        ? (methodNameById.get(transfer.fee_method_id) ?? null)
        : null,
    fee_note: transfer.fee_note,

    created_by: transfer.created_by,
    created_at: transfer.created_at,
    updated_at: transfer.updated_at,
    deleted_at: transfer.deleted_at,
    deleted_by: transfer.deleted_by,
    delete_reason: transfer.delete_reason,
  };
}

async function resolveFinanceMaps(agencyId: number) {
  const [accounts, methods] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { id_agency: agencyId },
      select: { id_account: true, name: true, currency: true },
    }),
    prisma.financePaymentMethod.findMany({
      where: { id_agency: agencyId },
      select: { id_method: true, name: true },
    }),
  ]);

  const accountById = new Map<
    number,
    { id_account: number; name: string; currency: string | null }
  >();
  const accountNameById = new Map<number, string>();
  for (const account of accounts) {
    accountById.set(account.id_account, account);
    accountNameById.set(account.id_account, account.name);
  }

  const methodById = new Map<number, { id_method: number; name: string }>();
  const methodNameById = new Map<number, string>();
  for (const method of methods) {
    methodById.set(method.id_method, method);
    methodNameById.set(method.id_method, method.name);
  }

  return { accountById, accountNameById, methodById, methodNameById };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const planAccess = await ensurePlanFeatureAccess(auth.id_agency, "cashbox");
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const grants = await getFinanceSectionGrants(auth.id_agency, auth.id_user);
  const canTransfers = canAccessFinanceSection(
    auth.role,
    grants,
    "account_transfers",
  );
  if (!canTransfers) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  if (req.method === "GET") {
    const year = Number(
      Array.isArray(req.query.year) ? req.query.year[0] : req.query.year,
    );
    const month = Number(
      Array.isArray(req.query.month) ? req.query.month[0] : req.query.month,
    );
    const fromRaw = Array.isArray(req.query.from)
      ? req.query.from[0]
      : req.query.from;
    const toRaw = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to;
    const includeDeleted = parseBool(req.query.include_deleted);
    const take = Math.max(
      1,
      Math.min(
        500,
        Number(Array.isArray(req.query.take) ? req.query.take[0] : req.query.take) ||
          200,
      ),
    );

    let from: Date | null = parseDate(typeof fromRaw === "string" ? fromRaw : "");
    let to: Date | null = parseDate(typeof toRaw === "string" ? toRaw : "");

    if (!from || !to) {
      const now = new Date();
      const y = Number.isFinite(year) ? year : now.getFullYear();
      const m =
        Number.isFinite(month) && month >= 1 && month <= 12
          ? month
          : now.getMonth() + 1;
      from = new Date(y, m - 1, 1, 0, 0, 0, 0);
      to = new Date(y, m, 0, 23, 59, 59, 999);
    }

    const where = {
      id_agency: auth.id_agency,
      transfer_date: { gte: from, lte: to },
      ...(includeDeleted ? {} : { deleted_at: null }),
    };

    const items = await prisma.financeTransfer.findMany({
      where,
      orderBy: [{ transfer_date: "desc" }, { id_transfer: "desc" }],
      take,
    });

    const { accountNameById, methodNameById } = await resolveFinanceMaps(
      auth.id_agency,
    );
    return res.status(200).json({
      items: items.map((item) =>
        serializeTransfer(
          item as unknown as TransferEntity,
          accountNameById,
          methodNameById,
        ),
      ),
      range: { from, to },
    });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }

    const input = parsed.data;
    const transferDate =
      parseDate(input.transfer_date) ?? new Date();

    if (await isFinanceDateLocked(auth.id_agency, transferDate)) {
      return res.status(409).json({
        error:
          "El mes del movimiento está bloqueado. Desbloquealo para registrar transferencias.",
      });
    }

    if (!input.origin_account_id && !input.origin_method_id) {
      return res.status(400).json({
        error:
          "Completá cuenta o método de pago en el origen de la transferencia.",
      });
    }
    if (!input.destination_account_id && !input.destination_method_id) {
      return res.status(400).json({
        error:
          "Completá cuenta o método de pago en el destino de la transferencia.",
      });
    }

    const originCurrency = toCurrency(input.origin_currency);
    const destinationCurrency = toCurrency(input.destination_currency);
    const feeCurrencyRaw = toCurrency(input.fee_currency || "");
    const hasFee = typeof input.fee_amount === "number" && input.fee_amount > 0;
    const feeCurrency = hasFee
      ? feeCurrencyRaw || originCurrency
      : null;

    const fxRate =
      input.fx_rate && input.fx_rate > 0
        ? input.fx_rate
        : originCurrency !== destinationCurrency
          ? input.destination_amount / input.origin_amount
          : null;

    const { accountById, accountNameById, methodById, methodNameById } =
      await resolveFinanceMaps(auth.id_agency);

    const accountIds = [
      input.origin_account_id,
      input.destination_account_id,
      input.fee_account_id,
    ].filter((id): id is number => Number.isFinite(id));
    for (const accountId of accountIds) {
      const account = accountById.get(accountId);
      if (!account) {
        return res.status(400).json({ error: `Cuenta inválida: ${accountId}` });
      }
    }

    const methodIds = [
      input.origin_method_id,
      input.destination_method_id,
      input.fee_method_id,
    ].filter((id): id is number => Number.isFinite(id));
    for (const methodId of methodIds) {
      if (!methodById.get(methodId)) {
        return res.status(400).json({ error: `Método inválido: ${methodId}` });
      }
    }

    const originAccount = input.origin_account_id
      ? accountById.get(input.origin_account_id)
      : null;
    const destinationAccount = input.destination_account_id
      ? accountById.get(input.destination_account_id)
      : null;
    const feeAccount = input.fee_account_id
      ? accountById.get(input.fee_account_id)
      : null;

    if (
      originAccount?.currency &&
      toCurrency(originAccount.currency) !== originCurrency
    ) {
      return res.status(400).json({
        error: `La cuenta origen tiene moneda fija (${toCurrency(originAccount.currency)}).`,
      });
    }
    if (
      destinationAccount?.currency &&
      toCurrency(destinationAccount.currency) !== destinationCurrency
    ) {
      return res.status(400).json({
        error: `La cuenta destino tiene moneda fija (${toCurrency(destinationAccount.currency)}).`,
      });
    }
    if (
      hasFee &&
      feeAccount?.currency &&
      feeCurrency &&
      toCurrency(feeAccount.currency) !== feeCurrency
    ) {
      return res.status(400).json({
        error: `La cuenta de comisión tiene moneda fija (${toCurrency(feeAccount.currency)}).`,
      });
    }

    const created = await prisma.financeTransfer.create({
      data: {
        id_agency: auth.id_agency,
        transfer_date: transferDate,
        note: input.note ?? null,
        origin_account_id: input.origin_account_id ?? null,
        origin_method_id: input.origin_method_id ?? null,
        origin_currency: originCurrency,
        origin_amount: input.origin_amount,
        destination_account_id: input.destination_account_id ?? null,
        destination_method_id: input.destination_method_id ?? null,
        destination_currency: destinationCurrency,
        destination_amount: input.destination_amount,
        fx_rate: fxRate,
        fee_amount: hasFee ? input.fee_amount : null,
        fee_currency: feeCurrency,
        fee_account_id: hasFee ? (input.fee_account_id ?? null) : null,
        fee_method_id: hasFee ? (input.fee_method_id ?? null) : null,
        fee_note: hasFee ? (input.fee_note ?? null) : null,
        created_by: auth.id_user,
      },
    });

    return res.status(201).json(
      serializeTransfer(
        created as unknown as TransferEntity,
        accountNameById,
        methodNameById,
      ),
    );
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
