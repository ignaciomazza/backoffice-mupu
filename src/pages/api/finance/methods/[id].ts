// src/pages/api/finance/methods/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import type { FinancePaymentMethod } from "@prisma/client";
import { parseIdParam, requireMethod } from "../_utils";
import { methodUpdateSchema } from "../_schemas";
import { Prisma } from "@prisma/client";

type ItemResponse = FinancePaymentMethod;
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ItemResponse | ErrorResponse>,
) {
  const id = parseIdParam(req.query.id);
  if (!id) return res.status(400).json({ error: "id inválido" });

  try {
    if (req.method === "PATCH") {
      const parsed = methodUpdateSchema.safeParse(
        typeof req.body === "string" ? JSON.parse(req.body) : req.body,
      );
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      const current = await prisma.financePaymentMethod.findUnique({ where: { id_method: id } });
      if (!current) return res.status(404).json({ error: "No encontrado" });
      if (current.lock_system) {
        const wantsCritical =
          parsed.data.name !== undefined ||
          parsed.data.code !== undefined ||
          parsed.data.requires_account !== undefined;
        if (wantsCritical) {
          return res.status(409).json({ error: "Elemento protegido (lock_system)" });
        }
      }

      const updated = await prisma.financePaymentMethod.update({
        where: { id_method: id },
        data: parsed.data,
      });
      return res.status(200).json(updated);
    }

    if (req.method === "DELETE") {
      const current = await prisma.financePaymentMethod.findUnique({ where: { id_method: id } });
      if (!current) return res.status(404).json({ error: "No encontrado" });
      if (current.lock_system) {
        return res.status(409).json({ error: "Elemento protegido (lock_system)" });
      }
      await prisma.financePaymentMethod.delete({ where: { id_method: id } });
      return res.status(200).json(current);
    }

    requireMethod(req, ["PATCH", "DELETE"]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return res.status(409).json({ error: "Duplicado" });
    }
    const status = (e as { status?: number }).status ?? 500;
    // eslint-disable-next-line no-console
    console.error("Methods [id] error:", e);
    return res.status(status).json({ error: "Error interno" });
  }
}
