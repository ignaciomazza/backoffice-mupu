import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getBillingConfig } from "@/lib/billingConfig";
import {
  dateKeyInTimeZone,
  normalizeLocalDay,
} from "@/services/collections/core/dates";
import {
  type GaliciaPdAdapter,
  type PresentmentRow,
} from "@/services/collections/galicia/direct-debit/adapter";
import { DebugCsvAdapter } from "@/services/collections/galicia/direct-debit/adapters/debugCsvAdapter";
import { GaliciaPdV1Adapter } from "@/services/collections/galicia/direct-debit/adapters/galiciaPdV1Adapter";
import {
  readBatchFile,
  sha256OfBuffer,
  uploadBatchFile,
} from "@/services/collections/galicia/direct-debit/storage";
import { issueFiscalForCharge } from "@/services/collections/fiscal/issueOnPaid";
import { logBillingEvent } from "@/services/billing/events";

export type CreatePresentmentBatchInput = {
  businessDate: Date;
  actorUserId?: number | null;
};

export type ImportResponseBatchInput = {
  outboundBatchId: number;
  uploadedFile: {
    fileName: string;
    bytes: Buffer;
    contentType?: string;
  };
  actorUserId?: number | null;
};

export type BatchSummary = {
  matched_rows: number;
  error_rows: number;
  rejected: number;
  paid: number;
  fiscal_issued: number;
  fiscal_failed: number;
};

const PD_CHANNEL = "OFFICE_BANKING";
const OUTBOUND_FILE_TYPE = "PD_PRESENTMENT";
const INBOUND_FILE_TYPE = "PD_RESPONSE";
const PD_TX_MAX_WAIT_MS = Number.parseInt(
  process.env.BILLING_PD_TX_MAX_WAIT_MS || "10000",
  10,
);
const PD_TX_TIMEOUT_MS = Number.parseInt(
  process.env.BILLING_PD_TX_TIMEOUT_MS || "45000",
  10,
);

function round2(value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.round(safe * 100) / 100;
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on", "si"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function resolveAdapter(): GaliciaPdAdapter {
  const mode = String(process.env.BILLING_PD_ADAPTER || "debug_csv")
    .trim()
    .toLowerCase();

  if (mode === "galicia_pd_v1") {
    return new GaliciaPdV1Adapter();
  }

  return new DebugCsvAdapter();
}

