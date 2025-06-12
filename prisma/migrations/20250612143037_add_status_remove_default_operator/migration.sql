-- 1) Quitar default de operator_status
ALTER TABLE "Booking" 
  ALTER COLUMN "operator_status" DROP DEFAULT;

-- 2) Agregar columna status nueva con default 'bloqueada'
ALTER TABLE "Booking" 
  ADD COLUMN "status" VARCHAR NOT NULL DEFAULT 'bloqueada';