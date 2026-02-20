import type { NextApiRequest, NextApiResponse } from "next";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import { issueFiscalForCharge } from "@/services/collections/fiscal/issueOnPaid";

function parseChargeId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
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

  const chargeId = parseChargeId(req);
  if (!chargeId) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const documentType =
      typeof req.body?.documentType === "string"
        ? req.body.documentType.trim() || undefined
        : undefined;

    const result = await issueFiscalForCharge({
      chargeId,
      documentType,
      forceRetry: true,
      actorUserId: auth.id_user,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo reintentar la emisión fiscal";
    return res.status(400).json({ error: message });
  }
}