function buildStorageKey(params: {
  direction: "OUTBOUND" | "INBOUND";
  batchId: number;
  fileName: string;
  businessDate: Date;
}): string {
  const datePart = params.businessDate.toISOString().slice(0, 10);
  const cleanName = params.fileName
    .normalize("NFD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

  const safeName = cleanName || "lote.csv";
  return `billing/direct-debit/${params.direction.toLowerCase()}/${datePart}/batch-${params.batchId}-${safeName}`;
}

function normalizeExternalReference(raw: string | null | undefined, fallback: string): string {
  const normalized = String(raw || "").trim();
  return normalized || fallback;
}

function hashFallbackFromReference(externalReference: string): string {
  return createHash("sha256").update(`external_reference=${externalReference}`).digest("hex");
}

function serializeMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function pdTxOptions() {
  return {
    maxWait: Number.isFinite(PD_TX_MAX_WAIT_MS) ? PD_TX_MAX_WAIT_MS : 10000,
    timeout: Number.isFinite(PD_TX_TIMEOUT_MS) ? PD_TX_TIMEOUT_MS : 45000,
  };
}

async function logBatchEventForAgencies(input: {
  agencyIds: number[];
  eventType: string;
  payload: Prisma.InputJsonValue;
  createdBy?: number | null;
}): Promise<void> {
  const uniqueAgencyIds = Array.from(
    new Set(input.agencyIds.filter((id) => Number.isInteger(id) && id > 0)),
  );

  for (const agencyId of uniqueAgencyIds) {
    await logBillingEvent({
      id_agency: agencyId,
      subscription_id: null,
      event_type: input.eventType,
      payload: input.payload,
      created_by: input.createdBy ?? null,
    });
  }
}

async function updateBatchStatus(
  idBatch: number,
  data: Parameters<typeof prisma.agencyBillingFileBatch.update>[0]["data"],
): Promise<void> {
  await prisma.agencyBillingFileBatch.update({
    where: { id_batch: idBatch },
    data,
  });
}

async function buildPresentmentRows(params: {
  businessDate: Date;
  requireActiveMandate: boolean;
}): Promise<Array<PresentmentRow & { attemptId: number }>> {
  const attempts = await prisma.agencyBillingAttempt.findMany({
    where: {
      status: "PENDING",
      channel: PD_CHANNEL,
      scheduled_for: { lte: params.businessDate },
    },
    include: {
      charge: {
        select: {
          id_charge: true,
          id_agency: true,
          status: true,
          amount_ars_due: true,
          selected_method_id: true,
        },
      },
      paymentMethod: {
        select: {
          id_payment_method: true,
          holder_name: true,
          holder_tax_id: true,
          mandate: {
            select: {
              status: true,
              cbu_last4: true,
            },
          },
        },
      },
    },
    orderBy: [{ scheduled_for: "asc" }, { id_attempt: "asc" }],
    take: 5000,
  });

  const filtered = attempts.filter((attempt) => {
    if (!attempt.charge) return false;
    if (attempt.charge.status === "PAID") return false;

    if (params.requireActiveMandate) {
      const mandateStatus = attempt.paymentMethod?.mandate?.status;
      return mandateStatus === "ACTIVE";
    }

    return true;
  });

  return filtered.map((attempt) => {
    const externalReference = normalizeExternalReference(
      attempt.external_reference,
      `AT-${attempt.id_attempt}`,
    );

    return {
      attemptId: attempt.id_attempt,
      chargeId: attempt.charge.id_charge,
      agencyId: attempt.charge.id_agency,
      externalReference,
      amountArs: Number(attempt.charge.amount_ars_due || 0),
      scheduledFor: attempt.scheduled_for,
      holderName: attempt.paymentMethod?.holder_name || null,
      holderTaxId: attempt.paymentMethod?.holder_tax_id || null,
      cbuLast4: attempt.paymentMethod?.mandate?.cbu_last4 || null,
    };
  });
}

export async function createPresentmentBatch(
  input: CreatePresentmentBatchInput,
): Promise<{
  batch: {
    id_batch: number;
    direction: string;
    business_date: Date;
    status: string;
    total_rows: number;
    total_amount_ars: number | null;
    storage_key: string | null;
    sha256: string | null;
  };
  downloadFileName: string | null;
}> {
  const config = getBillingConfig();
  const businessDate = normalizeLocalDay(input.businessDate, config.timezone);
  const adapter = resolveAdapter();
  const requireActiveMandate = parseBooleanEnv(
    "BILLING_PD_REQUIRE_ACTIVE_MANDATE",
    true,
  );

  const rows = await buildPresentmentRows({ businessDate, requireActiveMandate });

  const totalAmount = round2(rows.reduce((acc, row) => acc + row.amountArs, 0));

  const created = await prisma.$transaction(
    async (tx) => {
      const batch = await tx.agencyBillingFileBatch.create({
        data: {
          direction: "OUTBOUND",
          channel: PD_CHANNEL,
          file_type: OUTBOUND_FILE_TYPE,
          adapter: adapter.name,
          business_date: businessDate,
          status: rows.length ? "CREATING" : "EMPTY",
          total_rows: rows.length,
          total_amount_ars: rows.length ? totalAmount : null,
          meta: {
            require_active_mandate: requireActiveMandate,
          },
          created_by: input.actorUserId ?? null,
        },
      });

      if (!rows.length) {
        return {
          batch,
          rows,
          fileName: null as string | null,
          fileBytes: null as Buffer | null,
        };
      }

      const built = adapter.buildPresentment({
        businessDate,
        rows,
        meta: {
          batch_id: batch.id_batch,
        },
      });

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];

        await tx.agencyBillingAttempt.update({
          where: { id_attempt: row.attemptId },
          data: {
            external_reference: row.externalReference,
            status: "PROCESSING",
          },
        });

        await tx.agencyBillingFileBatchItem.create({
          data: {
            batch_id: batch.id_batch,
            attempt_id: row.attemptId,
            charge_id: row.chargeId,
            line_no: i + 2,
            external_reference: row.externalReference,
            raw_hash: hashFallbackFromReference(row.externalReference),
            amount_ars: row.amountArs,
            status: "PENDING",
            row_payload: toJsonValue(row),
          },
        });
      }

      const chargeIds = Array.from(new Set(rows.map((row) => row.chargeId)));
      if (chargeIds.length > 0) {
        await tx.agencyBillingCharge.updateMany({
          where: {
            id_charge: { in: chargeIds },
            status: { in: ["READY", "PENDING"] },
          },
          data: { status: "PROCESSING" },
        });
      }

      return {
        batch,
        rows,
        fileName: built.fileName,
        fileBytes: built.bytes,
      };
    },
    pdTxOptions(),
  );

  if (!created.fileBytes || !created.fileName) {
    return {
      batch: {
        id_batch: created.batch.id_batch,
        direction: created.batch.direction,
        business_date: created.batch.business_date,
        status: created.batch.status,
        total_rows: created.batch.total_rows,
        total_amount_ars: created.batch.total_amount_ars
          ? Number(created.batch.total_amount_ars)
          : null,
        storage_key: created.batch.storage_key,
        sha256: created.batch.sha256,
      },
      downloadFileName: null,
    };
  }

  const sha256 = sha256OfBuffer(created.fileBytes);
  const storageKey = buildStorageKey({
    direction: "OUTBOUND",
    batchId: created.batch.id_batch,
    fileName: created.fileName,
    businessDate,
  });

  try {
    await uploadBatchFile({
      storageKey,
      bytes: created.fileBytes,
      contentType: "text/csv; charset=utf-8",
    });

    await updateBatchStatus(created.batch.id_batch, {
      status: "READY",
      storage_key: storageKey,
      sha256,
      original_file_name: created.fileName,
    });
  } catch (error) {
    await prisma.$transaction(
      async (tx) => {
        await tx.agencyBillingFileBatch.update({
          where: { id_batch: created.batch.id_batch },
          data: {
            status: "FAILED",
            meta: {
              ...(serializeMeta(created.batch.meta) || {}),
              error: error instanceof Error ? error.message : String(error),
            },
          },
        });

        const attemptIds = created.rows.map((row) => row.attemptId);
        if (attemptIds.length) {
          await tx.agencyBillingAttempt.updateMany({
            where: { id_attempt: { in: attemptIds }, status: "PROCESSING" },
            data: { status: "PENDING" },
          });
        }
      },
      pdTxOptions(),
    );

    throw error;
  }

  await logBatchEventForAgencies({
    agencyIds: created.rows.map((row) => row.agencyId),
    eventType: "PD_BATCH_OUTBOUND_CREATED",
    payload: {
      batch_id: created.batch.id_batch,
      business_date: dateKeyInTimeZone(businessDate, config.timezone),
      total_rows: created.rows.length,
      total_amount_ars: totalAmount,
      adapter: adapter.name,
    },
    createdBy: input.actorUserId ?? null,
  });

  return {
    batch: {
      id_batch: created.batch.id_batch,
      direction: "OUTBOUND",
      business_date: businessDate,
      status: "READY",
      total_rows: created.rows.length,
      total_amount_ars: totalAmount,
      storage_key: storageKey,
      sha256,
    },
    downloadFileName: created.fileName,
  };
}

