// src/pages/api/finance/categories/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";
import { getFinancePicksAccess } from "@/lib/accessControl";
import { hasSchemaColumn } from "@/lib/schemaColumns";

const scopeSchema = z.enum(["INVESTMENT", "OTHER_INCOME"]);

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  scope: scopeSchema.optional(),
  requires_operator: z.boolean().optional(),
  requires_user: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

function scopeLabel(scope: "INVESTMENT" | "OTHER_INCOME"): string {
  return scope === "OTHER_INCOME" ? "ingresos" : "egresos";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const id = Number(
    Array.isArray(req.query.id) ? req.query.id[0] : req.query.id,
  );
  if (!Number.isFinite(id) || id <= 0)
    return res.status(400).json({ error: "id inválido" });

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { canRead, canWrite } = await getFinancePicksAccess(
    auth.id_agency,
    auth.id_user,
    auth.role,
  );
  const hasScope = await hasSchemaColumn("ExpenseCategory", "scope");
  const where = { id_category: id, id_agency: auth.id_agency };

  if (req.method === "GET") {
    if (!canRead) return res.status(403).json({ error: "Sin permisos" });
    const item = hasScope
      ? await prisma.expenseCategory.findFirst({ where })
      : await prisma.expenseCategory.findFirst({
          where,
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
    if (!item) return res.status(404).json({ error: "No encontrado" });
    return res
      .status(200)
      .json(hasScope ? item : { ...item, scope: "INVESTMENT" as const });
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.message });

    if (!hasScope && parsed.data.scope !== undefined) {
      return res.status(409).json({
        error:
          "La base conectada por la app no tiene ExpenseCategory.scope. Ejecutá migraciones en esa misma conexión.",
      });
    }

    const existing = hasScope
      ? await prisma.expenseCategory.findFirst({ where })
      : await prisma.expenseCategory.findFirst({
          where,
          select: { id_category: true },
        });
    if (!existing) return res.status(404).json({ error: "No encontrado" });

    if (hasScope) {
      const existingScoped = existing as {
        id_category: number;
        name: string;
        scope: "INVESTMENT" | "OTHER_INCOME";
      };
      const targetName = parsed.data.name ?? existingScoped.name;
      const targetScope = parsed.data.scope ?? existingScoped.scope;

      const duplicateSameScope = await prisma.expenseCategory.findFirst({
        where: {
          id_agency: auth.id_agency,
          name: targetName,
          scope: targetScope,
          id_category: { not: id },
        },
        select: { id_category: true },
      });
      if (duplicateSameScope) {
        return res.status(409).json({
          error: `Ya existe una categoría con ese nombre en ${scopeLabel(targetScope)}.`,
        });
      }
    }

    try {
      const updated = hasScope
        ? await prisma.expenseCategory.update({
            where: { id_category: id },
            data: parsed.data,
          })
        : await prisma.expenseCategory.update({
            where: { id_category: id },
            data: {
              ...(parsed.data.name !== undefined
                ? { name: parsed.data.name }
                : {}),
              ...(parsed.data.requires_operator !== undefined
                ? { requires_operator: parsed.data.requires_operator }
                : {}),
              ...(parsed.data.requires_user !== undefined
                ? { requires_user: parsed.data.requires_user }
                : {}),
              ...(parsed.data.enabled !== undefined
                ? { enabled: parsed.data.enabled }
                : {}),
            },
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
      return res.status(200).json(updated);
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

  if (req.method === "DELETE") {
    if (!canWrite) return res.status(403).json({ error: "Sin permisos" });
    const existing = hasScope
      ? await prisma.expenseCategory.findFirst({ where })
      : await prisma.expenseCategory.findFirst({
          where,
          select: { id_category: true },
        });
    if (!existing) return res.status(404).json({ error: "No encontrado" });
    if (hasScope) {
      await prisma.expenseCategory.delete({ where: { id_category: id } });
    } else {
      await prisma.expenseCategory.deleteMany({ where: { id_category: id } });
    }
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PUT, PATCH, DELETE");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
