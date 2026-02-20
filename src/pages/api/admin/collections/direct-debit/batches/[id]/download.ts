import type { NextApiRequest, NextApiResponse } from "next";
import { isBillingAdminRole, resolveBillingAuth } from "@/lib/billingAuth";
import { downloadDirectDebitBatchFile } from "@/services/collections/galicia/direct-debit/batches";

function parseBatchId(req: NextApiRequest): number | null {
  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function sanitizeFileName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "batch.csv";
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

  const idBatch = parseBatchId(req);
  if (!idBatch) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const file = await downloadDirectDebitBatchFile(idBatch);
    const fileName = sanitizeFileName(file.fileName);

    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(file.bytes);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo descargar el lote";
    return res.status(400).json({ error: message });
  }
}
