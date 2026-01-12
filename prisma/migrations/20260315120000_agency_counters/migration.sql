-- CreateEnum
CREATE TYPE "AgencyCounterKey" AS ENUM ('booking', 'client', 'service', 'receipt', 'client_payment', 'investment', 'operator_due');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "agency_client_id" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "agency_booking_id" INTEGER;
ALTER TABLE "Service" ADD COLUMN "agency_service_id" INTEGER;
ALTER TABLE "Service" ADD COLUMN "id_agency" INTEGER;
ALTER TABLE "Receipt" ADD COLUMN "agency_receipt_id" INTEGER;
ALTER TABLE "Investment" ADD COLUMN "agency_investment_id" INTEGER;
ALTER TABLE "OperatorDue" ADD COLUMN "agency_operator_due_id" INTEGER;
ALTER TABLE "OperatorDue" ADD COLUMN "id_agency" INTEGER;
ALTER TABLE "ClientPayment" ADD COLUMN "agency_client_payment_id" INTEGER;
ALTER TABLE "ClientPayment" ADD COLUMN "id_agency" INTEGER;

-- CreateTable
CREATE TABLE "AgencyCounter" (
    "id_counter" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "key" "AgencyCounterKey" NOT NULL,
    "next_value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyCounter_pkey" PRIMARY KEY ("id_counter")
);

-- Backfill id_agency in new columns
UPDATE "Service" s
SET "id_agency" = b."id_agency"
FROM "Booking" b
WHERE s."booking_id" = b."id_booking" AND s."id_agency" IS NULL;

UPDATE "OperatorDue" d
SET "id_agency" = b."id_agency"
FROM "Booking" b
WHERE d."booking_id" = b."id_booking" AND d."id_agency" IS NULL;

UPDATE "ClientPayment" cp
SET "id_agency" = b."id_agency"
FROM "Booking" b
WHERE cp."booking_id" = b."id_booking" AND cp."id_agency" IS NULL;

UPDATE "Receipt" r
SET "id_agency" = b."id_agency"
FROM "Booking" b
WHERE r."id_agency" IS NULL AND r."bookingId_booking" = b."id_booking";

-- Set NOT NULL for required agency references
ALTER TABLE "Service" ALTER COLUMN "id_agency" SET NOT NULL;
ALTER TABLE "OperatorDue" ALTER COLUMN "id_agency" SET NOT NULL;
ALTER TABLE "ClientPayment" ALTER COLUMN "id_agency" SET NOT NULL;

-- Backfill agency-scoped IDs
WITH ordered AS (
    SELECT "id_booking", ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "creation_date", "id_booking") AS seq
    FROM "Booking"
)
UPDATE "Booking" b
SET "agency_booking_id" = ordered.seq
FROM ordered
WHERE b."id_booking" = ordered."id_booking";

WITH ordered AS (
    SELECT "id_client", ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "registration_date", "id_client") AS seq
    FROM "Client"
)
UPDATE "Client" c
SET "agency_client_id" = ordered.seq
FROM ordered
WHERE c."id_client" = ordered."id_client";

WITH ordered AS (
    SELECT "id_service", ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_service") AS seq
    FROM "Service"
)
UPDATE "Service" s
SET "agency_service_id" = ordered.seq
FROM ordered
WHERE s."id_service" = ordered."id_service";

WITH ordered AS (
    SELECT "id_receipt", ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "issue_date", "id_receipt") AS seq
    FROM "Receipt"
    WHERE "id_agency" IS NOT NULL
)
UPDATE "Receipt" r
SET "agency_receipt_id" = ordered.seq
FROM ordered
WHERE r."id_receipt" = ordered."id_receipt";

WITH ordered AS (
    SELECT "id_payment", ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_payment") AS seq
    FROM "ClientPayment"
)
UPDATE "ClientPayment" cp
SET "agency_client_payment_id" = ordered.seq
FROM ordered
WHERE cp."id_payment" = ordered."id_payment";

WITH ordered AS (
    SELECT "id_investment", ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_investment") AS seq
    FROM "Investment"
)
UPDATE "Investment" i
SET "agency_investment_id" = ordered.seq
FROM ordered
WHERE i."id_investment" = ordered."id_investment";

WITH ordered AS (
    SELECT "id_due", ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_due") AS seq
    FROM "OperatorDue"
)
UPDATE "OperatorDue" d
SET "agency_operator_due_id" = ordered.seq
FROM ordered
WHERE d."id_due" = ordered."id_due";

-- Seed counters from current max
INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'booking'::"AgencyCounterKey", COALESCE(MAX("agency_booking_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "Booking"
GROUP BY "id_agency";

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'client'::"AgencyCounterKey", COALESCE(MAX("agency_client_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "Client"
GROUP BY "id_agency";

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'service'::"AgencyCounterKey", COALESCE(MAX("agency_service_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "Service"
GROUP BY "id_agency";

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'receipt'::"AgencyCounterKey", COALESCE(MAX("agency_receipt_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "Receipt"
WHERE "id_agency" IS NOT NULL
GROUP BY "id_agency";

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'client_payment'::"AgencyCounterKey", COALESCE(MAX("agency_client_payment_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "ClientPayment"
GROUP BY "id_agency";

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'investment'::"AgencyCounterKey", COALESCE(MAX("agency_investment_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "Investment"
GROUP BY "id_agency";

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'operator_due'::"AgencyCounterKey", COALESCE(MAX("agency_operator_due_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "OperatorDue"
GROUP BY "id_agency";

-- CreateIndex
CREATE UNIQUE INDEX "AgencyCounter_id_agency_key_key" ON "AgencyCounter"("id_agency", "key");
CREATE INDEX "AgencyCounter_id_agency_idx" ON "AgencyCounter"("id_agency");

CREATE INDEX "Service_id_agency_idx" ON "Service"("id_agency");
CREATE INDEX "OperatorDue_id_agency_idx" ON "OperatorDue"("id_agency");
CREATE INDEX "ClientPayment_id_agency_idx" ON "ClientPayment"("id_agency");

CREATE UNIQUE INDEX "agency_client_id_unique" ON "Client"("id_agency", "agency_client_id");
CREATE UNIQUE INDEX "agency_booking_id_unique" ON "Booking"("id_agency", "agency_booking_id");
CREATE UNIQUE INDEX "agency_service_id_unique" ON "Service"("id_agency", "agency_service_id");
CREATE UNIQUE INDEX "agency_receipt_id_unique" ON "Receipt"("id_agency", "agency_receipt_id");
CREATE UNIQUE INDEX "agency_investment_id_unique" ON "Investment"("id_agency", "agency_investment_id");
CREATE UNIQUE INDEX "agency_operator_due_id_unique" ON "OperatorDue"("id_agency", "agency_operator_due_id");
CREATE UNIQUE INDEX "agency_client_payment_id_unique" ON "ClientPayment"("id_agency", "agency_client_payment_id");

-- AddForeignKey
ALTER TABLE "AgencyCounter" ADD CONSTRAINT "AgencyCounter_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Service" ADD CONSTRAINT "Service_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperatorDue" ADD CONSTRAINT "OperatorDue_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
