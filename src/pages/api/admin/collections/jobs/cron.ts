import type { NextApiRequest, NextApiResponse } from "next";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import { getBillingJobsConfig } from "@/services/collections/jobs/config";
import { runBillingCronTick } from "@/services/collections/jobs/runner";

function readSecret(req: NextApiRequest): string {
  const headerSecret = String(req.headers["x-billing-job-secret"] || "").trim();
  if (headerSecret) return headerSecret;

  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const querySecret = Array.isArray(req.query.secret)
    ? req.query.secret[0]
    : req.query.secret;
  return String(querySecret || "").trim();
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

  const config = getBillingJobsConfig();
  const configuredSecret = String(config.runnerSecret || "").trim();

  if (configuredSecret) {
    const incomingSecret = readSecret(req);
    if (incomingSecret !== configuredSecret) {
      return res.status(401).json({ error: "Secret inválido para cron runner" });
    }
  } else {
    const auth = await resolveBillingAuth(req);
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    if (!isBillingAdminRole(auth.role)) {
      return res.status(403).json({ error: "Sin permisos" });
    }
  }

  try {
    const result = await runBillingCronTick();
    return res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar cron runner";
    return res.status(400).json({ error: message });
  }
}

