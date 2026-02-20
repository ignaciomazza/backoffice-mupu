import { createHash } from "node:crypto";

export type PresentmentRow = {
  attemptId: number;
  chargeId: number;
  agencyId: number;
  externalReference: string;
  amountArs: number;
  scheduledFor: Date | null;
  holderName: string | null;
  holderTaxId: string | null;
  cbuLast4: string | null;
};

export type PresentmentInput = {
  businessDate: Date;
  rows: PresentmentRow[];
  meta?: Record<string, unknown>;
};

export type ParsedResponseRecord = {
  lineNo: number;
  externalReference: string | null;
  rawHash: string;
  result: "PAID" | "REJECTED" | "ERROR";
  amountArs: number | null;
  paidReference: string | null;
  rejectionCode: string | null;
  rejectionReason: string | null;
  raw: Record<string, unknown>;
};

export type BuiltPresentment = {
  fileName: string;
  bytes: Buffer;
  meta: Record<string, unknown>;
};

export interface GaliciaPdAdapter {
  readonly name: string;
  buildPresentment(input: PresentmentInput): BuiltPresentment;
  parseResponse(bytes: Buffer): ParsedResponseRecord[];
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function normalizeExternalReference(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function parseAmountArs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "number" ? String(value) : value;
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

export function buildRawHash(raw: Record<string, unknown>): string {
  const entries = Object.entries(raw)
    .map(([k, v]) => [k, v == null ? "" : String(v)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const canonical = entries.map(([k, v]) => `${k}=${v}`).join("|");
  return sha256Hex(canonical);
}
