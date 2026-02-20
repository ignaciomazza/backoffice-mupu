-- Billing recurrente Galicia - PR #6
-- Dunning + fallback cobranzas (CIG/QR + MP stub) con charge único e idempotente

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingCollectionChannel') THEN
    CREATE TYPE "BillingCollectionChannel" AS ENUM ('PD_GALICIA', 'CIG_QR', 'MP', 'OTHER');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingFallbackProvider') THEN
    CREATE TYPE "BillingFallbackProvider" AS ENUM ('CIG_QR', 'MP', 'OTHER');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingFallbackIntentStatus') THEN
    CREATE TYPE "BillingFallbackIntentStatus" AS ENUM (
      'CREATED',
      'PENDING',
      'PRESENTED',
      'PAID',
      'EXPIRED',
      'CANCELED',
      'FAILED'
    );
  END IF;
END $$;

ALTER TABLE "AgencyBillingCharge"
  ADD COLUMN IF NOT EXISTS "dunning_stage" INTEGER,
  ADD COLUMN IF NOT EXISTS "last_dunning_action_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fallback_offered_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fallback_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "collection_channel" "BillingCollectionChannel",
  ADD COLUMN IF NOT EXISTS "paid_via_channel" "BillingCollectionChannel",
  ADD COLUMN IF NOT EXISTS "overdue_since" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "collections_escalated_at" TIMESTAMP(3);

UPDATE "AgencyBillingCharge"
SET "dunning_stage" = COALESCE("dunning_stage", 0)
WHERE "dunning_stage" IS NULL;

ALTER TABLE "AgencyBillingCharge"
  ALTER COLUMN "dunning_stage" SET DEFAULT 0;
ALTER TABLE "AgencyBillingCharge"
  ALTER COLUMN "dunning_stage" SET NOT NULL;
ALTER TABLE "AgencyBillingCharge"
  ALTER COLUMN "collection_channel" SET DEFAULT 'PD_GALICIA';

UPDATE "AgencyBillingCharge"
SET "collection_channel" = COALESCE("collection_channel", 'PD_GALICIA'::"BillingCollectionChannel")
WHERE "collection_channel" IS NULL;

CREATE INDEX IF NOT EXISTS "AgencyBillingCharge_dunning_stage_idx"
  ON "AgencyBillingCharge"("dunning_stage");
CREATE INDEX IF NOT EXISTS "AgencyBillingCharge_paid_via_channel_idx"
  ON "AgencyBillingCharge"("paid_via_channel");

CREATE TABLE IF NOT EXISTS "AgencyBillingFallbackIntent" (
  "id_fallback_intent" SERIAL PRIMARY KEY,
  "agency_id" INTEGER NOT NULL,
  "charge_id" INTEGER NOT NULL,
  "provider" "BillingFallbackProvider" NOT NULL,
  "status" "BillingFallbackIntentStatus" NOT NULL DEFAULT 'CREATED',
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "external_reference" TEXT NOT NULL,
  "provider_payment_id" TEXT,
  "provider_status" TEXT,
  "provider_status_detail" TEXT,
  "payment_url" TEXT,
  "qr_payload" TEXT,
  "qr_image_url" TEXT,
  "expires_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "failure_code" TEXT,
  "failure_message" TEXT,
  "provider_raw_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingFallbackIntent_agency_id_fkey'
  ) THEN
    ALTER TABLE "AgencyBillingFallbackIntent"
      ADD CONSTRAINT "AgencyBillingFallbackIntent_agency_id_fkey"
      FOREIGN KEY ("agency_id")
      REFERENCES "Agency"("id_agency")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingFallbackIntent_charge_id_fkey'
  ) THEN
    ALTER TABLE "AgencyBillingFallbackIntent"
      ADD CONSTRAINT "AgencyBillingFallbackIntent_charge_id_fkey"
      FOREIGN KEY ("charge_id")
      REFERENCES "AgencyBillingCharge"("id_charge")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingFallbackIntent_external_reference_key'
  ) THEN
    ALTER TABLE "AgencyBillingFallbackIntent"
      ADD CONSTRAINT "AgencyBillingFallbackIntent_external_reference_key" UNIQUE ("external_reference");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AgencyBillingFallbackIntent_charge_id_provider_status_idx"
  ON "AgencyBillingFallbackIntent"("charge_id", "provider", "status");
CREATE INDEX IF NOT EXISTS "AgencyBillingFallbackIntent_provider_status_idx"
  ON "AgencyBillingFallbackIntent"("provider", "status");
