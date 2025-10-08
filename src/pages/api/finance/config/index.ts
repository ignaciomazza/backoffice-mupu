// src/pages/api/finance/config/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getAuth } from "../_auth";
import { configUpdateSchema } from "../_schemas";
import type {
  FinanceConfig,
  FinanceCurrency,
  FinanceAccount,
  FinancePaymentMethod,
  ExpenseCategory,
} from "@prisma/client";

type Bundle = {
  config: FinanceConfig | null;
  currencies: FinanceCurrency[];
  accounts: FinanceAccount[];
  paymentMethods: FinancePaymentMethod[];
  categories: ExpenseCategory[];
};

type ErrorResponse = { error: string };
type OkResponse = Bundle | { ok: true };

const emptyBundle: Bundle = {
  config: null,
  currencies: [],
  accounts: [],
  paymentMethods: [],
  categories: [],
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OkResponse | ErrorResponse>,
) {
  res.setHeader("Cache-Control", "no-store");

  // 👇 userId opcional para que sea asignable al AuthCtx real
  type AuthShape = { userId?: number | null; agencyId?: number | null };

  let auth: AuthShape | null = null;
  try {
    auth = await getAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Si la sesión existe pero no trae userId válido, también 401
  if (!auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // id_agency: query > auth
  const raw = Array.isArray(req.query.id_agency)
    ? req.query.id_agency[0]
    : req.query.id_agency;
  const parsedFromQuery = raw != null ? Number(raw) : NaN;
  const id_agency = Number.isFinite(parsedFromQuery)
    ? parsedFromQuery
    : (auth?.agencyId ?? null);

  // -------- GET --------
  if (req.method === "GET") {
    if (!id_agency) {
      return res.status(200).json(emptyBundle);
    }

    try {
      // sin sort_order para evitar 500 si la columna no existe
      const [config, currencies, accounts, paymentMethods, categories] =
        await Promise.all([
          prisma.financeConfig.findFirst({ where: { id_agency } }),
          prisma.financeCurrency.findMany({
            where: { id_agency },
            orderBy: { code: "asc" },
          }),
          prisma.financeAccount.findMany({
            where: { id_agency },
            orderBy: { name: "asc" },
          }),
          prisma.financePaymentMethod.findMany({
            where: { id_agency },
            orderBy: { name: "asc" },
          }),
          prisma.expenseCategory.findMany({
            where: { id_agency },
            orderBy: { name: "asc" },
          }),
        ]);

      return res.status(200).json({
        config,
        currencies,
        accounts,
        paymentMethods,
        categories,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("finance/config GET error:", e);
      // devolvemos estructura vacía para no romper el UI
      return res.status(200).json(emptyBundle);
    }
  }

  // -------- PUT --------
  if (req.method === "PUT") {
    if (!id_agency) {
      return res
        .status(400)
        .json({ error: "No se pudo determinar la agencia" });
    }

    const parsed = configUpdateSchema.safeParse(
      typeof req.body === "string" ? JSON.parse(req.body) : req.body,
    );
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }

    const { default_currency_code, hide_operator_expenses_in_investments } =
      parsed.data;

    try {
      await prisma.financeConfig.upsert({
        where: { id_agency },
        create: {
          id_agency,
          default_currency_code,
          hide_operator_expenses_in_investments:
            hide_operator_expenses_in_investments ?? false,
        },
        update: {
          default_currency_code,
          hide_operator_expenses_in_investments:
            hide_operator_expenses_in_investments ?? false,
        },
      });

      return res.status(200).json({ ok: true });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("finance/config PUT error:", e);
      return res.status(500).json({ error: "Error interno" });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method Not Allowed" });
}
