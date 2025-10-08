// src/pages/api/finance/categories/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import type { ExpenseCategory } from "@prisma/client";
import { parseIdParam, requireMethod } from "../_utils";
import { categoryUpdateSchema } from "../_schemas";
import { Prisma } from "@prisma/client";

type ItemResponse = ExpenseCategory;
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ItemResponse | ErrorResponse>,
) {
  const id = parseIdParam(req.query.id);
  if (!id) return res.status(400).json({ error: "id inválido" });

  try {
    if (req.method === "PATCH") {
      const parsed = categoryUpdateSchema.safeParse(
        typeof req.body === "string" ? JSON.parse(req.body) : req.body,
      );
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.message });

      const current = await prisma.expenseCategory.findUnique({
        where: { id_category: id },
      });
      if (!current) return res.status(404).json({ error: "No encontrado" });
      if (current.lock_system) {
        return res
          .status(409)
          .json({ error: "Elemento protegido (lock_system)" });
      }

      const updated = await prisma.expenseCategory.update({
        where: { id_category: id },
        data: parsed.data,
      });
      return res.status(200).json(updated);
    }

    if (req.method === "DELETE") {
      const current = await prisma.expenseCategory.findUnique({
        where: { id_category: id },
      });
      if (!current) return res.status(404).json({ error: "No encontrado" });
      if (current.lock_system) {
        return res
          .status(409)
          .json({ error: "Elemento protegido (lock_system)" });
      }
      await prisma.expenseCategory.delete({ where: { id_category: id } });
      return res.status(200).json(current);
    }

    requireMethod(req, ["PATCH", "DELETE"]);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return res.status(409).json({ error: "Duplicado" });
    }
    const status = (e as { status?: number }).status ?? 500;
    console.error("Categories [id] error:", e);
    return res.status(status).json({ error: "Error interno" });
  }
}
