import type { NextApiRequest, NextApiResponse } from "next";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import { reconcilePdBatchJob } from "@/services/collections/jobs/runner";

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readBatchId(body: Record<string, unknown>): number | null {
  const numeric = body.outboundBatchId;
  if (typeof numeric === "number" && Number.isFinite(numeric) && numeric > 0) {
    return Math.trunc(numeric);
  }

  const raw = readString(body, "outboundBatchId");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
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

  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : {};

  try {
    const outboundBatchId = readBatchId(body);
    const fileName = readString(body, "fileName");
    const contentType = readString(body, "contentType");
    const base64 = readString(body, "fileBase64");
    const fileBytes = base64 ? Buffer.from(base64, "base64") : null;

    const result = await reconcilePdBatchJob({
      source: "MANUAL",
      actorUserId: auth.id_user,
      outboundBatchId,
      fileName,
      fileBytes,
      fileContentType: contentType,
    });

    return res.status(200).json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo correr el job reconcile-batch";
    return res.status(400).json({ error: message });
  }
}