export async function listDirectDebitBatches(input: { from: Date; to: Date }) {
  const items = await prisma.agencyBillingFileBatch.findMany({
    where: {
      business_date: {
        gte: input.from,
        lte: input.to,
      },
      file_type: { in: [OUTBOUND_FILE_TYPE, INBOUND_FILE_TYPE] },
      channel: PD_CHANNEL,
    },
    include: {
      parentBatch: {
        select: {
          id_batch: true,
          direction: true,
          business_date: true,
        },
      },
      _count: {
        select: {
          items: true,
        },
      },
    },
    orderBy: [{ business_date: "desc" }, { id_batch: "desc" }],
    take: 300,
  });

  return items.map((item) => ({
    id_batch: item.id_batch,
    parent_batch_id: item.parent_batch_id,
    direction: item.direction,
    channel: item.channel,
    file_type: item.file_type,
    adapter: item.adapter,
    business_date: item.business_date,
    status: item.status,
    storage_key: item.storage_key,
    original_file_name: item.original_file_name,
    sha256: item.sha256,
    total_rows: item.total_rows,
    total_amount_ars:
      item.total_amount_ars == null ? null : Number(item.total_amount_ars),
    total_paid_rows: item.total_paid_rows,
    total_rejected_rows: item.total_rejected_rows,
    total_error_rows: item.total_error_rows,
    created_at: item.created_at,
    updated_at: item.updated_at,
    items_count: item._count.items,
    parent_batch: item.parentBatch,
  }));
}

