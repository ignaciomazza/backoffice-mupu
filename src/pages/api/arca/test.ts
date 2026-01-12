// src/pages/api/arca/test.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getAuthContext, hasArcaAccess } from "@/lib/arcaAuth";
import { getAfipForAgency } from "@/services/afip/afipConfig";
import { runArcaDiagnostics } from "@/services/arca/diagnostics";
import { logArca } from "@/services/arca/logger";

function sanitizeError(err: unknown): string {
  if (err instanceof Error && err.message) {
    const msg = err.message.trim();
    return msg ? msg.slice(0, 180) : "Error en ARCA";
  }
  return "Error en ARCA";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Método ${req.method} no permitido`);
  }

  const auth = await getAuthContext(req);
  if (!auth?.id_agency) {
    return res.status(401).json({ error: "No autenticado" });
  }
  if (!hasArcaAccess(auth.role)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const cfg = await prisma.agencyArcaConfig.findUnique({
    where: { agencyId: auth.id_agency },
    select: { certEncrypted: true, keyEncrypted: true },
  });
  if (!cfg?.certEncrypted || !cfg?.keyEncrypted) {
    logArca("warn", "API test missing cert/key", { agencyId: auth.id_agency });
    return res.status(400).json({ error: "No hay credenciales ARCA" });
  }

  try {
    logArca("info", "API test start", { agencyId: auth.id_agency });
    const afip = await getAfipForAgency(auth.id_agency);
    const { serverStatus, salesPoints, missingSalesPoint } =
      await runArcaDiagnostics(afip);

    await prisma.agencyArcaConfig.update({
      where: { agencyId: auth.id_agency },
      data: {
        lastOkAt: new Date(),
        lastError: missingSalesPoint
          ? "Falta punto de venta para Web Services."
          : null,
        status: "connected",
      },
    });

    return res.status(200).json({
      ok: true,
      missingSalesPoint,
      salesPointsCount: salesPoints.length,
      serverStatus,
    });
  } catch (err) {
    const msg = sanitizeError(err);
    logArca("warn", "API test error", { agencyId: auth.id_agency, error: msg });
    await prisma.agencyArcaConfig.updateMany({
      where: { agencyId: auth.id_agency },
      data: { lastError: msg, status: "error" },
    });
    return res.status(500).json({ error: "No se pudo probar ARCA" });
  }
}
