import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveAuth } from "@/lib/auth";
import { getFinancePicksAccess } from "@/lib/accessControl";
import { hasSchemaColumn } from "@/lib/schemaColumns";

type PicksResponse = {
  currencies: unknown[];
  accounts: unknown[];
  paymentMethods: unknown[];
  categories: unknown[];
};

const SERVICE_READ_ROLES = new Set(["vendedor", "lider", "equipo", "marketing"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PicksResponse | { error: string }>,
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const { canRead } = await getFinancePicksAccess(
    auth.id_agency,
    auth.id_user,
    auth.role,
  );
  const role = String(auth.role || "").trim().toLowerCase();
  const canReadForServiceUsers = SERVICE_READ_ROLES.has(role);

  if (!canRead && !canReadForServiceUsers) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  try {
    const currencies = await prisma.financeCurrency.findMany({
      where: { id_agency: auth.id_agency },
      orderBy: [{ is_primary: "desc" }, { code: "asc" }],
    });

    if (!canRead) {
      return res.status(200).json({
        currencies,
        accounts: [],
        paymentMethods: [],
        categories: [],
      });
    }

    const accounts = await prisma.financeAccount.findMany({
      where: { id_agency: auth.id_agency },
      orderBy: [{ name: "asc" }],
    });

    const paymentMethods = await prisma.financePaymentMethod.findMany({
      where: { id_agency: auth.id_agency },
      orderBy: [{ name: "asc" }],
    });

    let categories: unknown[] = [];
    const hasScope = await hasSchemaColumn("ExpenseCategory", "scope");
    if (hasScope) {
      categories = await prisma.expenseCategory.findMany({
        where: { id_agency: auth.id_agency },
        orderBy: [{ name: "asc" }],
      });
    } else {
      const legacyItems = await prisma.expenseCategory.findMany({
        where: { id_agency: auth.id_agency },
        orderBy: [{ name: "asc" }],
        select: {
          id_category: true,
          agency_expense_category_id: true,
          id_agency: true,
          name: true,
          code: true,
          requires_operator: true,
          requires_user: true,
          enabled: true,
          sort_order: true,
          lock_system: true,
          created_at: true,
          updated_at: true,
        },
      });
      categories = legacyItems.map((item) => ({
        ...item,
        scope: "INVESTMENT" as const,
      }));
    }

    return res.status(200).json({
      currencies,
      accounts,
      paymentMethods,
      categories,
    });
  } catch (error) {
    console.error("[finance/picks][GET] Error", error);
    return res.status(500).json({ error: "Error obteniendo picks de finanzas" });
  }
}

