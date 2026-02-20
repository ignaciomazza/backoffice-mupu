import {
  buildRawHash,
  normalizeExternalReference,
  parseAmountArs,
  type BuiltPresentment,
  type GaliciaPdAdapter,
  type ParsedResponseRecord,
  type PresentmentInput,
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

    if (ch === ',') {
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

function statusToResult(rawStatus: string | null | undefined): ParsedResponseRecord["result"] {
  const normalized = String(rawStatus || "").trim().toUpperCase();
  if (normalized === "PAID" || normalized === "PAGADO") return "PAID";
  if (normalized === "REJECTED" || normalized === "RECHAZADO") return "REJECTED";
  return "ERROR";
}

export class DebugCsvAdapter implements GaliciaPdAdapter {
  readonly name = "debug_csv";

  buildPresentment(input: PresentmentInput): BuiltPresentment {
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

    const rows = input.rows.map((row) => [
      row.externalReference,
      row.attemptId,
      row.chargeId,
      row.agencyId,
      toIsoDate(row.scheduledFor),
      row.amountArs.toFixed(2),
      row.holderName || "",
      row.holderTaxId || "",
      row.cbuLast4 || "",
    ]);

    const lines = [header, ...rows].map((line) => line.map(escapeCsv).join(","));
    const csv = `${lines.join("\n")}\n`;

    const fileDate = input.businessDate.toISOString().slice(0, 10);

    return {
      fileName: `debug_pd_presentment_${fileDate}.csv`,
      bytes: Buffer.from(csv, "utf8"),
      meta: {
        adapter: this.name,
        rows: input.rows.length,
      },
    };
  }

  parseResponse(bytes: Buffer): ParsedResponseRecord[] {
    const csv = bytes.toString("utf8").replace(/^\uFEFF/, "");
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return [];

    const headerCols = splitCsvLine(lines[0]).map((h) => h.trim());
    const idx = (name: string) => headerCols.findIndex((h) => h === name);

    const extIdx = idx("external_reference");
    const resultIdx = idx("result");
    const amountIdx = idx("amount_ars");
    const paidRefIdx = idx("paid_reference");
    const rejCodeIdx = idx("rejection_code");
    const rejReasonIdx = idx("rejection_reason");

    const records: ParsedResponseRecord[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cols = splitCsvLine(lines[i]);
      const raw = {
        external_reference: extIdx >= 0 ? cols[extIdx] ?? "" : "",
        result: resultIdx >= 0 ? cols[resultIdx] ?? "" : "",
        amount_ars: amountIdx >= 0 ? cols[amountIdx] ?? "" : "",
        paid_reference: paidRefIdx >= 0 ? cols[paidRefIdx] ?? "" : "",
        rejection_code: rejCodeIdx >= 0 ? cols[rejCodeIdx] ?? "" : "",
        rejection_reason: rejReasonIdx >= 0 ? cols[rejReasonIdx] ?? "" : "",
        raw_line: lines[i],
      };

      records.push({
        lineNo: i + 1,
        externalReference: normalizeExternalReference(raw.external_reference),
        rawHash: buildRawHash(raw),
        result: statusToResult(raw.result),
        amountArs: parseAmountArs(raw.amount_ars),
        paidReference: normalizeExternalReference(raw.paid_reference),
        rejectionCode: normalizeExternalReference(raw.rejection_code),
        rejectionReason: normalizeExternalReference(raw.rejection_reason),
        raw,
      });
    }

    return records;
  }
}

export function buildDebugResponseCsv(input: {
  records: Array<{
    externalReference: string;
    result: "PAID" | "REJECTED";
    amountArs?: number;
    paidReference?: string;
    rejectionCode?: string;
    rejectionReason?: string;
  }>;
}): Buffer {
  const header = [
    "external_reference",
    "result",
    "amount_ars",
    "paid_reference",
    "rejection_code",
    "rejection_reason",
  ];

  const lines = [
    header,
    ...input.records.map((r) => [
      r.externalReference,
      r.result,
      (r.amountArs ?? "").toString(),
      r.paidReference ?? "",
      r.rejectionCode ?? "",
      r.rejectionReason ?? "",
    ]),
  ].map((line) => line.map(escapeCsv).join(","));

  return Buffer.from(`${lines.join("\n")}\n`, "utf8");
}
