-- 1) Renombrar status → client_status
ALTER TABLE "Booking" RENAME COLUMN "status" TO "client_status";

-- 2) Crear operator_status con default 'pendiente'
ALTER TABLE "Booking" ADD COLUMN "operator_status" VARCHAR NOT NULL DEFAULT 'pendiente';
