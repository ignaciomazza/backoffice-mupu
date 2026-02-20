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

const FILE_PREFIX = "GALICIA_PD";
const RESPONSE_PREFIX = "GALICIA_PD_RESP";
const DEFAULT_LAYOUT_VERSION = "v1.0";
const DEFAULT_ENTITY = "0001";
const DEFAULT_SERVICE = "PD";

function sanitizeSegment(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .replace(/[|\r\n]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeCode(value: string | null | undefined): string {
  return sanitizeSegment(value).toUpperCase().replace(/\s+/g, "_");
}

function formatYYYYMMDD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function parseYYYYMMDD(value: string | null | undefined): Date | null {
  const raw = sanitizeSegment(value);
  if (!/^\d{8}$/.test(raw)) return null;
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const d = Number(raw.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseYYYYMMDDHHmmss(value: string | null | undefined): Date | null {
  const raw = sanitizeSegment(value);
  if (!/^\d{14}$/.test(raw)) return null;
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const d = Number(raw.slice(6, 8));
  const h = Number(raw.slice(8, 10));
  const min = Number(raw.slice(10, 12));
  const s = Number(raw.slice(12, 14));
  const date = new Date(Date.UTC(y, m - 1, d, h, min, s));
  return Number.isFinite(date.getTime()) ? date : null;
}

function splitPipe(line: string): string[] {
  return line.split("|").map((segment) => segment.trim());
}

function equalAmounts(a: number, b: number): boolean {
  return Math.abs(round2(a) - round2(b)) <= 0.009;
}

function computeTotalsFromAttempts(attempts: PresentmentRow[]): AdapterControlTotals {
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

function computeTotalsFromRows(rows: ParseInboundFileResult["rows"]): AdapterControlTotals {
  return {
    record_count: rows.length,
    amount_total: round2(rows.reduce((acc, row) => acc + Number(row.amount || 0), 0)),
    checksum: checksumFromRows(
      rows.map((row) => ({
        external_attempt_ref: row.external_attempt_ref,
        bank_result_code: row.bank_result_code,
        amount: row.amount == null ? "" : round2(row.amount).toFixed(2),
      })),
    ),
  };
}

function buildHeader(input: {
  layoutVersion: string;
  entity: string;
  service: string;
  businessDate: Date;
  totals: AdapterControlTotals;
}): string {
  return [
    "H",
    FILE_PREFIX,
    input.layoutVersion,
    input.entity,
    input.service,
    formatYYYYMMDD(input.businessDate),
    String(input.totals.record_count),
    input.totals.amount_total.toFixed(2),
    input.totals.checksum || "",
  ].join("|");
}

function buildTrailer(totals: AdapterControlTotals): string {
  return [
    "T",
    String(totals.record_count),
    totals.amount_total.toFixed(2),
    totals.checksum || "",
  ].join("|");
}

export class GaliciaPdV1Adapter implements GaliciaPdAdapter {
  readonly name = "galicia_pd_v1";
  readonly version = "galicia_pd_v1.0";

  mapBankResultCodeToInternalStatus(
    code: string | null | undefined,
    context?: { message?: string | null },
  ): BankResultMapping {
    const normalized = normalizeCode(code);
    const normalizedMessage = normalizeCode(context?.message);

    if (["00", "0000", "PAID", "PAGADO", "OK", "APROBADO"].includes(normalized)) {
      return { status: "PAID", detailed_reason: null };
    }

    if (
      ["51", "116", "SF", "INSUFFICIENT_FUNDS", "FONDOS_INSUFICIENTES"].includes(normalized) ||
      normalizedMessage.includes("FONDOS")
    ) {
      return { status: "REJECTED", detailed_reason: "REJECTED_INSUFFICIENT_FUNDS" };
    }

    if (["14", "303", "INVALID_ACCOUNT", "CBU_INVALIDA", "CUENTA_INVALIDA"].includes(normalized)) {
      return { status: "REJECTED", detailed_reason: "REJECTED_INVALID_ACCOUNT" };
    }

    if (
      [
        "MD01",
        "304",
        "MANDATE_INVALID",
        "MANDATE_INACTIVE",
        "MANDATO_INVALIDO",
        "MANDATO_INACTIVO",
      ].includes(normalized)
    ) {
      return { status: "REJECTED", detailed_reason: "REJECTED_MANDATE_INVALID" };
    }

    if (["15", "305", "ACCOUNT_CLOSED", "CUENTA_CERRADA"].includes(normalized)) {
      return { status: "REJECTED", detailed_reason: "REJECTED_ACCOUNT_CLOSED" };
    }

    if (["96", "906", "FORMAT_ERROR", "ERROR_FORMAT"].includes(normalized)) {
      return { status: "ERROR", detailed_reason: "ERROR_FORMAT" };
    }

    if (["94", "907", "DUPLICATE", "ERROR_DUPLICATE"].includes(normalized)) {
      return { status: "ERROR", detailed_reason: "ERROR_DUPLICATE" };
    }

    if (["91", "92", "93", "ERROR", "FAILED", "FALLIDO"].includes(normalized)) {
      return { status: "ERROR", detailed_reason: null };
    }

    if (!normalized) {
      return { status: "UNKNOWN", detailed_reason: null };
    }

    return { status: "UNKNOWN", detailed_reason: null };
  }

  buildOutboundFile(input: BuildOutboundFileInput): BuildOutboundFileResult {
    const layoutVersion = sanitizeSegment(
      String(input.config?.layout_version || DEFAULT_LAYOUT_VERSION),
    );
    const entity = sanitizeSegment(String(input.config?.entity || DEFAULT_ENTITY));
    const service = sanitizeSegment(String(input.config?.service || DEFAULT_SERVICE));

    const controlTotals = computeTotalsFromAttempts(input.attempts);

    const details = input.attempts.map((row, idx) => [
      "D",
      String(idx + 1),
      sanitizeSegment(row.externalReference),
      round2(Number(row.amountArs || 0)).toFixed(2),
      row.scheduledFor ? formatYYYYMMDD(row.scheduledFor) : "",
      sanitizeSegment(row.holderName),
      sanitizeSegment(row.holderTaxId),
      sanitizeSegment(row.cbuLast4),
    ].join("|"));

    const header = buildHeader({
      layoutVersion,
      entity,
      service,
      businessDate: input.batch.business_date,
      totals: controlTotals,
    });
    const trailer = buildTrailer(controlTotals);
    const fileText = `${[header, ...details, trailer].join("\n")}\n`;

    return {
      fileName: `galicia_pd_v1_${entity}_${formatYYYYMMDD(input.batch.business_date)}.txt`,
      fileBuffer: Buffer.from(fileText, "utf8"),
      fileText,
      controlTotals,
      adapter_version: this.version,
      rawMetadata: {
        adapter: this.name,
        adapter_version: this.version,
        layout_version: layoutVersion,
        entity,
        service,
        header,
        trailer,
      },
    };
  }

  parseInboundFile(input: ParseInboundFileInput): ParseInboundFileResult {
    const text = safeFileText(input).replace(/^\uFEFF/, "");
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const parseWarnings: string[] = [];
    if (!lines.length) {
      return {
        rows: [],
        controlTotals: { record_count: 0, amount_total: 0, checksum: null },
        parseWarnings: ["Archivo inbound vacío"],
      };
    }

    let headerTotals: AdapterControlTotals | null = null;
    let trailerTotals: AdapterControlTotals | null = null;

    const rows: ParseInboundFileResult["rows"] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const cols = splitPipe(line);
      const type = cols[0];

      if (type === "H") {
        if (cols[1] !== RESPONSE_PREFIX && cols[1] !== FILE_PREFIX) {
          parseWarnings.push(`Header con prefijo no esperado en línea ${i + 1}: ${cols[1] || "-"}`);
        }

        headerTotals = {
          record_count: Number.parseInt(cols[6] || "0", 10) || 0,
          amount_total: parseAmountArs(cols[7]) ?? 0,
          checksum: normalizeExternalReference(cols[8]),
        };
        continue;
      }

      if (type === "T") {
        trailerTotals = {
          record_count: Number.parseInt(cols[1] || "0", 10) || 0,
          amount_total: parseAmountArs(cols[2]) ?? 0,
          checksum: normalizeExternalReference(cols[3]),
        };
        continue;
      }

      if (type !== "D") {
        parseWarnings.push(`Línea ignorada por tipo desconocido (${type || "vacío"}) en línea ${i + 1}`);
        continue;
      }

      const externalAttemptRef = normalizeExternalReference(cols[2]);
      const bankResultCode = normalizeExternalReference(cols[3]);
      const bankResultMessage = normalizeExternalReference(cols[4]);
      const amount = parseAmountArs(cols[5]);
      const settledAt = parseYYYYMMDDHHmmss(cols[6]) || parseYYYYMMDD(cols[6]);
      const processorTraceId = normalizeExternalReference(cols[7]);
      const operationId = normalizeExternalReference(cols[8]);

      const rawPayload = {
        sequence: cols[1] || "",
        external_attempt_ref: cols[2] || "",
        bank_result_code: cols[3] || "",
        bank_result_message: cols[4] || "",
        amount: cols[5] || "",
        settled_at: cols[6] || "",
        processor_trace_id: cols[7] || "",
        operation_id: cols[8] || "",
        raw_line: line,
      };

      const mapped = this.mapBankResultCodeToInternalStatus(bankResultCode, {
        message: bankResultMessage,
      });

      rows.push({
        lineNo: i + 1,
        external_attempt_ref: externalAttemptRef,
        bank_result_code: bankResultCode,
        bank_result_message: bankResultMessage,
        settled_at: settledAt,
        amount,
        processor_trace_id: processorTraceId,
        operation_id: operationId,
        mapped_status: mapped.status,
        mapped_detailed_reason: mapped.detailed_reason,
        raw_line: line,
        raw_payload: rawPayload,
        raw_hash: buildRawHash(rawPayload),
      });
    }

    const computedTotals = computeTotalsFromRows(rows);
    const declaredTotals = trailerTotals || headerTotals;

    if (declaredTotals) {
      if (declaredTotals.record_count !== computedTotals.record_count) {
        parseWarnings.push(
          `Control total record_count declarado=${declaredTotals.record_count} calculado=${computedTotals.record_count}`,
        );
      }
      if (!equalAmounts(declaredTotals.amount_total, computedTotals.amount_total)) {
        parseWarnings.push(
          `Control total amount_total declarado=${declaredTotals.amount_total.toFixed(2)} calculado=${computedTotals.amount_total.toFixed(2)}`,
        );
      }
      if (
        declaredTotals.checksum &&
        computedTotals.checksum &&
        declaredTotals.checksum !== computedTotals.checksum
      ) {
        parseWarnings.push("Control total checksum declarado distinto del calculado");
      }
    }

    return {
      rows,
      controlTotals: declaredTotals || computedTotals,
      parseWarnings,
    };
  }

  validateOutboundControlTotals(input: {
    controlTotals: AdapterControlTotals;
    attempts: PresentmentRow[];
  }): ValidationResult {
    const expected = computeTotalsFromAttempts(input.attempts);
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
      expected.checksum &&
      input.controlTotals.checksum &&
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
    const errors: string[] = [];
    const computed = computeTotalsFromRows(input.parsed.rows);

    if (input.parsed.controlTotals.record_count !== computed.record_count) {
      errors.push(
        `record_count mismatch: declarado=${input.parsed.controlTotals.record_count} calculado=${computed.record_count}`,
      );
    }

    if (!equalAmounts(input.parsed.controlTotals.amount_total, computed.amount_total)) {
      errors.push(
        `amount_total mismatch: declarado=${input.parsed.controlTotals.amount_total.toFixed(2)} calculado=${computed.amount_total.toFixed(2)}`,
      );
    }

    if (
      input.parsed.controlTotals.checksum &&
      computed.checksum &&
      input.parsed.controlTotals.checksum !== computed.checksum
    ) {
      errors.push("checksum mismatch entre archivo y detalle parseado");
    }

    if (input.expected?.record_count != null && input.expected.record_count !== computed.record_count) {
      errors.push(
        `record_count esperado mismatch: esperado=${input.expected.record_count} calculado=${computed.record_count}`,
      );
    }

    if (
      input.expected?.amount_total != null &&
      !equalAmounts(input.expected.amount_total, computed.amount_total)
    ) {
      errors.push(
        `amount_total esperado mismatch: esperado=${round2(input.expected.amount_total).toFixed(2)} calculado=${computed.amount_total.toFixed(2)}`,
      );
    }

    if (
      input.expected?.checksum &&
      computed.checksum &&
      input.expected.checksum !== computed.checksum
    ) {
      errors.push("checksum esperado mismatch");
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
