-- Add booking-level sale totals and config toggle
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sale_totals" JSONB;
ALTER TABLE "ServiceCalcConfig" ADD COLUMN IF NOT EXISTS "use_booking_sale_total" BOOLEAN NOT NULL DEFAULT false;
