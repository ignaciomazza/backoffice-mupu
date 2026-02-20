import type { NextApiRequest, NextApiResponse } from "next";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import { markFallbackIntentPaid } from "@/services/collections/dunning/service";

function parseId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const parsed = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

  const id = parseId(req);
  if (!id) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const result = await markFallbackIntentPaid({
      fallbackIntentId: id,
      actorUserId: auth.id_user,
    });
    return res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo marcar fallback como pagado";
    return res.status(400).json({ error: message });
  }
}
