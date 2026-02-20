import type { NextApiRequest, NextApiResponse } from "next";
import type { BillingFallbackProvider } from "@prisma/client";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import { fallbackCreateJob } from "@/services/collections/jobs/runner";

function readString(req: NextApiRequest, key: string): string | null {
  const bodyValue =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)[key]
      : null;
  if (typeof bodyValue === "string" && bodyValue.trim()) return bodyValue.trim();
  const queryValue = req.query[key];
  if (typeof queryValue === "string" && queryValue.trim()) return queryValue.trim();
  return null;
}

function readPositiveInt(req: NextApiRequest, key: string): number | null {
  const bodyValue =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)[key]
      : null;
  if (typeof bodyValue === "number" && Number.isFinite(bodyValue) && bodyValue > 0) {
    return Math.trunc(bodyValue);
  }
  const raw = readString(req, key);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function readBoolean(req: NextApiRequest, key: string, fallback = false): boolean {
  const bodyValue =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)[key]
      : undefined;
  if (typeof bodyValue === "boolean") return bodyValue;
  const raw = readString(req, key);
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (["1", "true", "yes", "on", "si"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function readProvider(req: NextApiRequest): BillingFallbackProvider | null {
  const raw = readString(req, "provider");
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (normalized === "MP") return "MP";
  if (normalized === "OTHER") return "OTHER";
  if (normalized === "CIG_QR") return "CIG_QR";
  return null;
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
    const provider = readProvider(req);
    const chargeId = readPositiveInt(req, "chargeId");
    const dryRun = readBoolean(req, "dryRun", false);

    const result = await fallbackCreateJob({
      source: "MANUAL",
      actorUserId: auth.id_user,
      targetDateAr,
      provider,
      chargeId,
      dryRun,
    });

    return res.status(200).json({ result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo ejecutar el job fallback-create";
    return res.status(400).json({ error: message });
  }
}
