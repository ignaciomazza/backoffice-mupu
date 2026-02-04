-- Add excess action fields to Investment
ALTER TABLE "Investment" ADD COLUMN IF NOT EXISTS "excess_action" TEXT;
ALTER TABLE "Investment" ADD COLUMN IF NOT EXISTS "excess_missing_account_action" TEXT;

-- Create InvestmentServiceAllocation table
CREATE TABLE IF NOT EXISTS "InvestmentServiceAllocation" (
    "id_allocation" SERIAL NOT NULL,
    "investment_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "booking_id" INTEGER,
    "payment_currency" TEXT NOT NULL,
    "service_currency" TEXT NOT NULL,
    "amount_payment" DECIMAL(18,2) NOT NULL,
    "amount_service" DECIMAL(18,2) NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentServiceAllocation_pkey" PRIMARY KEY ("id_allocation")
);

-- Indexes + unique
CREATE UNIQUE INDEX IF NOT EXISTS "InvestmentServiceAllocation_investment_id_service_id_key"
ON "InvestmentServiceAllocation"("investment_id", "service_id");

CREATE INDEX IF NOT EXISTS "InvestmentServiceAllocation_investment_id_idx"
ON "InvestmentServiceAllocation"("investment_id");

CREATE INDEX IF NOT EXISTS "InvestmentServiceAllocation_service_id_idx"
ON "InvestmentServiceAllocation"("service_id");

CREATE INDEX IF NOT EXISTS "InvestmentServiceAllocation_booking_id_idx"
ON "InvestmentServiceAllocation"("booking_id");

-- FKs
ALTER TABLE "InvestmentServiceAllocation"
  ADD CONSTRAINT "InvestmentServiceAllocation_investment_id_fkey"
  FOREIGN KEY ("investment_id") REFERENCES "Investment"("id_investment") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestmentServiceAllocation"
  ADD CONSTRAINT "InvestmentServiceAllocation_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "Service"("id_service") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestmentServiceAllocation"
  ADD CONSTRAINT "InvestmentServiceAllocation_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "Booking"("id_booking") ON DELETE SET NULL ON UPDATE CASCADE;
