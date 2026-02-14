export type ParsedTemplateInstallment = {
  label: string | null;
  due_in_days: number;
  amount: number;
  currency: string;
};

type RawTemplateInstallment = {
  label?: unknown;
  due_in_days?: unknown;
  amount?: unknown;
  currency?: unknown;
};

function parseOptionalString(value: unknown, max = 255): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) return undefined;
  return trimmed;
}

function parseOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : NaN;
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  return i >= 0 ? i : undefined;
}

export function parseTemplateInstallments(
  raw: unknown,
): ParsedTemplateInstallment[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ParsedTemplateInstallment[] = [];

  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const item = row as RawTemplateInstallment;

    const label = parseOptionalString(item.label, 80);
    if (label === undefined) return null;

    const dueInDays = parseOptionalInt(item.due_in_days);
    if (
      dueInDays === undefined ||
      dueInDays === null ||
      dueInDays < 0 ||
      dueInDays > 3650
    ) {
      return null;
    }

    const amountNum =
      typeof item.amount === "number"
        ? item.amount
        : Number(String(item.amount ?? "").replace(",", "."));
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;

    const currency =
      typeof item.currency === "string" ? item.currency.trim().toUpperCase() : "";
    if (!currency || currency.length > 12) return null;

    out.push({
      label,
      due_in_days: dueInDays,
      amount: Number(amountNum.toFixed(2)),
      currency,
    });
  }

  return out;
}
