// src/pages/api/finance/accounts/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import type { FinanceAccount } from "@prisma/client";
import { requireMethod, resolveAgencyId } from "../_utils";
import { accountCreateSchema } from "../_schemas";
import { Prisma } from "@prisma/client";

type ListResponse = FinanceAccount[];
type CreateResponse = FinanceAccount;
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | CreateResponse | ErrorResponse>,
) {
  try {
    if (req.method === "GET") {
      const id_agency = await resolveAgencyId(req);
      if (!id_agency)
        return res
          .status(400)
          .json({ error: "No se pudo determinar la agencia" });

      const items = await prisma.financeAccount.findMany({
        where: { id_agency },
        orderBy: [{ sort_order: "asc" }, { name: "asc" }],
      });
      return res.status(200).json(items);
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const parsed = accountCreateSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }

      const id_agency = parsed.data.id_agency ?? (await resolveAgencyId(req));
      if (!id_agency)
        return res
          .status(400)
          .json({ error: "No se pudo determinar la agencia" });

      const created = await prisma.financeAccount.create({
        data: {
          id_agency,
          name: parsed.data.name,
          enabled: parsed.data.enabled ?? true,
          alias: parsed.data.alias ?? null,
          type: parsed.data.type ?? null,
          cbu: parsed.data.cbu ?? null,
          currency: parsed.data.currency ?? null,
        },
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
    // eslint-disable-next-line no-console
    console.error("Accounts error:", e);
    return res.status(status).json({ error: "Error interno" });
  }
}
