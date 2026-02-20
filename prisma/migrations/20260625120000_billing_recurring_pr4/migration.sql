-- Billing recurrente Galicia - PR #4
-- Mandates lifecycle + adapter metadata + conciliacion processor metadata + cobranza/fiscal desacoplable

-- 1) Mandate status lifecycle extension
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingMandateStatus') THEN
    ALTER TYPE "BillingMandateStatus" ADD VALUE IF NOT EXISTS 'PENDING_BANK';
  END IF;
END $$;

-- 2) Mandate new tracing/legal fields
ALTER TABLE "AgencyBillingMandate"
  ADD COLUMN IF NOT EXISTS "holder_name" TEXT,
  ADD COLUMN IF NOT EXISTS "holder_doc" TEXT,
  ADD COLUMN IF NOT EXISTS "bank_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejected_reason_code" TEXT,
  ADD COLUMN IF NOT EXISTS "rejected_reason_text" TEXT,
  ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_status_check_at" TIMESTAMP(3);

-- Backfill aliases from legacy fields
UPDATE "AgencyBillingMandate"
SET "bank_reference" = COALESCE("bank_reference", "bank_mandate_ref")
WHERE "bank_reference" IS NULL AND "bank_mandate_ref" IS NOT NULL;

UPDATE "AgencyBillingMandate"
SET "rejected_reason_code" = COALESCE("rejected_reason_code", "rejection_code")
WHERE "rejected_reason_code" IS NULL AND "rejection_code" IS NOT NULL;

UPDATE "AgencyBillingMandate"
SET "rejected_reason_text" = COALESCE("rejected_reason_text", "rejection_reason")
WHERE "rejected_reason_text" IS NULL AND "rejection_reason" IS NOT NULL;

UPDATE "AgencyBillingMandate"
SET "activated_at" = COALESCE("activated_at", "updated_at")
WHERE "status" = 'ACTIVE' AND "activated_at" IS NULL;

UPDATE "AgencyBillingMandate"
SET "revoked_at" = COALESCE("revoked_at", "updated_at")
WHERE "status" = 'REVOKED' AND "revoked_at" IS NULL;

UPDATE "AgencyBillingMandate" m
SET
  "holder_name" = COALESCE(m."holder_name", pm."holder_name"),
  "holder_doc" = COALESCE(m."holder_doc", pm."holder_tax_id")
FROM "AgencyBillingPaymentMethod" pm
WHERE pm."id_payment_method" = m."payment_method_id"
  AND (m."holder_name" IS NULL OR m."holder_doc" IS NULL);

CREATE INDEX IF NOT EXISTS "AgencyBillingMandate_bank_reference_idx"
  ON "AgencyBillingMandate" ("bank_reference");
CREATE INDEX IF NOT EXISTS "AgencyBillingMandate_last_status_check_at_idx"
  ON "AgencyBillingMandate" ("last_status_check_at");

-- 3) Attempt processor metadata for reconciliation traceability
ALTER TABLE "AgencyBillingAttempt"
  ADD COLUMN IF NOT EXISTS "processor_result_code" TEXT,
  ADD COLUMN IF NOT EXISTS "processor_result_message" TEXT,
  ADD COLUMN IF NOT EXISTS "processor_trace_id" TEXT,
  ADD COLUMN IF NOT EXISTS "processor_settlement_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "processor_raw_payload" JSONB;

CREATE INDEX IF NOT EXISTS "AgencyBillingAttempt_processor_trace_id_idx"
  ON "AgencyBillingAttempt" ("processor_trace_id");
CREATE INDEX IF NOT EXISTS "AgencyBillingAttempt_processor_settlement_date_idx"
  ON "AgencyBillingAttempt" ("processor_settlement_date");

-- 4) Batch metadata for adapter/version/totals and idempotency checks
ALTER TABLE "AgencyBillingFileBatch"
  ADD COLUMN IF NOT EXISTS "file_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "adapter_version" TEXT,
  ADD COLUMN IF NOT EXISTS "record_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "amount_total" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "exported_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "imported_at" TIMESTAMP(3);

UPDATE "AgencyBillingFileBatch"
SET
  "file_hash" = COALESCE("file_hash", "sha256"),
  "record_count" = COALESCE("record_count", "total_rows"),
  "amount_total" = COALESCE("amount_total", "total_amount_ars")
WHERE "file_hash" IS NULL OR "record_count" IS NULL OR "amount_total" IS NULL;

-- Historic timestamps inferred from existing rows
UPDATE "AgencyBillingFileBatch"
SET "exported_at" = COALESCE("exported_at", "created_at")
WHERE "direction" = 'OUTBOUND' AND "exported_at" IS NULL;

UPDATE "AgencyBillingFileBatch"
SET "imported_at" = COALESCE("imported_at", "created_at")
WHERE "direction" = 'INBOUND' AND "imported_at" IS NULL;

CREATE INDEX IF NOT EXISTS "AgencyBillingFileBatch_file_hash_idx"
  ON "AgencyBillingFileBatch" ("direction", "file_hash");
CREATE INDEX IF NOT EXISTS "AgencyBillingFileBatch_inbound_dedupe_idx"
  ON "AgencyBillingFileBatch" ("parent_batch_id", "adapter", "record_count", "amount_total", "file_hash");
