// src/pages/api/exchangeRate.ts
import type { NextApiRequest, NextApiResponse } from "next";
import {
  getAfipFromRequest,
  type AfipClient,
} from "@/services/afip/afipConfig";
import {
  addDaysToDateKey,
  todayDateKeyInBuenosAires,
} from "@/lib/buenosAiresDate";

function isWeekendDateKey(dateKey: string): boolean {
  const [year, month, dayOfMonth] = dateKey.split("-").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(dayOfMonth)
  ) {
    return false;
  }
  const day = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();
  return day === 0 || day === 6;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err ?? "");
}

function getAfipErrorDetails(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== "object") return { message: String(err ?? "") };
  const anyErr = err as {
    message?: unknown;
    response?: { status?: unknown; statusText?: unknown; data?: unknown };
    status?: unknown;
    statusText?: unknown;
    data?: unknown;
  };
  return {
    message: anyErr.message ?? String(err),
    status: anyErr.response?.status ?? anyErr.status,
    statusText: anyErr.response?.statusText ?? anyErr.statusText,
    responseData: anyErr.response?.data ?? anyErr.data,
  };
}

function isNoResultsError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("sin resultados") ||
    m.includes("feparamgetcotizacion") ||
    m.includes("(602)") ||
    m.includes("602")
  );
}

function isExpectedExchangeError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    isNoResultsError(m) ||
    m.includes("faltan cert") ||
    m.includes("afip_secret_key") ||
    m.includes("afip: formato cifrado inválido") ||
    m.includes("cuit inválido") ||
    m.includes("agencia no encontrada")
  );
}

async function getValidExchangeRate(
  client: AfipClient,
  currency: string,
  startDateKey: string,
): Promise<number> {
  let dateKey = startDateKey;
  const maxAttempts = 10;
  let attempts = 0;
  let lastError: string | null = null;

  while (attempts < maxAttempts && dateKey) {
    if (isWeekendDateKey(dateKey)) {
      dateKey = addDaysToDateKey(dateKey, -1) ?? "";
      continue;
    }
    const yyyymmdd = dateKey.replace(/-/g, "");
    try {
      const resp = await client.ElectronicBilling.executeRequest(
        "FEParamGetCotizacion",
        { MonId: currency, FchCotiz: yyyymmdd },
      );
      const rateStr = resp?.ResultGet?.MonCotiz;
      const rate = rateStr ? parseFloat(rateStr) : NaN;
      if (!Number.isNaN(rate) && rate > 0) return rate;
    } catch (err) {
      const msg = toErrorMessage(err);
      if (!isNoResultsError(msg)) lastError = msg;
    }
    attempts += 1;
    dateKey = addDaysToDateKey(dateKey, -1) ?? "";
  }

  if (process.env.AFIP_ENV === "testing") {
    console.warn(
      `No se pudo obtener la cotización en los últimos ${maxAttempts} días hábiles para ${currency}. Se usará 1.`,
    );
    return 1;
  }
  const suffix = lastError ? ` (${lastError})` : "";
  throw new Error(
    `No se pudo obtener la cotización en los últimos ${maxAttempts} días hábiles.${suffix}`,
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // ⚠️ Requiere que tu middleware agregue x-user-id en el request.
    const afipClient = await getAfipFromRequest(req);

    const todayKey =
      todayDateKeyInBuenosAires() || new Date().toISOString().slice(0, 10);
    const since = addDaysToDateKey(todayKey, -1) ?? todayKey;

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
    const isAuthError =
      message.includes("x-user-id") || message.includes("agencia asociada");
    const expected = isExpectedExchangeError(message);
    const status = isAuthError ? 401 : expected ? 200 : 500;
    if (!expected && !isAuthError) {
      console.error(
        "Error obteniendo la cotización del dólar:",
        getAfipErrorDetails(error),
      );
    }
    return res.status(status).json({ success: false, message });
  }
}
