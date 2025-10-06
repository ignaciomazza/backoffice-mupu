// src/pages/api/finance/methods/reorder.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { reorderSchema } from "../_schemas";

type ReorderResponse = { ok: true };
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReorderResponse | ErrorResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const parsed = reorderSchema.safeParse(
    typeof req.body === "string" ? JSON.parse(req.body) : req.body,
  );
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.message });

  const { id_agency, items } = parsed.data;
  if (items.length === 0) return res.status(200).json({ ok: true });

  try {
    const ids = items.map((i) => i.id);
    const owned = await prisma.financePaymentMethod.findMany({
      where: { id_agency, id_method: { in: ids } },
      select: { id_method: true },
    });
    if (owned.length !== items.length) {
      return res
        .status(403)
        .json({ error: "Hay elementos que no pertenecen a la agencia" });
    }

    const results = await prisma.$transaction(
      items.map((it) =>
        prisma.financePaymentMethod.updateMany({
          where: { id_agency, id_method: it.id },
          data: { sort_order: it.sort_order },
        }),
      ),
    );
    if (results.some((r) => r.count !== 1)) {
      return res
        .status(409)
        .json({
          error: "No se pudo actualizar el orden de todos los elementos",
        });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Methods reorder error:", e);
    return res.status(500).json({ error: "Error interno" });
  }
}
