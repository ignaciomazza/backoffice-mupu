import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import type { ExpenseCategory } from "@prisma/client";
import { requireMethod, resolveAgencyId } from "../_utils";
import { categoryCreateSchema } from "../_schemas";
import { Prisma } from "@prisma/client";

type ListResponse = ExpenseCategory[];
type CreateResponse = ExpenseCategory;
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | CreateResponse | ErrorResponse>,
) {
  try {
    if (req.method === "GET") {
      const id_agency = await resolveAgencyId(req);
      if (!id_agency)
        return res.status(400).json({ error: "agencia no detectada" });

      const items = await prisma.expenseCategory.findMany({
        where: { id_agency },
        orderBy: [{ sort_order: "asc" }, { name: "asc" }],
      });
      return res.status(200).json(items);
    }

    if (req.method === "POST") {
      const parsed = categoryCreateSchema.safeParse(
        typeof req.body === "string" ? JSON.parse(req.body) : req.body,
      );
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.message });

      const created = await prisma.expenseCategory.create({
        data: parsed.data,
      });
      return res.status(201).json(created);
    }

    requireMethod(req, ["GET", "POST"]);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return res.status(409).json({ error: "Duplicado (name)" });
    }
    const status = (e as { status?: number }).status ?? 500;
    console.error("Categories error:", e);
    return res.status(status).json({ error: "Error interno" });
  }
}
