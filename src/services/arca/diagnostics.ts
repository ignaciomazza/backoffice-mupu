// src/services/arca/diagnostics.ts
import type { AfipClient } from "@/services/afip/afipConfig";

export async function runArcaDiagnostics(afip: AfipClient) {
  const [serverStatus, salesPoints] = await Promise.all([
    afip.ElectronicBilling.getServerStatus(),
    afip.ElectronicBilling.getSalesPoints().catch(() => []),
  ]);

  const missingSalesPoint = salesPoints.length === 0;

  return {
    serverStatus,
    salesPoints,
    missingSalesPoint,
  };
}
