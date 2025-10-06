// src/pages/api/finance/currencies/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import type { FinanceCurrency } from "@prisma/client";
import { parseIdParam, requireMethod } from "../_utils";
import { currencyUpdateSchema } from "../_schemas";
import { Prisma } from "@prisma/client";

type ItemResponse = FinanceCurrency;
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ItemResponse | ErrorResponse>,
) {
  const id = parseIdParam(req.query.id);
  if (!id) return res.status(400).json({ error: "id inválido" });

  try {
    if (req.method === "PATCH") {
      const update = currencyUpdateSchema.safeParse(
        typeof req.body === "string" ? JSON.parse(req.body) : req.body,
      );
      if (!update.success) {
        return res.status(400).json({ error: update.error.message });
      }

      const current = await prisma.financeCurrency.findUnique({
        where: { id_currency: id },
      });
      if (!current) return res.status(404).json({ error: "No encontrado" });
      if (current.lock_system) {
        const wantsCritical =
          update.data.code !== undefined ||
          update.data.name !== undefined ||
          update.data.symbol !== undefined; // ← quitado "decimals"
        if (wantsCritical) {
          return res
            .status(409)
            .json({ error: "Elemento protegido (lock_system)" });
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (update.data.is_primary === true) {
          await tx.financeCurrency.updateMany({
            where: { id_agency: current.id_agency, is_primary: true },
            data: { is_primary: false },
          });
        }
        return tx.financeCurrency.update({
          where: { id_currency: id },
          data: update.data,
        });
      });

      return res.status(200).json(updated);
    }

    if (req.method === "DELETE") {
      const current = await prisma.financeCurrency.findUnique({
        where: { id_currency: id },
      });
      if (!current) return res.status(404).json({ error: "No encontrado" });
      if (current.lock_system) {
        return res
          .status(409)
          .json({ error: "Elemento protegido (lock_system)" });
      }
      await prisma.financeCurrency.delete({ where: { id_currency: id } });
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
    console.error("Currencies [id] error:", e);
    return res.status(status).json({ error: "Error interno" });
  }
}
