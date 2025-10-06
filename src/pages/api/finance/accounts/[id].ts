// src/pages/api/finance/accounts/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import type { FinanceAccount } from "@prisma/client";
import { parseIdParam, requireMethod } from "../_utils";
import { accountUpdateSchema } from "../_schemas";
import { Prisma } from "@prisma/client";

type ItemResponse = FinanceAccount;
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ItemResponse | ErrorResponse>,
) {
  const id = parseIdParam(req.query.id);
  if (!id) return res.status(400).json({ error: "id inválido" });

  try {
    if (req.method === "PATCH") {
      const parsed = accountUpdateSchema.safeParse(
        typeof req.body === "string" ? JSON.parse(req.body) : req.body,
      );
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      const current = await prisma.financeAccount.findUnique({ where: { id_account: id } });
      if (!current) return res.status(404).json({ error: "No encontrado" });
      if (current.lock_system) {
        // bloqueo fuerte
        return res.status(409).json({ error: "Elemento protegido (lock_system)" });
      }

      const updated = await prisma.financeAccount.update({
        where: { id_account: id },
        data: parsed.data,
      });
      return res.status(200).json(updated);
    }

    if (req.method === "DELETE") {
      const current = await prisma.financeAccount.findUnique({ where: { id_account: id } });
      if (!current) return res.status(404).json({ error: "No encontrado" });
      if (current.lock_system) {
        return res.status(409).json({ error: "Elemento protegido (lock_system)" });
      }
      await prisma.financeAccount.delete({ where: { id_account: id } });
      return res.status(200).json(current);
    }

    requireMethod(req, ["PATCH", "DELETE"]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return res.status(409).json({ error: "Duplicado" });
    }
    const status = (e as { status?: number }).status ?? 500;
    // eslint-disable-next-line no-console
    console.error("Accounts [id] error:", e);
    return res.status(status).json({ error: "Error interno" });
  }
}
