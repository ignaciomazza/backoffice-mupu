// src/pages/api/finance/_schemas.ts
import { z } from "zod";

// ---------- CURRENCIES ----------
export const currencyCreateSchema = z.object({
  id_agency: z.number().int().positive().optional(), // por si lo necesitás en algún call
  code: z.string().trim().min(2).max(6),
  name: z.string().trim().min(2),
  symbol: z.string().trim().min(1).max(4),
  enabled: z.boolean().optional().default(true),
});

export const currencyUpdateSchema = z.object({
  code: z.string().trim().min(2).max(6).optional(),
  name: z.string().trim().min(2).optional(),
  symbol: z.string().trim().min(1).max(4).optional(),
  enabled: z.boolean().optional(),
  is_primary: z.boolean().optional(),
});

// ---------- ACCOUNTS ----------
export const accountCreateSchema = z.object({
  id_agency: z.number().int().positive().optional(),
  name: z.string().trim().min(2),
  alias: z.string().trim().min(1).nullable().optional(),
  type: z.string().trim().min(1).nullable().optional(),
  cbu: z.string().trim().min(1).nullable().optional(),
  currency: z.string().trim().min(2).nullable().optional(),
  enabled: z.boolean().optional().default(true),
});

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  alias: z.string().trim().min(1).nullable().optional(),
  type: z.string().trim().min(1).nullable().optional(),
  cbu: z.string().trim().min(1).nullable().optional(),
  currency: z.string().trim().min(2).nullable().optional(),
  enabled: z.boolean().optional(),
});

// ---------- CATEGORIES ----------
export const categoryCreateSchema = z.object({
  id_agency: z.number().int().positive(),
  name: z.string().trim().min(2),
  requires_operator: z.boolean().optional().default(false),
  requires_user: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  requires_operator: z.boolean().optional(),
  requires_user: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

// ---------- METHODS ----------
export const methodCreateSchema = z.object({
  id_agency: z.number().int().positive(),
  name: z.string().trim().min(2),
  code: z.string().trim().min(1).max(16),
  requires_account: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
});

export const methodUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  code: z.string().trim().min(1).max(16).optional(),
  requires_account: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

// ---------- REORDER ----------
export const reorderSchema = z.object({
  id_agency: z.number().int().positive(),
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      sort_order: z.number().int().nonnegative(),
    }),
  ),
});

// ---------- CONFIG ----------
export const configUpdateSchema = z.object({
  default_currency_code: z.string().trim().min(2),
  hide_operator_expenses_in_investments: z.boolean().optional(),
});
