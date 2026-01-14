export type ReceiptVerificationRule = {
  id_user: number;
  payment_method_ids: number[];
  account_ids: number[];
};

type ReceiptVerificationCandidate = {
  payment_method_id?: number | null;
  account_id?: number | null;
  payments?: { payment_method_id?: number | null; account_id?: number | null }[];
};

const toPositiveInt = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? Math.trunc(value) : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
  }
  return null;
};

const toIdArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  for (const item of value) {
    const id = toPositiveInt(item);
    if (id) seen.add(id);
  }
  return Array.from(seen).sort((a, b) => a - b);
};

export function normalizeReceiptVerificationRules(
  raw: unknown,
): ReceiptVerificationRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: ReceiptVerificationRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = toPositiveInt(rec.id_user);
    if (!id) continue;
    rules.push({
      id_user: id,
      payment_method_ids: toIdArray(rec.payment_method_ids),
      account_ids: toIdArray(rec.account_ids),
    });
  }
  return rules.sort((a, b) => a.id_user - b.id_user);
}

export function pickReceiptVerificationRule(
  rules: ReceiptVerificationRule[],
  userId?: number | null,
): ReceiptVerificationRule | null {
  if (!userId) return null;
  return rules.find((rule) => rule.id_user === userId) ?? null;
}

export function ruleHasRestrictions(
  rule?: ReceiptVerificationRule | null,
): boolean {
  if (!rule) return false;
  return rule.payment_method_ids.length > 0 || rule.account_ids.length > 0;
}

export function receiptMatchesRule(
  rule: ReceiptVerificationRule,
  receipt: ReceiptVerificationCandidate,
): boolean {
  if (!ruleHasRestrictions(rule)) return true;

  const allowedMethods = new Set(rule.payment_method_ids);
  const allowedAccounts = new Set(rule.account_ids);

  const receiptMethods = new Set<number>();
  const receiptAccounts = new Set<number>();

  if (receipt.payment_method_id) receiptMethods.add(receipt.payment_method_id);
  if (receipt.account_id) receiptAccounts.add(receipt.account_id);

  for (const payment of receipt.payments || []) {
    if (payment.payment_method_id) {
      receiptMethods.add(payment.payment_method_id);
    }
    if (payment.account_id) {
      receiptAccounts.add(payment.account_id);
    }
  }

  if (allowedMethods.size > 0) {
    const hasMethod = Array.from(receiptMethods).some((id) =>
      allowedMethods.has(id),
    );
    if (!hasMethod) return false;
  }

  if (allowedAccounts.size > 0) {
    const hasAccount = Array.from(receiptAccounts).some((id) =>
      allowedAccounts.has(id),
    );
    if (!hasAccount) return false;
  }

  return true;
}
