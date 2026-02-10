-- Extend ClientPayment for payment plan lifecycle
ALTER TABLE "ClientPayment"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paid_by" INTEGER,
  ADD COLUMN IF NOT EXISTS "status_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "receipt_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "service_id" INTEGER;

-- Add missing foreign keys on ClientPayment
ALTER TABLE "ClientPayment"
  ADD CONSTRAINT "ClientPayment_paid_by_fkey"
  FOREIGN KEY ("paid_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientPayment"
  ADD CONSTRAINT "ClientPayment_receipt_id_fkey"
  FOREIGN KEY ("receipt_id") REFERENCES "Receipt"("id_receipt") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientPayment"
  ADD CONSTRAINT "ClientPayment_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "Service"("id_service") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add indexes required by listing/filtering flows
CREATE INDEX IF NOT EXISTS "ClientPayment_due_date_idx" ON "ClientPayment"("due_date");
CREATE INDEX IF NOT EXISTS "ClientPayment_status_idx" ON "ClientPayment"("status");
CREATE INDEX IF NOT EXISTS "ClientPayment_receipt_id_idx" ON "ClientPayment"("receipt_id");
CREATE INDEX IF NOT EXISTS "ClientPayment_service_id_idx" ON "ClientPayment"("service_id");
CREATE INDEX IF NOT EXISTS "ClientPayment_booking_id_status_idx" ON "ClientPayment"("booking_id", "status");

-- Audit table for installment changes
CREATE TABLE "ClientPaymentAudit" (
  "id_audit" SERIAL NOT NULL,
  "client_payment_id" INTEGER NOT NULL,
  "id_agency" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT,
  "reason" TEXT,
  "changed_by" INTEGER,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "data" JSONB,

  CONSTRAINT "ClientPaymentAudit_pkey" PRIMARY KEY ("id_audit")
);

ALTER TABLE "ClientPaymentAudit"
  ADD CONSTRAINT "ClientPaymentAudit_client_payment_id_fkey"
  FOREIGN KEY ("client_payment_id") REFERENCES "ClientPayment"("id_payment") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientPaymentAudit"
  ADD CONSTRAINT "ClientPaymentAudit_id_agency_fkey"
  FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientPaymentAudit"
  ADD CONSTRAINT "ClientPaymentAudit_changed_by_fkey"
  FOREIGN KEY ("changed_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ClientPaymentAudit_client_payment_id_changed_at_idx"
  ON "ClientPaymentAudit"("client_payment_id", "changed_at");
CREATE INDEX IF NOT EXISTS "ClientPaymentAudit_id_agency_changed_at_idx"
  ON "ClientPaymentAudit"("id_agency", "changed_at");
CREATE INDEX IF NOT EXISTS "ClientPaymentAudit_changed_by_idx"
  ON "ClientPaymentAudit"("changed_by");

-- Migration backfill: installments in canceled bookings become canceled
INSERT INTO "ClientPaymentAudit" (
  "client_payment_id",
  "id_agency",
  "action",
  "from_status",
  "to_status",
  "reason",
  "changed_by",
  "changed_at",
  "data"
)
SELECT
  cp."id_payment",
  cp."id_agency",
  'AUTO_CANCEL_BOOKING',
  'PENDIENTE',
  'CANCELADA',
  'Reserva cancelada (migración)',
  NULL,
  CURRENT_TIMESTAMP,
  jsonb_build_object('source', 'migration')
FROM "ClientPayment" cp
INNER JOIN "Booking" b ON b."id_booking" = cp."booking_id"
WHERE cp."status" = 'PENDIENTE'
  AND lower(COALESCE(b."status", '')) = 'cancelada';

UPDATE "ClientPayment" cp
SET
  "status" = 'CANCELADA',
  "status_reason" = COALESCE(cp."status_reason", 'Reserva cancelada (migración)')
FROM "Booking" b
WHERE b."id_booking" = cp."booking_id"
  AND cp."status" = 'PENDIENTE'
  AND lower(COALESCE(b."status", '')) = 'cancelada';
