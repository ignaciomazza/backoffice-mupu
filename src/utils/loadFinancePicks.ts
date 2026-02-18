// utils/loadFinancePicks.ts
// Carga las “listas de apoyo” (monedas, cuentas, métodos y categorías)
// usando **endpoints ya existentes** por separado:
//   - /api/finance/currencies
//   - /api/finance/accounts
//   - /api/finance/methods
//   - /api/finance/categories
//
// Es tolerante a variaciones de forma (array directo o envuelto en {items|data|...})
// y a cambios menores de nombres de campos.

import { authFetch } from "@/utils/authFetch";

/* ================= Tipos públicos (completos) ================= */

export type FinanceCurrency = {
  id_currency: number;
  code: string;
  name: string;
  symbol: string | null;
  enabled: boolean;
  is_primary: boolean;
  sort_order: number;
};

export type FinanceAccount = {
  id_account: number;
  name: string;
  type?: string | null;
  alias?: string | null;
  cbu?: string | null;
  currency: string | null; // código de moneda (ej: "ARS") o null
  enabled: boolean;
  sort_order: number;
};

export type FinancePaymentMethod = {
  id_method: number;
  name: string;
  code: string;
  requires_account: boolean;
  enabled: boolean;
  sort_order: number;
  lock_system?: boolean;
};

export type FinanceExpenseCategory = {
  id_category: number;
  name: string;
  scope: "INVESTMENT" | "OTHER_INCOME";
  enabled: boolean;
  sort_order: number;
  requires_operator?: boolean;
  requires_user?: boolean;
};

export type FinancePicks = {
  currencies: FinanceCurrency[];
  accounts: FinanceAccount[];
  paymentMethods: FinancePaymentMethod[];
  categories: FinanceExpenseCategory[];
};

/* ================= Utilidades de parseo seguras ================= */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return fallback;
}

function toString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function toBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  if (typeof v === "number") return v !== 0;
  return fallback;
}

function asArrayOfRecords(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord);
}

function pick<T = unknown>(
  rec: Record<string, unknown>,
  ...keys: string[]
): T | undefined {
  for (const k of keys) {
    if (k in rec) return rec[k] as T;
  }
  return undefined;
}

function pickArrayFromObject(
  obj: Record<string, unknown>,
  candidateKeys: string[],
): Record<string, unknown>[] {
  for (const k of candidateKeys) {
    const maybe = obj[k];
    if (Array.isArray(maybe)) return asArrayOfRecords(maybe);
  }
  return [];
}

/* ================= Normalizadores por entidad ================= */

function normalizeCurrency(
  rec: Record<string, unknown>,
  index: number,
): FinanceCurrency {
  const id =
    toNumber(pick(rec, "id_currency", "id")) || // si no viene id, usa índice estable
    index + 1;

  return {
    id_currency: id,
    code: toString(pick(rec, "code", "currency_code", "currency"), ""),
    name: toString(pick(rec, "name", "label"), ""),
    symbol:
      pick(rec, "symbol", "sign") === null
        ? null
        : toStringOrNull(pick(rec, "symbol", "sign")),
    enabled: toBoolean(pick(rec, "enabled", "is_enabled"), true),
    is_primary: toBoolean(
      pick(rec, "is_primary", "primary", "isPrimary"),
      false,
    ),
    sort_order: toNumber(
      pick(rec, "sort_order", "order", "position", "sortOrder"),
      index + 1,
    ),
  };
}

function normalizePaymentMethod(
  rec: Record<string, unknown>,
  index: number,
): FinancePaymentMethod {
  const id = toNumber(pick(rec, "id_method", "id"), index + 1);

  return {
    id_method: id,
    name: toString(pick(rec, "name", "label"), ""),
    code: toString(pick(rec, "code", "key"), ""),
    requires_account: toBoolean(
      pick(rec, "requires_account", "needs_account", "requiresAccount"),
      false,
    ),
    enabled: toBoolean(pick(rec, "enabled", "is_enabled"), true),
    sort_order: toNumber(
      pick(rec, "sort_order", "order", "position", "sortOrder"),
      index + 1,
    ),
    lock_system:
      typeof pick(rec, "lock_system", "system_locked", "lockSystem") ===
      "boolean"
        ? (pick(rec, "lock_system", "system_locked", "lockSystem") as boolean)
        : undefined,
  };
}

