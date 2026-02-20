import type { NextApiRequest, NextApiResponse } from "next";
import {
  endOfDayUtcFromDateKeyInBuenosAires,
  startOfDayUtcFromDateKeyInBuenosAires,
  toDateKeyInBuenosAires,
  todayDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import {
  createPresentmentBatch,
  listDirectDebitBatches,
} from "@/services/collections/galicia/direct-debit/batches";

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
    const range = parseRange(req);
    if (!range) {
      return res.status(400).json({ error: "Rango inválido (from/to YYYY-MM-DD)" });
    }

    const items = await listDirectDebitBatches({
      from: range.from,
      to: range.to,
    });

    return res.status(200).json({
      range: {
        from: range.fromKey,
        to: range.toKey,
      },
      items,
    });
  }

  if (req.method === "POST") {
    const rawDate =
      typeof req.query.date === "string" && req.query.date.trim()
        ? req.query.date.trim()
        : todayDateKeyInBuenosAires(new Date());

    const businessDate = startOfDayUtcFromDateKeyInBuenosAires(rawDate);
    if (!businessDate) {
      return res.status(400).json({ error: "date inválida (usa YYYY-MM-DD)" });
    }

    try {
      const created = await createPresentmentBatch({
        businessDate,
        actorUserId: auth.id_user,
      });

      return res.status(200).json({
        batch: created.batch,
        download_url:
          created.batch.storage_key != null
            ? `/api/admin/collections/direct-debit/batches/${created.batch.id_batch}/download`
            : null,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo crear el lote de presentación";
      return res.status(400).json({ error: message });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
