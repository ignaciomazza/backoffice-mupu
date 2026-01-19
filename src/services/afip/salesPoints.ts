// src/services/afip/salesPoints.ts
import type { AfipClient } from "@/services/afip/afipConfig";

type SalesPoint = { Nro: number };

export async function resolveSalesPoint(
  afipClient: AfipClient,
): Promise<number> {
  const points = (await afipClient.ElectronicBilling.getSalesPoints().catch(
    () => [],
  )) as SalesPoint[];

  if (!points.length) {
    throw new Error(
      "Falta punto de venta habilitado para WSFE. Revisa ARCA (FEParamGetPtosVenta).",
    );
  }

  return Math.min(...points.map((p) => p.Nro));
}
