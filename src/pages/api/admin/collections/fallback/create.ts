import type { NextApiRequest, NextApiResponse } from "next";
import type { BillingFallbackProvider } from "@prisma/client";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import {
  createFallbackForEligibleCharges,
  createFallbackIntentForCharge,
  resolveFallbackProviderFromEnv,
} from "@/services/collections/dunning/service";

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
  const mapped = resolveFallbackProviderFromEnv(raw);
  return mapped;
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
    const chargeId = readPositiveInt(req, "chargeId");
    const provider = readProvider(req);
    const dryRun = readBoolean(req, "dryRun", false);

    if (chargeId) {
      const created = await createFallbackIntentForCharge({
        chargeId,
        provider,
        actorUserId: auth.id_user,
        source: "API_MANUAL_CREATE",
        dryRun,
      });
      return res.status(200).json(created);
    }

    const batch = await createFallbackForEligibleCharges({
      provider,
      dryRun,
      actorUserId: auth.id_user,
    });
    return res.status(200).json(batch);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo crear fallback";
    return res.status(400).json({ error: message });
  }
}
