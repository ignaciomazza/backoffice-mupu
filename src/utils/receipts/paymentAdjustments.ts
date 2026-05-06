export const DEFAULT_RECEIPT_ADJUSTMENT_LABEL = "Costo financiero";

export const RECEIPT_ADJUSTMENT_LABELS = [
  DEFAULT_RECEIPT_ADJUSTMENT_LABEL,
  "Retención IIBB",
  "Retención Ganancias",
  "IIBB multilateral",
  "Sellados",
  "Otro",
] as const;

export type ReceiptAdjustmentLabel = (typeof RECEIPT_ADJUSTMENT_LABELS)[number];

export function normalizeReceiptAdjustmentLabel(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_RECEIPT_ADJUSTMENT_LABEL;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return DEFAULT_RECEIPT_ADJUSTMENT_LABEL;

  const known = RECEIPT_ADJUSTMENT_LABELS.find(
    (label) => label.toLowerCase() === trimmed.toLowerCase(),
  );
  return known || trimmed.slice(0, 80);
}
