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

export type InternalPaymentStatus = "PAID" | "REJECTED" | "ERROR" | "UNKNOWN";

export type InternalDetailedReason =
  | "REJECTED_INSUFFICIENT_FUNDS"
  | "REJECTED_INVALID_ACCOUNT"
  | "REJECTED_MANDATE_INVALID"
  | "REJECTED_ACCOUNT_CLOSED"
  | "ERROR_FORMAT"
  | "ERROR_DUPLICATE"
  | null;

export type BankResultMapping = {
  status: InternalPaymentStatus;
  detailed_reason: InternalDetailedReason;
};

export type AdapterControlTotals = {
  record_count: number;
  amount_total: number;
  checksum: string | null;
};

export type BuildOutboundFileInput = {
  batch: {
    id_batch?: number | null;
    business_date: Date;
    channel?: string | null;
    file_type?: string | null;
  };
  attempts: PresentmentRow[];
  config?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

export type BuildOutboundFileResult = {
  fileName: string;
  fileBuffer: Buffer;
  fileText: string;
  controlTotals: AdapterControlTotals;
  adapter_version: string;
  rawMetadata: Record<string, unknown>;
};

export type ParsedInboundRow = {
  lineNo: number;
  external_attempt_ref: string | null;
  bank_result_code: string | null;
  bank_result_message: string | null;
  settled_at: Date | null;
  amount: number | null;
  processor_trace_id: string | null;
  operation_id: string | null;
  mapped_status: InternalPaymentStatus;
  mapped_detailed_reason: InternalDetailedReason;
  raw_line: string | null;
  raw_payload: Record<string, unknown>;
  raw_hash: string;
};

export type ParseInboundFileInput = {
  fileBuffer?: Buffer;
  fileText?: string | null;
};

export type ParseInboundFileResult = {
  rows: ParsedInboundRow[];
  controlTotals: AdapterControlTotals;
  parseWarnings: string[];
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export interface GaliciaPdAdapter {
  readonly name: string;
  readonly version: string;

  buildOutboundFile(input: BuildOutboundFileInput): BuildOutboundFileResult;
  parseInboundFile(input: ParseInboundFileInput): ParseInboundFileResult;
  validateOutboundControlTotals(input: {
    controlTotals: AdapterControlTotals;
    attempts: PresentmentRow[];
  }): ValidationResult;
  validateInboundControlTotals(input: {
    parsed: ParseInboundFileResult;
    expected?: Partial<AdapterControlTotals> | null;
  }): ValidationResult;
  mapBankResultCodeToInternalStatus(
    code: string | null | undefined,
    context?: { message?: string | null },
  ): BankResultMapping;

  // Compatibilidad con el contrato previo (PR #3)
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

export function checksumFromRows(rows: Array<Record<string, unknown>>): string {
  const canonical = rows
    .map((row) =>
      Object.entries(row)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k}=${v == null ? "" : String(v)}`)
        .join("|"),
    )
    .join("\n");
  return sha256Hex(canonical);
}

export function round2(value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.round(safe * 100) / 100;
}

export function safeFileText(input: ParseInboundFileInput): string {
  if (typeof input.fileText === "string") return input.fileText;
  if (Buffer.isBuffer(input.fileBuffer)) return input.fileBuffer.toString("utf8");
  return "";
}