export async function downloadDirectDebitBatchFile(idBatch: number): Promise<{
  fileName: string;
  bytes: Buffer;
  contentType: string;
}> {
  const batch = await prisma.agencyBillingFileBatch.findUnique({
    where: { id_batch: idBatch },
    select: {
      id_batch: true,
      storage_key: true,
      original_file_name: true,
      direction: true,
      file_type: true,
    },
  });

  if (!batch) {
    throw new Error("Batch no encontrado");
  }

  if (!batch.storage_key) {
    throw new Error("Batch sin archivo asociado");
  }

  const bytes = await readBatchFile(batch.storage_key);
  return {
    fileName:
      batch.original_file_name ||
      `batch-${batch.id_batch}-${batch.direction.toLowerCase()}.csv`,
    bytes,
    contentType: "text/csv; charset=utf-8",
  };
}

export async function importResponseBatch(
  input: ImportResponseBatchInput,
): Promise<{
  inbound_batch_id: number;
  summary: BatchSummary;
}> {
  const outbound = await prisma.agencyBillingFileBatch.findUnique({
    where: { id_batch: input.outboundBatchId },
    include: {
      items: {
        select: {
          id_item: true,
          attempt_id: true,
          charge_id: true,
          external_reference: true,
          raw_hash: true,
          amount_ars: true,
          status: true,
        },
      },
    },
  });

  if (!outbound || outbound.direction !== "OUTBOUND") {
    throw new Error("Batch outbound no encontrado");
  }

  const adapter = resolveAdapter();
  const parsedRows = adapter.parseResponse(input.uploadedFile.bytes);
  const inboundSha = sha256OfBuffer(input.uploadedFile.bytes);

  const duplicate = await prisma.agencyBillingFileBatch.findFirst({
    where: {
      direction: "INBOUND",
      parent_batch_id: outbound.id_batch,
      sha256: inboundSha,
    },
  });

  if (duplicate) {
    return {
      inbound_batch_id: duplicate.id_batch,
      summary: {
        matched_rows: duplicate.total_rows,
        error_rows: duplicate.total_error_rows,
        rejected: duplicate.total_rejected_rows,
        paid: duplicate.total_paid_rows,
        fiscal_issued: 0,
        fiscal_failed: 0,
      },
    };
  }

  const config = getBillingConfig();
  const businessDate = normalizeLocalDay(new Date(), config.timezone);

  const inbound = await prisma.agencyBillingFileBatch.create({
    data: {
      parent_batch_id: outbound.id_batch,
      direction: "INBOUND",
      channel: PD_CHANNEL,
      file_type: INBOUND_FILE_TYPE,
      adapter: adapter.name,
      business_date: businessDate,
      status: "PROCESSING",
      total_rows: parsedRows.length,
      created_by: input.actorUserId ?? null,
      original_file_name: input.uploadedFile.fileName,
    },
  });

  const inboundStorageKey = buildStorageKey({
    direction: "INBOUND",
    batchId: inbound.id_batch,
    fileName: input.uploadedFile.fileName,
    businessDate,
  });

  await uploadBatchFile({
    storageKey: inboundStorageKey,
    bytes: input.uploadedFile.bytes,
    contentType: input.uploadedFile.contentType || "text/csv; charset=utf-8",
  });

  const byExternal = new Map<string, typeof outbound.items[number]>();
  const byRawHash = new Map<string, typeof outbound.items[number]>();
  const touchedAgencyIds = new Set<number>();

  for (const item of outbound.items) {
    if (item.external_reference) byExternal.set(item.external_reference, item);
    if (item.raw_hash) byRawHash.set(item.raw_hash, item);
  }

  let matchedRows = 0;
  let paidRows = 0;
  let rejectedRows = 0;
  let errorRows = 0;
  const paidChargeIds = new Set<number>();

  for (const row of parsedRows) {
    const match =
      (row.externalReference ? byExternal.get(row.externalReference) : undefined) ||
      byRawHash.get(row.rawHash) ||
      (row.externalReference
        ? byRawHash.get(hashFallbackFromReference(row.externalReference))
        : undefined);

    if (!match || !match.attempt_id || !match.charge_id) {
      errorRows += 1;
      await prisma.agencyBillingFileBatchItem.create({
        data: {
          batch_id: inbound.id_batch,
          line_no: row.lineNo,
          external_reference: row.externalReference,
          raw_hash: row.rawHash,
          amount_ars: row.amountArs,
          status: "ERROR",
          response_code: row.rejectionCode,
          response_message: row.rejectionReason || "No se pudo matchear registro",
          paid_reference: row.paidReference,
          row_payload: toJsonValue(row.raw),
          processed_at: new Date(),
        },
      });
      continue;
    }

    matchedRows += 1;

    await prisma.$transaction(
      async (tx) => {
        const attempt = await tx.agencyBillingAttempt.findUnique({
          where: { id_attempt: match.attempt_id as number },
          select: {
            id_attempt: true,
            charge_id: true,
            attempt_no: true,
            status: true,
          },
        });

        const charge = await tx.agencyBillingCharge.findUnique({
          where: { id_charge: match.charge_id as number },
          select: {
            id_charge: true,
            id_agency: true,
            cycle_id: true,
            status: true,
            amount_ars_due: true,
            amount_ars_paid: true,
          },
        });

        if (!attempt || !charge) {
          errorRows += 1;
          await tx.agencyBillingFileBatchItem.create({
            data: {
              batch_id: inbound.id_batch,
              line_no: row.lineNo,
              attempt_id: match.attempt_id,
              charge_id: match.charge_id,
              external_reference: row.externalReference,
              raw_hash: row.rawHash,
              amount_ars: row.amountArs,
              status: "ERROR",
              response_code: row.rejectionCode,
              response_message: "Attempt o Charge no encontrado",
              paid_reference: row.paidReference,
              row_payload: toJsonValue(row.raw),
              processed_at: new Date(),
            },
          });
          return;
        }

        touchedAgencyIds.add(charge.id_agency);

        if (row.result === "PAID") {
          const paidAt = new Date();
          const paidAmount = row.amountArs ?? Number(charge.amount_ars_due || 0);

          if (attempt.status !== "PAID") {
            await tx.agencyBillingAttempt.update({
              where: { id_attempt: attempt.id_attempt },
              data: {
                status: "PAID",
                processed_at: paidAt,
                paid_reference: row.paidReference,
                rejection_code: null,
                rejection_reason: null,
              },
            });
          }

          await tx.agencyBillingCharge.update({
            where: { id_charge: charge.id_charge },
            data: {
              status: "PAID",
              amount_ars_paid: paidAmount,
              paid_at: paidAt,
              paid_reference: row.paidReference,
              reconciliation_status: "MATCHED",
              paid_currency: "ARS",
            },
          });

          await tx.agencyBillingAttempt.updateMany({
            where: {
              charge_id: charge.id_charge,
              attempt_no: { gt: attempt.attempt_no },
              status: { in: ["PENDING", "SCHEDULED", "PROCESSING"] },
            },
            data: {
              status: "CANCELED",
              processed_at: paidAt,
              notes: "Cancelado por cobro exitoso en intento previo",
            },
          });

          if (charge.cycle_id) {
            await tx.agencyBillingCycle.update({
              where: { id_cycle: charge.cycle_id },
              data: { status: "PAID" },
            });
          }

          await tx.agencyBillingFileBatchItem.updateMany({
            where: { id_item: match.id_item },
            data: {
              status: "PAID",
              response_code: row.rejectionCode,
              response_message: row.rejectionReason,
              paid_reference: row.paidReference,
              processed_at: paidAt,
            },
          });

          await tx.agencyBillingFileBatchItem.create({
            data: {
              batch_id: inbound.id_batch,
              line_no: row.lineNo,
              attempt_id: attempt.id_attempt,
              charge_id: charge.id_charge,
              external_reference: row.externalReference,
              raw_hash: row.rawHash,
              amount_ars: paidAmount,
              status: "PAID",
              response_code: row.rejectionCode,
              response_message: row.rejectionReason,
              paid_reference: row.paidReference,
              row_payload: toJsonValue(row.raw),
              processed_at: paidAt,
            },
          });

          await logBillingEvent(
            {
              id_agency: charge.id_agency,
              subscription_id: null,
              event_type: "ATTEMPT_MARKED_PAID",
              payload: {
                outbound_batch_id: outbound.id_batch,
                inbound_batch_id: inbound.id_batch,
                attempt_id: attempt.id_attempt,
                charge_id: charge.id_charge,
                paid_reference: row.paidReference,
                amount_ars: paidAmount,
              },
              created_by: input.actorUserId ?? null,
            },
            tx,
          );

          paidRows += 1;
          paidChargeIds.add(charge.id_charge);
          return;
        }

        if (row.result === "REJECTED") {
          const processedAt = new Date();

          if (!["PAID", "REJECTED"].includes(attempt.status)) {
            await tx.agencyBillingAttempt.update({
              where: { id_attempt: attempt.id_attempt },
              data: {
                status: "REJECTED",
                processed_at: processedAt,
                rejection_code: row.rejectionCode,
                rejection_reason: row.rejectionReason,
              },
            });
          }

          if (charge.status !== "PAID") {
            await tx.agencyBillingCharge.update({
              where: { id_charge: charge.id_charge },
              data: {
                status: "PAST_DUE",
                reconciliation_status: "UNMATCHED",
              },
            });
          }

          await tx.agencyBillingFileBatchItem.updateMany({
            where: { id_item: match.id_item },
            data: {
              status: "REJECTED",
              response_code: row.rejectionCode,
              response_message: row.rejectionReason,
              processed_at: processedAt,
            },
          });

          await tx.agencyBillingFileBatchItem.create({
            data: {
              batch_id: inbound.id_batch,
              line_no: row.lineNo,
              attempt_id: attempt.id_attempt,
              charge_id: charge.id_charge,
              external_reference: row.externalReference,
              raw_hash: row.rawHash,
              amount_ars: row.amountArs,
              status: "REJECTED",
              response_code: row.rejectionCode,
              response_message: row.rejectionReason,
              paid_reference: row.paidReference,
              row_payload: toJsonValue(row.raw),
              processed_at: processedAt,
            },
          });

          await logBillingEvent(
            {
              id_agency: charge.id_agency,
              subscription_id: null,
              event_type: "ATTEMPT_MARKED_REJECTED",
              payload: {
                outbound_batch_id: outbound.id_batch,
                inbound_batch_id: inbound.id_batch,
                attempt_id: attempt.id_attempt,
                charge_id: charge.id_charge,
                rejection_code: row.rejectionCode,
                rejection_reason: row.rejectionReason,
              },
              created_by: input.actorUserId ?? null,
            },
            tx,
          );

          rejectedRows += 1;
          return;
        }

        errorRows += 1;
        await tx.agencyBillingFileBatchItem.create({
          data: {
            batch_id: inbound.id_batch,
            line_no: row.lineNo,
            attempt_id: attempt.id_attempt,
            charge_id: charge.id_charge,
            external_reference: row.externalReference,
            raw_hash: row.rawHash,
            amount_ars: row.amountArs,
            status: "ERROR",
            response_code: row.rejectionCode,
            response_message: row.rejectionReason || "Resultado inválido",
            paid_reference: row.paidReference,
            row_payload: toJsonValue(row.raw),
            processed_at: new Date(),
          },
        });
      },
      pdTxOptions(),
    );
  }

  let fiscalIssued = 0;
  let fiscalFailed = 0;

  for (const chargeId of paidChargeIds) {
    const fiscal = await issueFiscalForCharge({
      chargeId,
      actorUserId: input.actorUserId ?? null,
    });
    if (fiscal.ok) fiscalIssued += 1;
    else fiscalFailed += 1;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.agencyBillingFileBatch.update({
        where: { id_batch: inbound.id_batch },
        data: {
          status: "PROCESSED",
          storage_key: inboundStorageKey,
          sha256: inboundSha,
          total_rows: parsedRows.length,
          total_paid_rows: paidRows,
          total_rejected_rows: rejectedRows,
          total_error_rows: errorRows,
        },
      });

      await tx.agencyBillingFileBatch.update({
        where: { id_batch: outbound.id_batch },
        data: {
          status: paidRows > 0 ? "RECONCILED" : outbound.status,
        },
      });
    },
    pdTxOptions(),
  );

  await logBatchEventForAgencies({
    agencyIds: Array.from(touchedAgencyIds),
    eventType: "PD_BATCH_INBOUND_IMPORTED",
    payload: {
      outbound_batch_id: outbound.id_batch,
      inbound_batch_id: inbound.id_batch,
      matched_rows: matchedRows,
      paid_rows: paidRows,
      rejected_rows: rejectedRows,
      error_rows: errorRows,
      fiscal_issued: fiscalIssued,
      fiscal_failed: fiscalFailed,
    },
    createdBy: input.actorUserId ?? null,
  });

  return {
    inbound_batch_id: inbound.id_batch,
    summary: {
      matched_rows: matchedRows,
      error_rows: errorRows,
      rejected: rejectedRows,
      paid: paidRows,
      fiscal_issued: fiscalIssued,
      fiscal_failed: fiscalFailed,
    },
  };
}
