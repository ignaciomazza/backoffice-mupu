// src/pages/api/finance/methods/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import type { FinancePaymentMethod } from "@prisma/client";
import { parseAgencyId, requireMethod } from "../_utils";
import { methodCreateSchema } from "../_schemas";
import { Prisma } from "@prisma/client";

type ListResponse = FinancePaymentMethod[];
type CreateResponse = FinancePaymentMethod;
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | CreateResponse | ErrorResponse>,
) {
  try {
    if (req.method === "GET") {
      const id_agency = parseAgencyId(req.query.agencyId);
      if (!id_agency) return res.status(400).json({ error: "agencyId inválido" });

      const items = await prisma.financePaymentMethod.findMany({
        where: { id_agency },
        orderBy: [{ sort_order: "asc" }, { name: "asc" }],
      });
      return res.status(200).json(items);
    }

    if (req.method === "POST") {
      const parsed = methodCreateSchema.safeParse(
        typeof req.body === "string" ? JSON.parse(req.body) : req.body,
      );
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      const created = await prisma.financePaymentMethod.create({ data: parsed.data });
      return res.status(201).json(created);
    }

    requireMethod(req, ["GET", "POST"]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return res.status(409).json({ error: "Duplicado (name o code)" });
    }
    const status = (e as { status?: number }).status ?? 500;
    // eslint-disable-next-line no-console
    console.error("Methods error:", e);
    return res.status(status).json({ error: "Error interno" });
  }
}
