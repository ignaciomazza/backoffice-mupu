-- Billing recurrente Galicia - PR #1 base

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingFxType') THEN
    CREATE TYPE "BillingFxType" AS ENUM ('DOLAR_BSP');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingSubscriptionStatus') THEN
    CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingMethodType') THEN
    CREATE TYPE "BillingMethodType" AS ENUM ('DIRECT_DEBIT_CBU_GALICIA', 'CIG_GALICIA', 'MP_FALLBACK');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingMethodStatus') THEN
    CREATE TYPE "BillingMethodStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingMandateStatus') THEN
    CREATE TYPE "BillingMandateStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'REJECTED', 'EXPIRED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingAttemptStatus') THEN
    CREATE TYPE "BillingAttemptStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED', 'CANCELED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingReconciliationStatus') THEN
    CREATE TYPE "BillingReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'PARTIAL', 'UNMATCHED', 'ERROR');
  END IF;
END $$;

-- BillingFxRate (BSP manual diario)
CREATE TABLE IF NOT EXISTS "BillingFxRate" (
  "id_fx_rate" SERIAL NOT NULL,
  "fx_type" "BillingFxType" NOT NULL DEFAULT 'DOLAR_BSP',
  "rate_date" TIMESTAMP(3) NOT NULL,
  "ars_per_usd" DECIMAL(18,6) NOT NULL,
  "loaded_by" INTEGER,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingFxRate_pkey" PRIMARY KEY ("id_fx_rate")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BillingFxRate_fx_type_rate_date_key" ON "BillingFxRate"("fx_type", "rate_date");
CREATE INDEX IF NOT EXISTS "BillingFxRate_rate_date_idx" ON "BillingFxRate"("rate_date");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillingFxRate_loaded_by_fkey') THEN
    ALTER TABLE "BillingFxRate"
      ADD CONSTRAINT "BillingFxRate_loaded_by_fkey"
      FOREIGN KEY ("loaded_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Suscripción de cobranzas por agencia
CREATE TABLE IF NOT EXISTS "AgencyBillingSubscription" (
  "id_subscription" SERIAL NOT NULL,
  "id_agency" INTEGER NOT NULL,
  "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "anchor_day" INTEGER NOT NULL DEFAULT 8,
  "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  "direct_debit_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  "next_anchor_date" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgencyBillingSubscription_pkey" PRIMARY KEY ("id_subscription")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyBillingSubscription_id_agency_key" ON "AgencyBillingSubscription"("id_agency");
CREATE INDEX IF NOT EXISTS "AgencyBillingSubscription_status_idx" ON "AgencyBillingSubscription"("status");
CREATE INDEX IF NOT EXISTS "AgencyBillingSubscription_next_anchor_date_idx" ON "AgencyBillingSubscription"("next_anchor_date");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingSubscription_id_agency_fkey') THEN
    ALTER TABLE "AgencyBillingSubscription"
      ADD CONSTRAINT "AgencyBillingSubscription_id_agency_fkey"
      FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Métodos de pago de suscripción
CREATE TABLE IF NOT EXISTS "AgencyBillingPaymentMethod" (
  "id_payment_method" SERIAL NOT NULL,
  "subscription_id" INTEGER NOT NULL,
  "method_type" "BillingMethodType" NOT NULL,
  "status" "BillingMethodStatus" NOT NULL DEFAULT 'PENDING',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "holder_name" TEXT,
  "holder_tax_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgencyBillingPaymentMethod_pkey" PRIMARY KEY ("id_payment_method")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_method_unique" ON "AgencyBillingPaymentMethod"("subscription_id", "method_type");
CREATE INDEX IF NOT EXISTS "AgencyBillingPaymentMethod_subscription_id_is_default_idx" ON "AgencyBillingPaymentMethod"("subscription_id", "is_default");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingPaymentMethod_subscription_id_fkey') THEN
    ALTER TABLE "AgencyBillingPaymentMethod"
      ADD CONSTRAINT "AgencyBillingPaymentMethod_subscription_id_fkey"
      FOREIGN KEY ("subscription_id") REFERENCES "AgencyBillingSubscription"("id_subscription") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Mandato (CBU cifrado)
CREATE TABLE IF NOT EXISTS "AgencyBillingMandate" (
  "id_mandate" SERIAL NOT NULL,
  "payment_method_id" INTEGER NOT NULL,
  "status" "BillingMandateStatus" NOT NULL DEFAULT 'PENDING',
  "cbu_encrypted" TEXT NOT NULL,
  "cbu_last4" TEXT NOT NULL,
  "cbu_hash" TEXT NOT NULL,
  "consent_version" TEXT,
  "consent_accepted_at" TIMESTAMP(3),
  "consent_ip" TEXT,
  "bank_mandate_ref" TEXT,
  "rejection_code" TEXT,
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgencyBillingMandate_pkey" PRIMARY KEY ("id_mandate")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyBillingMandate_payment_method_id_key" ON "AgencyBillingMandate"("payment_method_id");
CREATE INDEX IF NOT EXISTS "AgencyBillingMandate_status_idx" ON "AgencyBillingMandate"("status");
CREATE INDEX IF NOT EXISTS "AgencyBillingMandate_cbu_hash_idx" ON "AgencyBillingMandate"("cbu_hash");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingMandate_payment_method_id_fkey') THEN
    ALTER TABLE "AgencyBillingMandate"
      ADD CONSTRAINT "AgencyBillingMandate_payment_method_id_fkey"
      FOREIGN KEY ("payment_method_id") REFERENCES "AgencyBillingPaymentMethod"("id_payment_method") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Auditoría del módulo
CREATE TABLE IF NOT EXISTS "AgencyBillingEvent" (
  "id_event" SERIAL NOT NULL,
  "id_agency" INTEGER NOT NULL,
  "subscription_id" INTEGER,
  "event_type" TEXT NOT NULL,
  "payload" JSONB,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgencyBillingEvent_pkey" PRIMARY KEY ("id_event")
);

CREATE INDEX IF NOT EXISTS "AgencyBillingEvent_id_agency_created_at_idx" ON "AgencyBillingEvent"("id_agency", "created_at");
CREATE INDEX IF NOT EXISTS "AgencyBillingEvent_event_type_created_at_idx" ON "AgencyBillingEvent"("event_type", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingEvent_id_agency_fkey') THEN
    ALTER TABLE "AgencyBillingEvent"
      ADD CONSTRAINT "AgencyBillingEvent_id_agency_fkey"
      FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingEvent_subscription_id_fkey') THEN
    ALTER TABLE "AgencyBillingEvent"
      ADD CONSTRAINT "AgencyBillingEvent_subscription_id_fkey"
      FOREIGN KEY ("subscription_id") REFERENCES "AgencyBillingSubscription"("id_subscription") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingEvent_created_by_fkey') THEN
    ALTER TABLE "AgencyBillingEvent"
      ADD CONSTRAINT "AgencyBillingEvent_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Estructura para reintentos (placeholder PR #1)
CREATE TABLE IF NOT EXISTS "AgencyBillingAttempt" (
  "id_attempt" SERIAL NOT NULL,
  "charge_id" INTEGER NOT NULL,
  "payment_method_id" INTEGER,
  "attempt_no" INTEGER NOT NULL DEFAULT 1,
  "status" "BillingAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "scheduled_for" TIMESTAMP(3),
  "processed_at" TIMESTAMP(3),
  "rejection_code" TEXT,
  "rejection_reason" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgencyBillingAttempt_pkey" PRIMARY KEY ("id_attempt")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_attempt_unique" ON "AgencyBillingAttempt"("charge_id", "attempt_no");
CREATE INDEX IF NOT EXISTS "AgencyBillingAttempt_payment_method_id_status_idx" ON "AgencyBillingAttempt"("payment_method_id", "status");
CREATE INDEX IF NOT EXISTS "AgencyBillingAttempt_scheduled_for_idx" ON "AgencyBillingAttempt"("scheduled_for");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingAttempt_charge_id_fkey') THEN
    ALTER TABLE "AgencyBillingAttempt"
      ADD CONSTRAINT "AgencyBillingAttempt_charge_id_fkey"
      FOREIGN KEY ("charge_id") REFERENCES "AgencyBillingCharge"("id_charge") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingAttempt_payment_method_id_fkey') THEN
    ALTER TABLE "AgencyBillingAttempt"
      ADD CONSTRAINT "AgencyBillingAttempt_payment_method_id_fkey"
      FOREIGN KEY ("payment_method_id") REFERENCES "AgencyBillingPaymentMethod"("id_payment_method") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Extensión de AgencyBillingCharge
ALTER TABLE "AgencyBillingCharge"
  ADD COLUMN IF NOT EXISTS "subscription_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "selected_method_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "amount_ars_due" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "amount_ars_paid" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "reconciliation_status" "BillingReconciliationStatus",
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

CREATE INDEX IF NOT EXISTS "AgencyBillingCharge_subscription_id_idx" ON "AgencyBillingCharge"("subscription_id");
CREATE INDEX IF NOT EXISTS "AgencyBillingCharge_selected_method_id_idx" ON "AgencyBillingCharge"("selected_method_id");
CREATE INDEX IF NOT EXISTS "AgencyBillingCharge_reconciliation_status_idx" ON "AgencyBillingCharge"("reconciliation_status");
CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_charge_idempotency_unique" ON "AgencyBillingCharge"("id_agency", "idempotency_key");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingCharge_subscription_id_fkey') THEN
    ALTER TABLE "AgencyBillingCharge"
      ADD CONSTRAINT "AgencyBillingCharge_subscription_id_fkey"
      FOREIGN KEY ("subscription_id") REFERENCES "AgencyBillingSubscription"("id_subscription") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingCharge_selected_method_id_fkey') THEN
    ALTER TABLE "AgencyBillingCharge"
      ADD CONSTRAINT "AgencyBillingCharge_selected_method_id_fkey"
      FOREIGN KEY ("selected_method_id") REFERENCES "AgencyBillingPaymentMethod"("id_payment_method") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
