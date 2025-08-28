// src/pages/api/exchangeRate.ts
import type { NextApiRequest, NextApiResponse } from "next";
import {
  getAfipFromRequest,
  type AfipClient,
} from "@/services/afip/afipConfig";

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

async function getValidExchangeRate(
  client: AfipClient,
  currency: string,
  startDate: Date,
): Promise<number> {
  const date = new Date(startDate);
  for (let i = 0; i < 5; i++) {
    if (isWeekend(date)) {
      date.setDate(date.getDate() - 1);
      continue;
    }
    const yyyymmdd = date.toISOString().split("T")[0].replace(/-/g, "");
    try {
      const resp = await client.ElectronicBilling.executeRequest(
        "FEParamGetCotizacion",
        { MonId: currency, FchCotiz: yyyymmdd },
      );
      const rateStr = resp?.ResultGet?.MonCotiz;
      const rate = rateStr ? parseFloat(rateStr) : NaN;
      if (!Number.isNaN(rate) && rate > 0) return rate;
    } catch (err) {
      if (err instanceof Error) {
        console.error(`Error para la fecha ${yyyymmdd}: ${err.message}`);
      }
    }
    date.setDate(date.getDate() - 1);
  }

  if (process.env.AFIP_ENV === "testing") {
    console.warn(
      `No se pudo obtener la cotización en los últimos 5 días para ${currency}. Se usará 1.`,
    );
    return 1;
  }
  throw new Error("No se pudo obtener la cotización en los últimos 5 días.");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // ⚠️ Requiere que tu middleware agregue x-user-id en el request.
    const afipClient = await getAfipFromRequest(req);

    const today = new Date();
    const since = new Date(today);
    since.setDate(today.getDate() - 1);

    const rate = await getValidExchangeRate(afipClient, "DOL", since);
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    // ETag distinto siempre para que el browser no pueda revalidar a 304
    res.setHeader("ETag", `${Date.now()}`);
    return res.status(200).json({ success: true, rate });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error desconocido.";
    // Si falla por no tener x-user-id, devolvemos 401 para que el front no lo reintente en loop.
    const status =
      message.includes("x-user-id") || message.includes("agencia asociada")
        ? 401
        : 500;
    console.error("Error obteniendo la cotización del dólar:", message);
    return res.status(status).json({ success: false, message });
  }
}
