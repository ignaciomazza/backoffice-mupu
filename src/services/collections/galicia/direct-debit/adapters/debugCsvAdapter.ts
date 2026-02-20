import {
  buildRawHash,
  checksumFromRows,
  normalizeExternalReference,
  parseAmountArs,
  round2,
  safeFileText,
  type AdapterControlTotals,
  type BankResultMapping,
  type BuildOutboundFileInput,
  type BuildOutboundFileResult,
  type BuiltPresentment,
  type GaliciaPdAdapter,
  type ParseInboundFileInput,
  type ParseInboundFileResult,
  type ParsedResponseRecord,
  type PresentmentInput,
  type PresentmentRow,
  type ValidationResult,
} from "@/services/collections/galicia/direct-debit/adapter";

function escapeCsv(value: unknown): string {
  const raw = value == null ? "" : String(value);
  if (!/[",\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        quoted = false;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === '"') {
      quoted = true;
      continue;
    }

    if (ch === ",") {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
}

function toIsoDate(date: Date | null): string {
  if (!date || !Number.isFinite(date.getTime())) return "";
  return date.toISOString();
}

function parseOptionalDate(raw: string | null | undefined): Date | null {
  const normalized = String(raw || "").trim();
  if (!normalized) return null;
  const asDate = new Date(normalized);
  return Number.isFinite(asDate.getTime()) ? asDate : null;
}

function pickFirstNonEmpty(values: Array<string | null | undefined>): string {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function equalAmounts(a: number, b: number): boolean {
  return Math.abs(round2(a) - round2(b)) <= 0.009;
}

function computeControlTotalsFromAttempts(attempts: PresentmentRow[]): AdapterControlTotals {
  return {
    record_count: attempts.length,
    amount_total: round2(attempts.reduce((acc, row) => acc + Number(row.amountArs || 0), 0)),
    checksum: checksumFromRows(
      attempts.map((row) => ({
        external_reference: row.externalReference,
        amount_ars: round2(Number(row.amountArs || 0)).toFixed(2),
      })),
    ),
  };
}

function normalizeStatusFromCode(code: string | null | undefined): string {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

export class DebugCsvAdapter implements GaliciaPdAdapter {
  readonly name = "debug_csv";
  readonly version = "debug_csv_v1";

  mapBankResultCodeToInternalStatus(
    code: string | null | undefined,
    context?: { message?: string | null },
  ): BankResultMapping {
    const normalized = normalizeStatusFromCode(code);
    const normalizedMessage = normalizeStatusFromCode(context?.message);

    if (["PAID", "PAGADO", "00", "OK", "SUCCESS"].includes(normalized)) {
      return { status: "PAID", detailed_reason: null };
    }

    if (
      ["REJECTED", "RECHAZADO", "51", "SF", "INSUFFICIENT_FUNDS"].includes(normalized) ||
      normalizedMessage.includes("FONDOS")
    ) {
      return { status: "REJECTED", detailed_reason: "REJECTED_INSUFFICIENT_FUNDS" };
    }

    if (["14", "INVALID_ACCOUNT", "CBU_INVALIDA"].includes(normalized)) {
      return { status: "REJECTED", detailed_reason: "REJECTED_INVALID_ACCOUNT" };
    }

    if (["MD01", "MANDATE_INVALID", "MANDATE_INACTIVE"].includes(normalized)) {
      return { status: "REJECTED", detailed_reason: "REJECTED_MANDATE_INVALID" };
    }

    if (["15", "ACCOUNT_CLOSED", "CUENTA_CERRADA"].includes(normalized)) {
      return { status: "REJECTED", detailed_reason: "REJECTED_ACCOUNT_CLOSED" };
    }

    if (["96", "ERROR_FORMAT", "FORMAT_ERROR"].includes(normalized)) {
      return { status: "ERROR", detailed_reason: "ERROR_FORMAT" };
    }

    if (["94", "DUPLICATE", "ERROR_DUPLICATE"].includes(normalized)) {
      return { status: "ERROR", detailed_reason: "ERROR_DUPLICATE" };
    }

    if (["ERROR", "FAILED", "FALLIDO"].includes(normalized)) {
      return { status: "ERROR", detailed_reason: null };
    }

    if (!normalized) {
      return { status: "UNKNOWN", detailed_reason: null };
    }

    return { status: "UNKNOWN", detailed_reason: null };
  }

  buildOutboundFile(input: BuildOutboundFileInput): BuildOutboundFileResult {
    const header = [
      "external_reference",
      "attempt_id",
      "charge_id",
      "agency_id",
      "scheduled_for",
      "amount_ars",
      "holder_name",
      "holder_tax_id",
      "cbu_last4",
    ];

    const rows = input.attempts.map((row) => [
      row.externalReference,
      row.attemptId,
      row.chargeId,
      row.agencyId,
      toIsoDate(row.scheduledFor),
      round2(Number(row.amountArs || 0)).toFixed(2),
      row.holderName || "",
      row.holderTaxId || "",
      row.cbuLast4 || "",
    ]);

    const lines = [header, ...rows].map((line) => line.map(escapeCsv).join(","));
    const fileText = `${lines.join("\n")}\n`;

    const fileDate = input.batch.business_date.toISOString().slice(0, 10);
    const controlTotals = computeControlTotalsFromAttempts(input.attempts);

    return {
      fileName: `debug_pd_presentment_${fileDate}.csv`,
      fileBuffer: Buffer.from(fileText, "utf8"),
      fileText,
      controlTotals,
      adapter_version: this.version,
      rawMetadata: {
        adapter: this.name,
        adapter_version: this.version,
        batch_id: input.batch.id_batch ?? null,
      },
    };
  }

  parseInboundFile(input: ParseInboundFileInput): ParseInboundFileResult {
    const csv = safeFileText(input).replace(/^\uFEFF/, "");
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return {
        rows: [],
        controlTotals: { record_count: 0, amount_total: 0, checksum: null },
        parseWarnings: ["Archivo inbound vacío"],
      };
    }

    const headerCols = splitCsvLine(lines[0]).map((h) => h.trim());
    const idx = (name: string) => headerCols.findIndex((h) => h === name);
    const firstIdx = (...names: string[]) =>
      names
        .map((name) => idx(name))
        .find((value) => value >= 0) ?? -1;

    const extIdx = firstIdx("external_reference", "external_attempt_ref");
    const codeIdx = firstIdx("bank_result_code");
    const resultIdx = firstIdx("result");
    const rejectionCodeIdx = firstIdx("rejection_code");
    const msgIdx = firstIdx("bank_result_message");
    const rejectionReasonIdx = firstIdx("rejection_reason");
    const amountIdx = firstIdx("amount_ars", "amount");
    const settlementIdx = firstIdx("settled_at", "settlement_date");
    const traceIdx = firstIdx("processor_trace_id");
    const operationIdx = firstIdx("operation_id");
    const paidReferenceIdx = firstIdx("paid_reference");

    const rows = [] as ParseInboundFileResult["rows"];

    for (let i = 1; i < lines.length; i += 1) {
      const cols = splitCsvLine(lines[i]);
      const bankResultCode = pickFirstNonEmpty([
        codeIdx >= 0 ? cols[codeIdx] : "",
        resultIdx >= 0 ? cols[resultIdx] : "",
        rejectionCodeIdx >= 0 ? cols[rejectionCodeIdx] : "",
      ]);
      const bankResultMessage = pickFirstNonEmpty([
        msgIdx >= 0 ? cols[msgIdx] : "",
        rejectionReasonIdx >= 0 ? cols[rejectionReasonIdx] : "",
      ]);

      const raw = {
        external_reference: extIdx >= 0 ? cols[extIdx] ?? "" : "",
        bank_result_code: bankResultCode,
        bank_result_message: bankResultMessage,
        amount_ars: amountIdx >= 0 ? cols[amountIdx] ?? "" : "",
        settled_at: settlementIdx >= 0 ? cols[settlementIdx] ?? "" : "",
        processor_trace_id: traceIdx >= 0 ? cols[traceIdx] ?? "" : "",
        operation_id: pickFirstNonEmpty([
          operationIdx >= 0 ? cols[operationIdx] : "",
          paidReferenceIdx >= 0 ? cols[paidReferenceIdx] : "",
          traceIdx >= 0 ? cols[traceIdx] : "",
        ]),
        raw_line: lines[i],
      };

      const mapped = this.mapBankResultCodeToInternalStatus(raw.bank_result_code, {
        message: raw.bank_result_message,
      });

      rows.push({
        lineNo: i + 1,
        external_attempt_ref: normalizeExternalReference(raw.external_reference),
        bank_result_code: normalizeExternalReference(raw.bank_result_code),
        bank_result_message: normalizeExternalReference(raw.bank_result_message),
        settled_at: parseOptionalDate(raw.settled_at),
        amount: parseAmountArs(raw.amount_ars),
        processor_trace_id: normalizeExternalReference(raw.processor_trace_id),
        operation_id: normalizeExternalReference(raw.operation_id),
        mapped_status: mapped.status,
        mapped_detailed_reason: mapped.detailed_reason,
        raw_line: raw.raw_line,
        raw_payload: raw,
        raw_hash: buildRawHash(raw),
      });
    }

    const controlTotals = {
      record_count: rows.length,
      amount_total: round2(rows.reduce((acc, row) => acc + Number(row.amount || 0), 0)),
      checksum: checksumFromRows(
        rows.map((row) => ({
          external_attempt_ref: row.external_attempt_ref,
          bank_result_code: row.bank_result_code,
          amount: row.amount == null ? "" : round2(row.amount).toFixed(2),
        })),
      ),
    } satisfies AdapterControlTotals;

    return {
      rows,
      controlTotals,
      parseWarnings: [],
    };
  }

  validateOutboundControlTotals(input: {
    controlTotals: AdapterControlTotals;
    attempts: PresentmentRow[];
  }): ValidationResult {
    const expected = computeControlTotalsFromAttempts(input.attempts);
    const errors: string[] = [];

    if (input.controlTotals.record_count !== expected.record_count) {
      errors.push(
        `record_count mismatch: esperado=${expected.record_count} recibido=${input.controlTotals.record_count}`,
      );
    }

    if (!equalAmounts(input.controlTotals.amount_total, expected.amount_total)) {
      errors.push(
        `amount_total mismatch: esperado=${expected.amount_total.toFixed(2)} recibido=${input.controlTotals.amount_total.toFixed(2)}`,
      );
    }

    if (
      input.controlTotals.checksum &&
      expected.checksum &&
      input.controlTotals.checksum !== expected.checksum
    ) {
      errors.push("checksum mismatch");
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  }

  validateInboundControlTotals(input: {
    parsed: ParseInboundFileResult;
    expected?: Partial<AdapterControlTotals> | null;
  }): ValidationResult {
    const expected = input.expected;
    const errors: string[] = [];

    if (expected?.record_count != null && input.parsed.controlTotals.record_count !== expected.record_count) {
      errors.push(
        `record_count mismatch: esperado=${expected.record_count} recibido=${input.parsed.controlTotals.record_count}`,
      );
    }

    if (expected?.amount_total != null && !equalAmounts(input.parsed.controlTotals.amount_total, expected.amount_total)) {
      errors.push(
        `amount_total mismatch: esperado=${round2(expected.amount_total).toFixed(2)} recibido=${input.parsed.controlTotals.amount_total.toFixed(2)}`,
      );
    }

    if (
      expected?.checksum &&
      input.parsed.controlTotals.checksum &&
      input.parsed.controlTotals.checksum !== expected.checksum
    ) {
      errors.push("checksum mismatch");
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  }

  buildPresentment(input: PresentmentInput): BuiltPresentment {
    const built = this.buildOutboundFile({
      batch: {
        business_date: input.businessDate,
      },
      attempts: input.rows,
      meta: input.meta,
    });

    return {
      fileName: built.fileName,
      bytes: built.fileBuffer,
      meta: {
        ...built.rawMetadata,
        controlTotals: built.controlTotals,
        adapter_version: built.adapter_version,
      },
    };
  }

  parseResponse(bytes: Buffer): ParsedResponseRecord[] {
    const parsed = this.parseInboundFile({ fileBuffer: bytes });
    return parsed.rows.map((row) => ({
      lineNo: row.lineNo,
      externalReference: row.external_attempt_ref,
      rawHash: row.raw_hash,
      result:
        row.mapped_status === "PAID"
          ? "PAID"
          : row.mapped_status === "REJECTED"
            ? "REJECTED"
            : "ERROR",
      amountArs: row.amount,
      paidReference: row.operation_id,
      rejectionCode: row.bank_result_code,
      rejectionReason: row.bank_result_message,
      raw: row.raw_payload,
    }));
  }
}

export function buildDebugResponseCsv(input: {
  records: Array<{
    externalReference: string;
    result?: "PAID" | "REJECTED" | "ERROR";
    bankResultCode?: string;
    bankResultMessage?: string;
    amountArs?: number;
    paidReference?: string;
    rejectionCode?: string;
    rejectionReason?: string;
    settledAt?: string;
    processorTraceId?: string;
    operationId?: string;
  }>;
}): Buffer {
  const header = [
    "external_reference",
    "result",
    "bank_result_code",
    "bank_result_message",
    "amount_ars",
    "paid_reference",
    "rejection_code",
    "rejection_reason",
    "settled_at",
    "processor_trace_id",
    "operation_id",
  ];

  const lines = [
    header,
    ...input.records.map((r) => [
      r.externalReference,
      r.result ?? "",
      r.bankResultCode ?? "",
      r.bankResultMessage ?? "",
      r.amountArs == null ? "" : round2(r.amountArs).toFixed(2),
      r.paidReference ?? "",
      r.rejectionCode ?? "",
      r.rejectionReason ?? "",
      r.settledAt ?? "",
      r.processorTraceId ?? "",
      r.operationId ?? "",
    ]),
  ].map((line) => line.map(escapeCsv).join(","));

  return Buffer.from(`${lines.join("\n")}\n`, "utf8");
}
