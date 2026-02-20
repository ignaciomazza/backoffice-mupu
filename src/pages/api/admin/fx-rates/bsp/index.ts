import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { resolveBillingAuth, isBillingAdminRole } from "@/lib/billingAuth";
import {
  startOfDayUtcFromDateKeyInBuenosAires,
  toDateKeyInBuenosAires,
  todayDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";
import { logBillingEvent } from "@/services/billing/events";

const BspUpsertSchema = z.object({
  rate_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ars_per_usd: z.coerce.number().positive("ars_per_usd debe ser mayor a 0"),
  note: z.string().trim().max(500).optional(),
});

function serializeRate(rate: {
  id_fx_rate: number;
  fx_type: "DOLAR_BSP";
  rate_date: Date;
  ars_per_usd: unknown;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id_fx_rate: rate.id_fx_rate,
    fx_type: rate.fx_type,
    rate_date: toDateKeyInBuenosAires(rate.rate_date),
    ars_per_usd: Number(rate.ars_per_usd ?? 0),
    note: rate.note,
    created_at: rate.created_at,
    updated_at: rate.updated_at,
  };
}

export async function upsertBspRate(input: {
  rateDateKey: string;
  arsPerUsd: number;
  note?: string;
  actorAgencyId: number;
  actorUserId?: number | null;
}) {
  const rateDate = startOfDayUtcFromDateKeyInBuenosAires(input.rateDateKey);
  if (!rateDate) {
    throw new Error("rate_date inválida");
  }

  const result = await prisma.$transaction(async (tx) => {
    const upserted = await tx.billingFxRate.upsert({
      where: {
        fx_type_rate_date: {
          fx_type: "DOLAR_BSP",
          rate_date: rateDate,
        },
      },
      create: {
        fx_type: "DOLAR_BSP",
        rate_date: rateDate,
        ars_per_usd: input.arsPerUsd,
        note: input.note ?? null,
        loaded_by: input.actorUserId ?? null,
      },
      update: {
        ars_per_usd: input.arsPerUsd,
        note: input.note ?? null,
        loaded_by: input.actorUserId ?? null,
      },
    });

    await logBillingEvent(
      {
        id_agency: input.actorAgencyId,
        event_type: "FX_RATE_UPSERT",
        payload: {
          fx_type: "DOLAR_BSP",
          rate_date: input.rateDateKey,
          ars_per_usd: input.arsPerUsd,
        },
        created_by: input.actorUserId ?? null,
      },
      tx,
    );

    return upserted;
  });

  return result;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await resolveBillingAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!isBillingAdminRole(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  if (req.method === "GET") {
    const items = await prisma.billingFxRate.findMany({
      where: { fx_type: "DOLAR_BSP" },
      orderBy: [{ rate_date: "desc" }, { id_fx_rate: "desc" }],
      take: 30,
    });

    return res.status(200).json({
      items: items.map(serializeRate),
    });
  }

  if (req.method === "POST") {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
    const parsed = BspUpsertSchema.safeParse(body);

    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues?.[0]?.message || "Datos inválidos" });
    }

    const rateDateKey = parsed.data.rate_date || todayDateKeyInBuenosAires(new Date());
    const rateDate = startOfDayUtcFromDateKeyInBuenosAires(rateDateKey);
    if (!rateDate) {
      return res.status(400).json({ error: "rate_date inválida" });
    }

    const row = await upsertBspRate({
      rateDateKey,
      arsPerUsd: parsed.data.ars_per_usd,
      note: parsed.data.note,
      actorAgencyId: auth.id_agency,
      actorUserId: auth.id_user,
    });

    return res.status(200).json({ item: serializeRate(row) });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
