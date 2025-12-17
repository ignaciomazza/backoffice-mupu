// src/utils/receipts/accounts.ts
import type { FinanceCurrency, FinanceAccount } from "@/types/receipts";

export function guessAccountCurrency(
  accName: string | undefined | null,
  currencies: FinanceCurrency[] = [],
): string | null {
  if (!accName) return null;
  const upper = accName.toUpperCase();

  const isoList = currencies
    .map((c) => (c.code || "").toUpperCase())
    .filter(Boolean);

  for (const code of isoList) {
    if (upper.includes(code)) return code;
  }

  const synonyms: Record<string, string[]> = {
    USD: ["USD", "U$D", "DOLARES", "DÓLARES", "US DOLLAR"],
    ARS: ["ARS", "PESOS", "$ "],
    EUR: ["EUR", "€", "EUROS"],
    BRL: ["BRL", "REALES"],
    UYU: ["UYU"],
    CLP: ["CLP"],
    PYG: ["PYG"],
  };

  for (const [code, keys] of Object.entries(synonyms)) {
    if (keys.some((k) => upper.includes(k))) return code;
  }

  return null;
}

export function filterAccountsByCurrency(args: {
  accounts: FinanceAccount[];
  currencies: FinanceCurrency[];
  effectiveCurrency?: string | null;
  enabled: boolean;
}) {
  const { accounts, currencies, effectiveCurrency, enabled } = args;
  if (!enabled) return accounts;

  const cur = (effectiveCurrency || "").toUpperCase();
  if (!cur) return accounts;

  return accounts.filter((a) => {
    const label = a.display_name || a.name;
    const accCur = guessAccountCurrency(label, currencies);
    return accCur ? accCur === cur : true;
  });
}
