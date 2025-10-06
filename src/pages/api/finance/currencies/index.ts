// src/pages/api/finance/currencies/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getAuth } from "../_auth";
import { currencyCreateSchema } from "../_schemas";
import type { FinanceCurrency } from "@prisma/client";

type ErrorResponse = { error: string };
type CreateResponse = { ok: true; currency: FinanceCurrency };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateResponse | ErrorResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const auth = await getAuth(req);
  const queryAgency = Number(req.query.id_agency);
  const id_agency = Number.isFinite(queryAgency) ? queryAgency : auth.agencyId;

  if (!id_agency) {
    return res.status(400).json({ error: "No se pudo determinar la agencia" });
  }

  const parsed = currencyCreateSchema.safeParse(
    typeof req.body === "string" ? JSON.parse(req.body) : req.body,
  );
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }

  const data = parsed.data;
  const code = data.code.trim().toUpperCase();
  const name = data.name.trim();
  const symbol = data.symbol.trim();
  const enabled = data.enabled ?? true;

  try {
    // Duplicado por agencia + código
    const dup = await prisma.financeCurrency.findFirst({
      where: { id_agency, code },
      select: { id_currency: true },
    });
    if (dup) {
      return res.status(409).json({ error: `La moneda ${code} ya existe.` });
    }

    // Próximo sort_order
    const agg = await prisma.financeCurrency.aggregate({
      where: { id_agency },
      _max: { sort_order: true },
    });
    const nextSort = (agg._max.sort_order ?? 0) + 1;

    const currency = await prisma.financeCurrency.create({
      data: {
        id_agency,
        code,
        name,
        symbol,
        enabled,
        is_primary: false,
        sort_order: nextSort,
      },
    });

    return res.status(201).json({ ok: true, currency });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("finance/currencies POST error:", e);
    return res.status(500).json({ error: "Error interno" });
  }
}
