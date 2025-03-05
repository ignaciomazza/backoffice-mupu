// src/pages/api/exchangeRate.ts

import type { NextApiRequest, NextApiResponse } from "next";
import afip from "@/services/afip/afipConfig";

// Función auxiliar para obtener la cotización retrocediendo hasta 5 días
async function getValidExchangeRate(
  currency: string,
  startDate: Date
): Promise<number> {
  let date = new Date(startDate);
  for (let i = 0; i < 5; i++) {
    const formattedDate = date.toISOString().split("T")[0].replace(/-/g, "");
    try {
      console.log(
        `Consultando cotización para ${currency} en la fecha ${formattedDate}`
      );
      const cotizacionResponse = await afip.ElectronicBilling.executeRequest(
        "FEParamGetCotizacion",
        {
          MonId: currency,
          FchCotiz: formattedDate,
        }
      );
      const rate = parseFloat(cotizacionResponse.ResultGet.MonCotiz);
      if (rate) {
        console.info(
          `Cotización oficial para ${currency} en ${formattedDate}: ${rate}`
        );
        return rate;
      }
    } catch (error: any) {
      console.error(`Error para la fecha ${formattedDate}: ${error.message}`);
    }
    date.setDate(date.getDate() - 1);
  }
  if (process.env.AFIP_ENV === "testing") {
    console.warn(
      `No se pudo obtener la cotización en los últimos 5 días para ${currency}. Se usará un valor por defecto de 1.`
    );
    return 1;
  }
  throw new Error("No se pudo obtener la cotización en los últimos 5 días.");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // Utilizamos la función auxiliar para obtener la cotización del dólar ("DOL")
    const rate = await getValidExchangeRate("DOL", yesterday);

    return res.status(200).json({ success: true, rate });
  } catch (error: any) {
    console.error("Error obteniendo la cotización del dólar:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}
