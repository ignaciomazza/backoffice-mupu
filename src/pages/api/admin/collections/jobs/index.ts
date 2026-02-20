import type { NextApiRequest, NextApiResponse } from "next";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import { getBillingJobsOverview } from "@/services/collections/jobs/runner";

function parsePositiveInt(input: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(input) ? input[0] : input;
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
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

  try {
    const runsLimit = Math.min(30, parsePositiveInt(req.query.limit, 12));
    const overview = await getBillingJobsOverview({ runsLimit });
    return res.status(200).json(overview);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo cargar el overview de jobs";
    return res.status(400).json({ error: message });
  }
}

