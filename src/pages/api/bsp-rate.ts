// src/pages/api/bsp-rate.ts
import type { NextApiRequest, NextApiResponse } from "next";

type ParseResult = {
  arsPerUsd: number;
  date?: string | null;
};

type Source = {
  name: string;
  url: string;
  parse: (html: string) => ParseResult | null;
};

type BspRateResponse =
  | {
      ok: true;
      arsPerUsd: number;
      date: string | null;
      source: string;
      fetchedAt: string;
    }
  | {
      ok: false;
      error: string;
      source?: string;
    };

function parseRate(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;

  const hasComma = cleaned.includes(",");
  const normalized = hasComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/\./g, "");

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseDate(raw: string): string | null {
  const m = raw.match(/(\d{2})[./-](\d{2})[./-](\d{2,4})/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]}-${m[1]}`;
}

function parseEstiloPlus(html: string): ParseResult | null {
  const match =
    html.match(/Cambio\s+BSP\s*\$?\s*([0-9.,]+)/i) ??
    html.match(
      /Cambio\s*\$\s*Arg-?\s*U\$D\s*:?\s*1\s*U\$D\s*=\s*\$?\s*([0-9.,]+)/i,
    );
  const rate = match?.[1] ? parseRate(match[1]) : null;
  if (!rate) return null;

  const dateMatch = html.match(/pagos\s+(\d{2}[./-]\d{2}[./-]\d{4})/i);
  const date = dateMatch?.[1] ? parseDate(dateMatch[1]) : null;

  return { arsPerUsd: rate, date };
}

function parseTravelStore(html: string): ParseResult | null {
  const match = html.match(/BSP\s*([0-9.,]+)/i);
  const rate = match?.[1] ? parseRate(match[1]) : null;
  if (!rate) return null;

  const dateMatch = html.match(
    /Actualizado[^0-9]*(\d{2}[./-]\d{2}[./-]\d{2,4})/i,
  );
  const date = dateMatch?.[1] ? parseDate(dateMatch[1]) : null;

  return { arsPerUsd: rate, date };
}

const SOURCES: Source[] = [
  {
    name: "EstiloPlus",
    url: "https://www.estiloplus.tur.ar/page/cambio.html",
    parse: parseEstiloPlus,
  },
  {
    name: "TheTravelStore",
    url: "https://thetravelstore.com.ar/traslados.php",
    parse: parseTravelStore,
  },
];

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Ofistur-BSP/1.0" },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<BspRateResponse>,
) {
  for (const source of SOURCES) {
    try {
      const resp = await fetchWithTimeout(source.url, 6000);
      if (!resp.ok) continue;
      const html = await resp.text();
      const parsed = source.parse(html);
      if (!parsed?.arsPerUsd) continue;

      res.setHeader(
        "Cache-Control",
        "public, s-maxage=600, stale-while-revalidate=600",
      );
      return res.status(200).json({
        ok: true,
        arsPerUsd: parsed.arsPerUsd,
        date: parsed.date ?? null,
        source: source.name,
        fetchedAt: new Date().toISOString(),
      });
    } catch {
      // continue to next source
    }
  }

  return res.status(502).json({
    ok: false,
    error: "No se pudo obtener BSP desde fuentes publicas.",
  });
}
