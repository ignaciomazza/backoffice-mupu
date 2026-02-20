import type { NextApiRequest, NextApiResponse } from "next";
import { resolveBillingAuth, isBillingAdminRole } from "@/lib/billingAuth";
import {
  startOfDayUtcFromDateKeyInBuenosAires,
  todayDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";
import { runAnchor } from "@/services/collections/core/runAnchor";

function parseBoolean(input: string | undefined): boolean {
  const normalized = String(input || "").trim().toLowerCase();
  return ["1", "true", "yes", "si", "on"].includes(normalized);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const auth = await resolveBillingAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  if (!isBillingAdminRole(auth.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const rawDate =
    typeof req.query.date === "string" && req.query.date.trim()
      ? req.query.date.trim()
      : todayDateKeyInBuenosAires(new Date());

  const anchorDate = startOfDayUtcFromDateKeyInBuenosAires(rawDate);
  if (!anchorDate) {
    return res.status(400).json({ error: "date inválida (usa YYYY-MM-DD)" });
  }

  const overrideFx = parseBoolean(
    typeof req.query.overrideFx === "string" ? req.query.overrideFx : undefined,
  );

  try {
    const summary = await runAnchor({
      anchorDate,
      overrideFx,
      actorUserId: auth.id_user,
      actorAgencyId: auth.id_agency,
    });

    console.info("[admin/collections/run-anchor]", {
      actor_user_id: auth.id_user,
      actor_agency_id: auth.id_agency,
      anchor_date: summary.anchor_date,
      subscriptions_total: summary.subscriptions_total,
      subscriptions_processed: summary.subscriptions_processed,
      cycles_created: summary.cycles_created,
      charges_created: summary.charges_created,
      attempts_created: summary.attempts_created,
      skipped_idempotent: summary.skipped_idempotent,
      errors_count: summary.errors.length,
    });

    return res.status(200).json({ summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo correr la corrida";
    return res.status(400).json({ error: message });
  }
}
