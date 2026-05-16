import { normalizeCurrencyCode } from "@/lib/groups/financeShared";

const SALE_TOTAL_TOLERANCE = 0.01;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const parseMoneyLike = (value: unknown): number | null => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return round2(value);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const numericOnly = raw.replace(/[^\d,.-]/g, "");
  if (!numericOnly) return null;
  const normalized = numericOnly.includes(",")
    ? numericOnly.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(numericOnly)
      ? numericOnly.replace(/\./g, "")
      : numericOnly;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return round2(parsed);
};

export function normalizePassengerSaleTotals(
  input: unknown,
): Record<string, number> {
  if (!isRecord(input)) return {};
  const out: Record<string, number> = {};
  for (const [currencyRaw, amountRaw] of Object.entries(input)) {
    const currency = normalizeCurrencyCode(currencyRaw || "ARS");
    if (!currency) continue;
    const parsed = parseMoneyLike(amountRaw);
    if (parsed == null) continue;
    if (parsed <= SALE_TOTAL_TOLERANCE) continue;
    out[currency] = parsed;
  }
  return out;
}

export function readPassengerSaleConfig(metadata: unknown): {
  useSaleTotalOverride: boolean;
  saleTotals: Record<string, number>;
} {
  if (!isRecord(metadata)) {
    return { useSaleTotalOverride: false, saleTotals: {} };
  }

  const payload = isRecord(metadata.payload) ? metadata.payload : null;
  const saleTotals = normalizePassengerSaleTotals(
    payload?.sale_totals ?? metadata.sale_totals,
  );
  const useSaleTotalOverride = Boolean(
    payload?.use_sale_total_override ?? metadata.use_sale_total_override,
  );
  return { useSaleTotalOverride, saleTotals };
}
