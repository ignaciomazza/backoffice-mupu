-- Add AFIP voucher identifiers to Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "pto_vta" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cbte_tipo" INTEGER NOT NULL DEFAULT 0;

-- Backfill from payloadAfip if available
UPDATE "Invoice"
SET
  pto_vta = COALESCE(("payloadAfip"->'voucherData'->>'PtoVta')::int, pto_vta),
  cbte_tipo = COALESCE(("payloadAfip"->'voucherData'->>'CbteTipo')::int, cbte_tipo)
WHERE "payloadAfip" IS NOT NULL;

-- Drop legacy unique index on invoice_number
DROP INDEX IF EXISTS "Invoice_invoice_number_key";

-- New composite uniqueness per agency + AFIP voucher identifiers
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_id_agency_pto_vta_cbte_tipo_invoice_number_key"
ON "Invoice" ("id_agency", "pto_vta", "cbte_tipo", "invoice_number");