function normalizeAccount(
  rec: Record<string, unknown>,
  index: number,
): FinanceAccount {
  const id = toNumber(pick(rec, "id_account", "id"), index + 1);

  return {
    id_account: id,
    name: toString(pick(rec, "name", "label"), ""),
    type: pick(rec, "type") === null ? null : toStringOrNull(pick(rec, "type")),
    alias:
      pick(rec, "alias", "aka") === null
        ? null
        : toStringOrNull(pick(rec, "alias", "aka")),
    cbu:
      pick(rec, "cbu", "iban") === null
        ? null
        : toStringOrNull(pick(rec, "cbu", "iban")),
    currency:
      pick(rec, "currency", "currency_code", "currencyCode") === null
        ? null
        : toStringOrNull(
            pick(rec, "currency", "currency_code", "currencyCode"),
          ),
    enabled: toBoolean(pick(rec, "enabled", "is_enabled"), true),
    sort_order: toNumber(
      pick(rec, "sort_order", "order", "position", "sortOrder"),
      index + 1,
    ),
  };
}

function normalizeCategory(
  rec: Record<string, unknown>,
  index: number,
): FinanceExpenseCategory {
  const id = toNumber(pick(rec, "id_category", "id"), index + 1);
  const rawScope = toString(
    pick(rec, "scope", "category_scope", "applies_to"),
    "INVESTMENT",
  )
    .trim()
    .toUpperCase();
  const scope: "INVESTMENT" | "OTHER_INCOME" =
    rawScope === "OTHER_INCOME" ? "OTHER_INCOME" : "INVESTMENT";

  return {
    id_category: id,
    name: toString(pick(rec, "name", "label"), ""),
    scope,
    enabled: toBoolean(pick(rec, "enabled", "is_enabled"), true),
    sort_order: toNumber(
      pick(rec, "sort_order", "order", "position", "sortOrder"),
      index + 1,
    ),
    requires_operator: toBoolean(
      pick(rec, "requires_operator", "needs_operator", "requiresOperator"),
      false,
    ),
    requires_user: toBoolean(
      pick(rec, "requires_user", "needs_user", "requiresUser"),
      false,
    ),
  };
}

/* ================= Helpers de red ================= */

async function safeGetJson(
  url: string,
  token: string,
): Promise<unknown | null> {
  try {
    const res = await authFetch(url, { cache: "no-store" }, token);
    if (!res.ok) return null; // tolerante: si un recurso falta, devolvemos null
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

function extractArray(
  payload: unknown,
  keys: string[],
): Record<string, unknown>[] {
  if (Array.isArray(payload)) return asArrayOfRecords(payload);
  if (isRecord(payload)) return pickArrayFromObject(payload, keys);
  return [];
}

/* ===================== Carga principal ===================== */

/**
 * Carga listas de apoyo (monedas, cuentas, métodos y categorías)
 * desde endpoints existentes, en paralelo, y normaliza la forma.
 * Nunca lanza por 404 u otros fallos parciales: si un recurso no está,
 * retorna [] para ese recurso.
 */
export async function loadFinancePicks(token: string): Promise<FinancePicks> {
  const [rawCurrencies, rawAccounts, rawMethods, rawCategories] =
    await Promise.all([
      safeGetJson("/api/finance/currencies", token),
      safeGetJson("/api/finance/accounts", token),
      safeGetJson("/api/finance/methods", token),
      safeGetJson("/api/finance/categories", token),
    ]);

  // Acepta array directo o envueltos en { currencies | items | data | list }
  const currArr = extractArray(rawCurrencies, [
    "currencies",
    "items",
    "data",
    "list",
  ]);
  const accArr = extractArray(rawAccounts, [
    "accounts",
    "items",
    "data",
    "list",
  ]);
  const methArr = extractArray(rawMethods, [
    "paymentMethods",
    "methods",
    "payment_methods",
    "items",
    "data",
    "list",
  ]);
  const catArr = extractArray(rawCategories, [
    "categories",
    "items",
    "data",
    "list",
  ]);

  const currencies = currArr.map(normalizeCurrency);
  const accounts = accArr.map(normalizeAccount);
  const paymentMethods = methArr.map(normalizePaymentMethod);
  const categories = catArr.map(normalizeCategory);

  return { currencies, accounts, paymentMethods, categories };
}
