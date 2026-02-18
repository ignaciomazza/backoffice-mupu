// src/pages/api/finance/categories/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { getNextAgencyCounter } from "@/lib/agencyCounters";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";
import { getFinancePicksAccess } from "@/lib/accessControl";
import { hasSchemaColumn } from "@/lib/schemaColumns";

const scopeSchema = z.enum(["INVESTMENT", "OTHER_INCOME"]);

const createSchema = z.object({
  name: z.string().trim().min(2),
  scope: scopeSchema,
  requires_operator: z.boolean().optional().default(false),
  requires_user: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
});

function scopeLabel(scope: "INVESTMENT" | "OTHER_INCOME"): string {
  return scope === "OTHER_INCOME" ? "ingresos" : "egresos";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { canRead, canWrite } = await getFinancePicksAccess(
    auth.id_agency,
    auth.id_user,
    auth.role,
  );

  if (req.method === "GET") {
    if (!canRead) return res.status(403).json({ error: "Sin permisos" });
    const rawScope = Array.isArray(req.query.scope)
      ? req.query.scope[0]
      : req.query.scope;
    const scope = typeof rawScope === "string" ? rawScope.trim().toUpperCase() : "";
    if (scope) {
      const parsedScope = scopeSchema.safeParse(scope);
      if (!parsedScope.success) {
        return res.status(400).json({ error: "scope inválido" });
      }
    }

    const hasScope = await hasSchemaColumn("ExpenseCategory", "scope");
    if (!hasScope) {
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

      const normalized = legacyItems.map((item) => ({
        ...item,
        scope: "INVESTMENT" as const,
      }));
      if (scope === "OTHER_INCOME") {
        return res.status(200).json([]);
      }
      return res.status(200).json(normalized);
    }

    const items = await prisma.expenseCategory.findMany({
      where: {
        id_agency: auth.id_agency,
        ...(scope ? { scope: scope as "INVESTMENT" | "OTHER_INCOME" } : {}),
      },
      orderBy: [{ name: "asc" }],
    });
    return res.status(200).json(items);
  }

  if (req.method === "POST") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.message });

    const hasScope = await hasSchemaColumn("ExpenseCategory", "scope");
    if (!hasScope) {
      return res.status(409).json({
        error:
          "La base conectada por la app no tiene ExpenseCategory.scope. Ejecutá migraciones en esa misma conexión.",
      });
    }

    const duplicateSameScope = await prisma.expenseCategory.findFirst({
      where: {
        id_agency: auth.id_agency,
        name: parsed.data.name,
        scope: parsed.data.scope,
      },
      select: { id_category: true },
    });
    if (duplicateSameScope) {
      return res.status(409).json({
        error: `Ya existe una categoría con ese nombre en ${scopeLabel(parsed.data.scope)}.`,
      });
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const agencyCategoryId = await getNextAgencyCounter(
          tx,
          auth.id_agency,
          "expense_category",
        );
        return tx.expenseCategory.create({
          data: {
            ...parsed.data,
            id_agency: auth.id_agency,
            agency_expense_category_id: agencyCategoryId,
          },
        });
      });
      return res.status(201).json(created);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return res.status(409).json({
          error:
            "La base todavía tiene unicidad global por nombre. Para permitir el mismo nombre entre ingresos y egresos, aplicá la migración 20260218203000_expense_category_unique_by_scope.",
        });
      }
      throw e;
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
