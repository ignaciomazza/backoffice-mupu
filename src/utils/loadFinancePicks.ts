// utils/loadFinancePicks.ts
// Carga las “listas de apoyo” (monedas, cuentas, métodos y categorías)
// desde /api/finance/picks y, si no está disponible, usa endpoints legacy:
//   - /api/finance/currencies
//   - /api/finance/accounts
//   - /api/finance/methods
//   - /api/finance/categories
//
// Es tolerante a variaciones de forma (array directo o envuelto en {items|data|...})
// y a cambios menores de nombres de campos.

import { authFetch } from "@/utils/authFetch";

const FINANCE_PICKS_TIMEOUT_MS = 12000;
const FINANCE_PICKS_CACHE_TTL_MS = 15000;

type PicksCacheEntry = {
  expiresAt: number;
  value: FinancePicks;
};

const picksCache = new Map<string, PicksCacheEntry>();
const picksInflight = new Map<string, Promise<FinancePicks>>();

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
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), FINANCE_PICKS_TIMEOUT_MS);
  try {
    const res = await authFetch(
      url,
      { cache: "no-store", signal: ac.signal },
      token,
    );
    if (!res.ok) return null; // tolerante: si un recurso falta, devolvemos null
    return await res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
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

function normalizePicksFromRaw(
  rawCurrencies: unknown,
  rawAccounts: unknown,
  rawMethods: unknown,
  rawCategories: unknown,
): FinancePicks {
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

  return {
    currencies: currArr.map(normalizeCurrency),
    accounts: accArr.map(normalizeAccount),
    paymentMethods: methArr.map(normalizePaymentMethod),
    categories: catArr.map(normalizeCategory),
  };
}

async function fetchFinancePicksInternal(token: string): Promise<FinancePicks> {
  const unifiedPayload = await safeGetJson("/api/finance/picks", token);
  const hasUnifiedShape =
    isRecord(unifiedPayload) &&
    ("currencies" in unifiedPayload ||
      "accounts" in unifiedPayload ||
      "paymentMethods" in unifiedPayload ||
      "categories" in unifiedPayload ||
      "methods" in unifiedPayload ||
      "payment_methods" in unifiedPayload);
  if (hasUnifiedShape) {
    return normalizePicksFromRaw(
      isRecord(unifiedPayload) ? unifiedPayload.currencies : null,
      isRecord(unifiedPayload) ? unifiedPayload.accounts : null,
      isRecord(unifiedPayload)
        ? unifiedPayload.paymentMethods ?? unifiedPayload.methods
        : null,
      isRecord(unifiedPayload) ? unifiedPayload.categories : null,
    );
  }

  // Fallback legacy: evitar cuatro requests en paralelo cuando el pool es chico.
  const rawCurrencies = await safeGetJson("/api/finance/currencies", token);
  const rawAccounts = await safeGetJson("/api/finance/accounts", token);
  const rawMethods = await safeGetJson("/api/finance/methods", token);
  const rawCategories = await safeGetJson("/api/finance/categories", token);

  return normalizePicksFromRaw(
    rawCurrencies,
    rawAccounts,
    rawMethods,
    rawCategories,
  );
}

/* ===================== Carga principal ===================== */

/**
 * Carga listas de apoyo (monedas, cuentas, métodos y categorías)
 * desde un endpoint unificado y, si no está disponible, usa fallback legacy.
 * Nunca lanza por 404 u otros fallos parciales: si un recurso no está,
 * retorna [] para ese recurso.
 */
export async function loadFinancePicks(token: string): Promise<FinancePicks> {
  const cache = picksCache.get(token);
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (cache) picksCache.delete(token);

  const inflight = picksInflight.get(token);
  if (inflight) return inflight;

  const task = (async () => {
    const loaded = await fetchFinancePicksInternal(token);
    picksCache.set(token, {
      value: loaded,
      expiresAt: Date.now() + FINANCE_PICKS_CACHE_TTL_MS,
    });
    return loaded;
  })();
  picksInflight.set(token, task);
  try {
    return await task;
  } finally {
    picksInflight.delete(token);
  }
}
