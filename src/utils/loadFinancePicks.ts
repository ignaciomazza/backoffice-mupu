// utils/loadFinancePicks.ts
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

/* ================= Normalizadores por entidad ================= */

function normalizeCurrency(
  rec: Record<string, unknown>,
  index: number,
): FinanceCurrency {
  // Soporta claves alternativas (por si la API cambia / es "slim")
  const id =
    toNumber(rec["id_currency"]) ||
    toNumber(rec["id"]) ||
    // fallback estable pero no ideal si la API no envía id:
    index + 1;

  return {
    id_currency: id,
    code: toString(rec["code"]),
    name: toString(rec["name"]),
    symbol: rec["symbol"] === null ? null : toStringOrNull(rec["symbol"]),
    enabled: toBoolean(rec["enabled"], true),
    is_primary: toBoolean(rec["is_primary"], false),
    sort_order: toNumber(rec["sort_order"], index + 1),
  };
}

function normalizePaymentMethod(
  rec: Record<string, unknown>,
  index: number,
): FinancePaymentMethod {
  const id = toNumber(rec["id_method"]) || toNumber(rec["id"]) || index + 1;

  return {
    id_method: id,
    name: toString(rec["name"]),
    code: toString(rec["code"]),
    requires_account: toBoolean(rec["requires_account"], false),
    enabled: toBoolean(rec["enabled"], true),
    sort_order: toNumber(rec["sort_order"], index + 1),
    lock_system:
      typeof rec["lock_system"] === "boolean"
        ? (rec["lock_system"] as boolean)
        : undefined,
  };
}

function normalizeAccount(
  rec: Record<string, unknown>,
  index: number,
): FinanceAccount {
  const id = toNumber(rec["id_account"]) || toNumber(rec["id"]) || index + 1;

  return {
    id_account: id,
    name: toString(rec["name"]),
    type: rec["type"] === null ? null : toStringOrNull(rec["type"]),
    alias: rec["alias"] === null ? null : toStringOrNull(rec["alias"]),
    cbu: rec["cbu"] === null ? null : toStringOrNull(rec["cbu"]),
    currency: rec["currency"] === null ? null : toStringOrNull(rec["currency"]),
    enabled: toBoolean(rec["enabled"], true),
    sort_order: toNumber(rec["sort_order"], index + 1),
  };
}

function normalizeCategory(
  rec: Record<string, unknown>,
  index: number,
): FinanceExpenseCategory {
  const id = toNumber(rec["id_category"]) || toNumber(rec["id"]) || index + 1;

  return {
    id_category: id,
    name: toString(rec["name"]),
    enabled: toBoolean(rec["enabled"], true),
    sort_order: toNumber(rec["sort_order"], index + 1),
    requires_operator: toBoolean(rec["requires_operator"], false),
    requires_user: toBoolean(rec["requires_user"], false),
  };
}

/* ===================== Carga principal ===================== */

/**
 * Carga listas de apoyo (monedas, cuentas, métodos y categorías)
 * y las normaliza a los tipos completos esperados por la UI.
 */
export async function loadFinancePicks(token: string): Promise<FinancePicks> {
  const res = await authFetch(
    "/api/finance/picks",
    { cache: "no-store" },
    token,
  );

  if (!res.ok) {
    throw new Error("No se pudo cargar picks de finanzas");
  }

  const raw: unknown = await res.json();

  const rec = isRecord(raw) ? raw : {};

  const rawCurrencies = asArrayOfRecords(rec["currencies"]);
  const rawAccounts = asArrayOfRecords(rec["accounts"]);
  const rawMethods = asArrayOfRecords(rec["paymentMethods"]);
  const rawCategories = asArrayOfRecords(rec["categories"]);

  const currencies = rawCurrencies.map(normalizeCurrency);
  const accounts = rawAccounts.map(normalizeAccount);
  const paymentMethods = rawMethods.map(normalizePaymentMethod);
  const categories = rawCategories.map(normalizeCategory);

  return { currencies, accounts, paymentMethods, categories };
}
