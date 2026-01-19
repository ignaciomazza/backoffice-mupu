// src/services/afip/salesPoints.ts
import type { AfipClient } from "@/services/afip/afipConfig";

type SalesPoint = { Nro: number };

export async function resolveSalesPoint(
  afipClient: AfipClient,
  preferred?: number | null,
): Promise<number> {
  const points = (await afipClient.ElectronicBilling.getSalesPoints().catch(
    () => [],
  )) as SalesPoint[];

  if (!points.length) {
    throw new Error(
      "Falta punto de venta habilitado para WSFE. Revisa ARCA (FEParamGetPtosVenta).",
    );
  }

  const list = points.map((p) => p.Nro);
  if (preferred != null) {
    if (list.includes(preferred)) return preferred;
    throw new Error(
      "El punto de venta seleccionado no esta habilitado para WSFE.",
    );
  }

  return Math.min(...list);
}
