-- Billing recurrente Galicia - PR #2 (ciclos ancla + corrida manual)

-- Ciclos de facturación congelados por período
CREATE TABLE IF NOT EXISTS "AgencyBillingCycle" (
  "id_cycle" SERIAL NOT NULL,
  "id_agency" INTEGER NOT NULL,
  "subscription_id" INTEGER NOT NULL,
  "anchor_date" TIMESTAMP(3) NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'FROZEN',
  "fx_type" "BillingFxType" NOT NULL DEFAULT 'DOLAR_BSP',
  "fx_rate_date" TIMESTAMP(3),
  "fx_rate_ars_per_usd" DECIMAL(18,6),
  "base_amount_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "addons_total_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "discount_amount_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "net_amount_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "vat_rate" DECIMAL(8,6) NOT NULL DEFAULT 0.21,
  "vat_amount_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "total_ars" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "plan_snapshot" JSONB,
  "addons_snapshot" JSONB,
  "frozen_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgencyBillingCycle_pkey" PRIMARY KEY ("id_cycle")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_cycle_unique" ON "AgencyBillingCycle"("subscription_id", "anchor_date");
CREATE INDEX IF NOT EXISTS "AgencyBillingCycle_id_agency_anchor_date_idx" ON "AgencyBillingCycle"("id_agency", "anchor_date");
CREATE INDEX IF NOT EXISTS "AgencyBillingCycle_status_anchor_date_idx" ON "AgencyBillingCycle"("status", "anchor_date");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingCycle_id_agency_fkey') THEN
    ALTER TABLE "AgencyBillingCycle"
      ADD CONSTRAINT "AgencyBillingCycle_id_agency_fkey"
      FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingCycle_subscription_id_fkey') THEN
    ALTER TABLE "AgencyBillingCycle"
      ADD CONSTRAINT "AgencyBillingCycle_subscription_id_fkey"
      FOREIGN KEY ("subscription_id") REFERENCES "AgencyBillingSubscription"("id_subscription") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Extensión de Charge para enlazar el ciclo congelado
ALTER TABLE "AgencyBillingCharge"
  ADD COLUMN IF NOT EXISTS "cycle_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_charge_cycle_unique" ON "AgencyBillingCharge"("cycle_id");
CREATE INDEX IF NOT EXISTS "AgencyBillingCharge_cycle_id_idx" ON "AgencyBillingCharge"("cycle_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBillingCharge_cycle_id_fkey') THEN
    ALTER TABLE "AgencyBillingCharge"
      ADD CONSTRAINT "AgencyBillingCharge_cycle_id_fkey"
      FOREIGN KEY ("cycle_id") REFERENCES "AgencyBillingCycle"("id_cycle") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Attempts: canal explícito + índice operativo de cola
ALTER TABLE "AgencyBillingAttempt"
  ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'OFFICE_BANKING';

CREATE INDEX IF NOT EXISTS "AgencyBillingAttempt_status_scheduled_for_idx" ON "AgencyBillingAttempt"("status", "scheduled_for");
