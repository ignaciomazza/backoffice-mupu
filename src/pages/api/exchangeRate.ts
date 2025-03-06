// src/pages/api/exchangeRate.ts

import type { NextApiRequest, NextApiResponse } from "next";
import afip from "@/services/afip/afipConfig";

/**
 * Verifica si una fecha es fin de semana.
 * Retorna true si es sábado (6) o domingo (0).
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay(); // 0 = domingo, 6 = sábado
  return day === 0 || day === 6;
}

/**
 * Función auxiliar para obtener la cotización retrocediendo hasta 5 días hábiles.
 * @param currency - Identificador de la moneda (por ejemplo, "DOL")
 * @param startDate - Fecha a partir de la cual comenzar la búsqueda
 */
async function getValidExchangeRate(
  currency: string,
  startDate: Date,
): Promise<number> {
  const date = new Date(startDate);
  for (let i = 0; i < 5; i++) {
    // Si la fecha es fin de semana, se salta y se retrocede un día
    if (isWeekend(date)) {
      const formattedWeekendDate = date
        .toISOString()
        .split("T")[0]
        .replace(/-/g, "");
      console.log(
        `La fecha ${formattedWeekendDate} es fin de semana. Se omite.`,
      );
      date.setDate(date.getDate() - 1);
      continue;
    }
    const formattedDate = date.toISOString().split("T")[0].replace(/-/g, "");
    try {
      console.log(
        `Consultando cotización para ${currency} en la fecha ${formattedDate}`,
      );
      const cotizacionResponse = await afip.ElectronicBilling.executeRequest(
        "FEParamGetCotizacion",
        {
          MonId: currency,
          FchCotiz: formattedDate,
        },
      );
      console.log("Respuesta de cotización:", cotizacionResponse);

      const rate = parseFloat(cotizacionResponse.ResultGet.MonCotiz);
      if (rate) {
        console.info(
          `Cotización oficial para ${currency} en ${formattedDate}: ${rate}`,
        );
        return rate;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(`Error para la fecha ${formattedDate}: ${error.message}`);
      }
    }
    // Retrocede un día para la siguiente iteración
    date.setDate(date.getDate() - 1);
  }
  if (process.env.AFIP_ENV === "testing") {
    console.warn(
      `No se pudo obtener la cotización en los últimos 5 días para ${currency}. Se usará un valor por defecto de 1.`,
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
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    console.info(
      `Iniciando consulta de cotización para DOL a partir de la fecha ${
        yesterday.toISOString().split("T")[0]
      }`,
    );
    // Obtenemos la cotización para el dólar ("DOL") a partir de yesterday
    const rate = await getValidExchangeRate("DOL", yesterday);

    return res.status(200).json({ success: true, rate });
  } catch (error: unknown) {
    let message = "Error desconocido.";
    if (error instanceof Error) {
      message = error.message;
      console.error("Error obteniendo la cotización del dólar:", error.message);
    }
    return res.status(500).json({ success: false, message });
  }
}
