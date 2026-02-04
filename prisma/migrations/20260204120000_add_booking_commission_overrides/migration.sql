-- Add booking-level commission customizations
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "commission_overrides" JSONB;
