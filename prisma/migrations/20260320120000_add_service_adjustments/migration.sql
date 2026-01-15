-- Add extra adjustments support for service calculations
ALTER TABLE "ServiceCalcConfig" ADD COLUMN IF NOT EXISTS "billing_adjustments" JSONB;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "extra_costs_amount" DOUBLE PRECISION;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "extra_taxes_amount" DOUBLE PRECISION;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "extra_adjustments" JSONB;
