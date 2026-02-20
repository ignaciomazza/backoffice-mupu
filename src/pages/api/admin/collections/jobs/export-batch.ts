import type { NextApiRequest, NextApiResponse } from "next";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import { exportPdBatchJob } from "@/services/collections/jobs/runner";

function readString(req: NextApiRequest, key: string): string | null {
  const bodyValue =
    req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>)[key] : null;
  if (typeof bodyValue === "string" && bodyValue.trim()) return bodyValue.trim();

  const queryValue = req.query[key];
  if (typeof queryValue === "string" && queryValue.trim()) return queryValue.trim();
  return null;
}

function readNumber(req: NextApiRequest, key: string): number | null {
  const bodyValue =
    req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>)[key] : null;
  if (typeof bodyValue === "number" && Number.isFinite(bodyValue) && bodyValue > 0) {
    return Math.trunc(bodyValue);
  }

  const text = readString(req, key);
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
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

  try {
    const targetDateAr = readString(req, "date");
    const adapter = readString(req, "adapter");
    const batchId = readNumber(req, "batchId");

    const result = await exportPdBatchJob({
      source: "MANUAL",
      actorUserId: auth.id_user,
      targetDateAr,
      adapter,
      batchId,
    });

    return res.status(200).json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo correr el job export-batch";
    return res.status(400).json({ error: message });
  }
}

