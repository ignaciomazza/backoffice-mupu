import type { NextApiRequest, NextApiResponse } from "next";
import type { BillingFallbackProvider } from "@prisma/client";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import {
  resolveFallbackProviderFromEnv,
  syncFallbackStatuses,
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

function readProvider(req: NextApiRequest): BillingFallbackProvider | null {
  const raw = readString(req, "provider");
  if (!raw) return null;
  return resolveFallbackProviderFromEnv(raw);
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
    const provider = readProvider(req);
    const fallbackIntentId = readPositiveInt(req, "fallbackIntentId");
    const result = await syncFallbackStatuses({
      provider,
      fallbackIntentId,
      actorUserId: auth.id_user,
    });
    return res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo sincronizar fallback";
    return res.status(400).json({ error: message });
  }
}
