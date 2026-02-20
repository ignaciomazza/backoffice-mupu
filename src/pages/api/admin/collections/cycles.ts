import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { resolveBillingAuth, isBillingAdminRole } from "@/lib/billingAuth";
import {
  endOfDayUtcFromDateKeyInBuenosAires,
  startOfDayUtcFromDateKeyInBuenosAires,
  toDateKeyInBuenosAires,
  todayDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";

type Range = {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
};

function parseRange(req: NextApiRequest): Range | null {
  const toKey =
    typeof req.query.to === "string" && req.query.to.trim()
      ? req.query.to.trim()
      : todayDateKeyInBuenosAires(new Date());

  const fromKey =
    typeof req.query.from === "string" && req.query.from.trim()
      ? req.query.from.trim()
      : (() => {
          const d = startOfDayUtcFromDateKeyInBuenosAires(toKey);
          if (!d) return "";
          const from = new Date(d);
          from.setUTCDate(from.getUTCDate() - 60);
          return toDateKeyInBuenosAires(from) || "";
        })();

  const from = startOfDayUtcFromDateKeyInBuenosAires(fromKey);
  const to = endOfDayUtcFromDateKeyInBuenosAires(toKey);
  if (!from || !to) return null;

  return { from, to, fromKey, toKey };
}

function dec(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveBillingAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!isBillingAdminRole(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const range = parseRange(req);
  if (!range) {
    return res.status(400).json({ error: "Rango inválido (from/to YYYY-MM-DD)" });
  }

  const items = await prisma.agencyBillingCycle.findMany({
    where: {
      anchor_date: {
        gte: range.from,
        lte: range.to,
      },
    },
    include: {
      subscription: {
        select: {
          id_subscription: true,
          id_agency: true,
          status: true,
        },
      },
      charges: {
        select: {
          id_charge: true,
          status: true,
          amount_ars_due: true,
          amount_ars_paid: true,
          reconciliation_status: true,
        },
        orderBy: [{ id_charge: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ anchor_date: "desc" }, { id_cycle: "desc" }],
    take: 200,
  });

  return res.status(200).json({
    range: {
      from: range.fromKey,
      to: range.toKey,
    },
    items: items.map((item) => ({
      id_cycle: item.id_cycle,
      id_agency: item.id_agency,
      subscription_id: item.subscription_id,
      anchor_date: item.anchor_date,
      period_start: item.period_start,
      period_end: item.period_end,
      status: item.status,
      fx_rate_date: item.fx_rate_date,
      fx_rate_ars_per_usd: dec(item.fx_rate_ars_per_usd),
      total_usd: dec(item.total_usd),
      total_ars: dec(item.total_ars),
      frozen_at: item.frozen_at,
      latest_charge: item.charges[0]
        ? {
            id_charge: item.charges[0].id_charge,
            status: item.charges[0].status,
            amount_ars_due: dec(item.charges[0].amount_ars_due),
            amount_ars_paid: dec(item.charges[0].amount_ars_paid),
            reconciliation_status: item.charges[0].reconciliation_status,
          }
        : null,
    })),
  });
}
