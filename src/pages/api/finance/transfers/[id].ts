import type { NextApiRequest, NextApiResponse } from "next";
import { resolveAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ensurePlanFeatureAccess } from "@/lib/planAccess.server";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";
import { isFinanceDateLocked } from "@/lib/financeLocks";

function hasFinanceAdminRights(role: string): boolean {
  const normalized = String(role || "").trim().toLowerCase();
  return (
    normalized === "gerente" ||
    normalized === "administrativo" ||
    normalized === "desarrollador"
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await resolveAuth(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const planAccess = await ensurePlanFeatureAccess(auth.id_agency, "cashbox");
  if (!planAccess.allowed) {
    return res.status(403).json({ error: "Plan insuficiente" });
  }

  const grants = await getFinanceSectionGrants(auth.id_agency, auth.id_user);
  const canTransfers = canAccessFinanceSection(
    auth.role,
    grants,
    "account_transfers",
  );
  if (!canTransfers) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const transferId = Number(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id);
  if (!Number.isFinite(transferId) || transferId <= 0) {
    return res.status(400).json({ error: "ID inválido" });
  }

  if (req.method === "GET") {
    const item = await prisma.financeTransfer.findFirst({
      where: { id_transfer: transferId, id_agency: auth.id_agency },
    });
    if (!item) return res.status(404).json({ error: "Transferencia no encontrada" });
    return res.status(200).json(item);
  }

  if (req.method === "DELETE") {
    if (!hasFinanceAdminRights(auth.role)) {
      return res.status(403).json({ error: "No autorizado para eliminar transferencias." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const reason = String(body.reason || "").trim();
    if (reason.length < 3) {
      return res.status(400).json({
        error: "Indicá un motivo de al menos 3 caracteres para auditar la eliminación.",
      });
    }

    const transfer = await prisma.financeTransfer.findFirst({
      where: {
        id_transfer: transferId,
        id_agency: auth.id_agency,
      },
      select: {
        id_transfer: true,
        transfer_date: true,
        deleted_at: true,
      },
    });

    if (!transfer) {
      return res.status(404).json({ error: "Transferencia no encontrada" });
    }
    if (transfer.deleted_at) {
      return res.status(409).json({ error: "La transferencia ya está eliminada." });
    }

    if (await isFinanceDateLocked(auth.id_agency, transfer.transfer_date)) {
      return res.status(409).json({
        error: "El mes de la transferencia está bloqueado. Desbloquealo para eliminarla.",
      });
    }

    const deleted = await prisma.financeTransfer.update({
      where: { id_transfer: transferId },
      data: {
        deleted_at: new Date(),
        deleted_by: auth.id_user,
        delete_reason: reason,
      },
    });

    return res.status(200).json({ ok: true, transfer: deleted });
  }

  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
