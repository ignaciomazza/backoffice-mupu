// src/utils/receipts/receiptForm.ts

import type {
  ReceiptIdLeaf,
  ReceiptIdObject,
  SubmitResult,
} from "@/types/receipts";

/* =========================
 * Guards / helpers básicos
 * ========================= */

export function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function toNumberSafe(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Parsea un importe escrito en distintos formatos:
 * "1234.56", "1.234,56", "1234,56", "1,234.56", etc.
 */
export function parseAmountInput(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  s = s.replace(/\s+/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // "1.234,56"
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // "1,234.56"
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // "1234,56"
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* =========================
 * Resolver id_receipt
 * ========================= */

function isResponse(x: unknown): x is Response {
  return isObj(x) && "ok" in x && "json" in x;
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function toFinitePositive(v: unknown): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v)
        : NaN;

  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickNumericId(obj: unknown): number | null {
  if (!isObj(obj)) return null;
  const o = obj as ReceiptIdObject;

  const candidates: ReceiptIdLeaf[] = [
    o.id_receipt,
    o.id,
    o.receiptId,
    o.data?.id_receipt,
    o.data?.id,
    o.data?.receipt?.id_receipt,
    o.data?.receipt?.id,
    o.result?.id_receipt,
    o.result?.id,
    o.result?.receipt?.id_receipt,
    o.result?.receipt?.id,
    o.receipt?.id_receipt,
    o.receipt?.id,
  ];

  for (const c of candidates) {
    const n = toFinitePositive(c);
    if (n) return n;
  }
  return null;
}

/** Lee un ID numérico desde headers Location/Content-Location/X-* o desde res.url */
function extractIdFromHeaders(res: Response): number | null {
  const headerKeys = [
    "Location",
    "Content-Location",
    "X-Resource-Id",
    "X-Receipt-Id",
  ];

  for (const k of headerKeys) {
    const v = res.headers.get(k);
    if (!v) continue;
    const m = v.match(/(\d+)(?!.*\d)/); // último grupo numérico
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  if (res.url) {
    const m = res.url.match(/(\d+)(?!.*\d)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  return null;
}

/**
 * Acepta lo que devuelve onSubmit (number | Response | objeto) y devuelve id_receipt si lo encuentra.
 * - Si es Response: intenta headers/URL primero (por si el body ya fue consumido), y si no, intenta JSON.
 */
export async function resolveReceiptIdFrom(
  result: SubmitResult,
): Promise<number | null> {
  if (typeof result === "number" && Number.isFinite(result) && result > 0)
    return result;

  if (isResponse(result)) {
    const fromHdr = extractIdFromHeaders(result);
    if (fromHdr) return fromHdr;

    const j = await safeJson<unknown>(result);
    const id = pickNumericId(j);
    if (id) return id;

    return null;
  }

  if (isObj(result)) {
    const id = pickNumericId(result);
    if (id) return id;
  }

  return null;
}

/** helper genérico para “normalizar” listas que vienen como items/rows/results/etc */
export function asArray<T>(u: unknown): T[] {
  if (Array.isArray(u)) return u as T[];
  if (isObj(u)) {
    const o = u as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as T[];
    if (Array.isArray(o.receipts)) return o.receipts as T[];
    if (Array.isArray(o.data)) return o.data as T[];
    if (Array.isArray(o.rows)) return o.rows as T[];
    if (Array.isArray(o.results)) return o.results as T[];
  }
  return [];
}
