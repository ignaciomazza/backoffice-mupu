-- Billing recurrente Galicia - PR #3 (Pago Directo por lotes + fiscal on paid)

-- Extensiones de attempts / charges
ALTER TABLE "AgencyBillingAttempt"
  ADD COLUMN IF NOT EXISTS "external_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "paid_reference" TEXT;

ALTER TABLE "AgencyBillingCharge"
  ADD COLUMN IF NOT EXISTS "paid_reference" TEXT;

CREATE INDEX IF NOT EXISTS "AgencyBillingAttempt_external_reference_idx"
  ON "AgencyBillingAttempt" ("external_reference");

CREATE INDEX IF NOT EXISTS "AgencyBillingCharge_paid_reference_idx"
  ON "AgencyBillingCharge" ("paid_reference");

-- Lotes de archivos para Pago Directo
CREATE TABLE IF NOT EXISTS "AgencyBillingFileBatch" (
  "id_batch" SERIAL NOT NULL,
  "parent_batch_id" INTEGER,
  "direction" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "file_type" TEXT NOT NULL,
  "adapter" TEXT,
  "business_date" TIMESTAMP(3) NOT NULL,
  "original_file_name" TEXT,
  "storage_key" TEXT,
  "sha256" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "total_amount_ars" DECIMAL(18,2),
  "total_paid_rows" INTEGER NOT NULL DEFAULT 0,
  "total_rejected_rows" INTEGER NOT NULL DEFAULT 0,
  "total_error_rows" INTEGER NOT NULL DEFAULT 0,
  "meta" JSONB,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgencyBillingFileBatch_pkey" PRIMARY KEY ("id_batch")
);

CREATE INDEX IF NOT EXISTS "AgencyBillingFileBatch_direction_business_date_idx"
  ON "AgencyBillingFileBatch" ("direction", "business_date");
CREATE INDEX IF NOT EXISTS "AgencyBillingFileBatch_status_business_date_idx"
  ON "AgencyBillingFileBatch" ("status", "business_date");
CREATE INDEX IF NOT EXISTS "AgencyBillingFileBatch_parent_batch_id_idx"
  ON "AgencyBillingFileBatch" ("parent_batch_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_file_batch_unique_sha"
  ON "AgencyBillingFileBatch" ("direction", "sha256");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingFileBatch_parent_batch_id_fkey') THEN
    ALTER TABLE "AgencyBillingFileBatch"
      ADD CONSTRAINT "AgencyBillingFileBatch_parent_batch_id_fkey"
      FOREIGN KEY ("parent_batch_id") REFERENCES "AgencyBillingFileBatch"("id_batch")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Items de cada archivo
CREATE TABLE IF NOT EXISTS "AgencyBillingFileBatchItem" (
  "id_item" SERIAL NOT NULL,
  "batch_id" INTEGER NOT NULL,
  "attempt_id" INTEGER,
  "charge_id" INTEGER,
  "line_no" INTEGER,
  "external_reference" TEXT,
  "raw_hash" TEXT,
  "amount_ars" DECIMAL(18,2),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "response_code" TEXT,
  "response_message" TEXT,
  "paid_reference" TEXT,
  "row_payload" JSONB,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgencyBillingFileBatchItem_pkey" PRIMARY KEY ("id_item")
);

CREATE INDEX IF NOT EXISTS "AgencyBillingFileBatchItem_batch_id_line_no_idx"
  ON "AgencyBillingFileBatchItem" ("batch_id", "line_no");
CREATE INDEX IF NOT EXISTS "AgencyBillingFileBatchItem_attempt_id_idx"
  ON "AgencyBillingFileBatchItem" ("attempt_id");
CREATE INDEX IF NOT EXISTS "AgencyBillingFileBatchItem_charge_id_idx"
  ON "AgencyBillingFileBatchItem" ("charge_id");
CREATE INDEX IF NOT EXISTS "AgencyBillingFileBatchItem_external_reference_idx"
  ON "AgencyBillingFileBatchItem" ("external_reference");
CREATE INDEX IF NOT EXISTS "AgencyBillingFileBatchItem_raw_hash_idx"
  ON "AgencyBillingFileBatchItem" ("raw_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_file_batch_item_unique_attempt"
  ON "AgencyBillingFileBatchItem" ("batch_id", "attempt_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingFileBatchItem_batch_id_fkey') THEN
    ALTER TABLE "AgencyBillingFileBatchItem"
      ADD CONSTRAINT "AgencyBillingFileBatchItem_batch_id_fkey"
      FOREIGN KEY ("batch_id") REFERENCES "AgencyBillingFileBatch"("id_batch")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingFileBatchItem_attempt_id_fkey') THEN
    ALTER TABLE "AgencyBillingFileBatchItem"
      ADD CONSTRAINT "AgencyBillingFileBatchItem_attempt_id_fkey"
      FOREIGN KEY ("attempt_id") REFERENCES "AgencyBillingAttempt"("id_attempt")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingFileBatchItem_charge_id_fkey') THEN
    ALTER TABLE "AgencyBillingFileBatchItem"
      ADD CONSTRAINT "AgencyBillingFileBatchItem_charge_id_fkey"
      FOREIGN KEY ("charge_id") REFERENCES "AgencyBillingCharge"("id_charge")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Documento fiscal emitido al cobrar
CREATE TABLE IF NOT EXISTS "AgencyBillingFiscalDocument" (
  "id_fiscal_document" SERIAL NOT NULL,
  "charge_id" INTEGER NOT NULL,
  "document_type" TEXT NOT NULL DEFAULT 'INVOICE_A',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "afip_pto_vta" INTEGER,
  "afip_cbte_tipo" INTEGER,
  "afip_number" TEXT,
  "afip_cae" TEXT,
  "afip_cae_due" TIMESTAMP(3),
  "external_reference" TEXT,
  "payload" JSONB,
  "error_message" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "issued_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgencyBillingFiscalDocument_pkey" PRIMARY KEY ("id_fiscal_document")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_fiscal_unique"
  ON "AgencyBillingFiscalDocument" ("charge_id", "document_type");
CREATE INDEX IF NOT EXISTS "AgencyBillingFiscalDocument_status_created_at_idx"
  ON "AgencyBillingFiscalDocument" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "AgencyBillingFiscalDocument_issued_at_idx"
  ON "AgencyBillingFiscalDocument" ("issued_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingFiscalDocument_charge_id_fkey') THEN
    ALTER TABLE "AgencyBillingFiscalDocument"
      ADD CONSTRAINT "AgencyBillingFiscalDocument_charge_id_fkey"
      FOREIGN KEY ("charge_id") REFERENCES "AgencyBillingCharge"("id_charge")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
