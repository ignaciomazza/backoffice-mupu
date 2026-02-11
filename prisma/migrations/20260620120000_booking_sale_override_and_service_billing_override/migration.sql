-- Booking: override local para venta total por reserva
ALTER TABLE "Booking"
ADD COLUMN IF NOT EXISTS "use_booking_sale_total_override" BOOLEAN;

-- Service: persistencia de desglose personalizado (BillingBreakdown editable)
ALTER TABLE "Service"
ADD COLUMN IF NOT EXISTS "billing_override" JSONB;
