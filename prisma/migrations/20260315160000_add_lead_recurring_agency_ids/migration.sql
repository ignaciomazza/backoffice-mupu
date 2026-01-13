-- Lead: add agency_lead_id and backfill per agency
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "agency_lead_id" INTEGER;

WITH ordered AS (
  SELECT "id_lead", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_lead") AS seq
  FROM "Lead"
  WHERE "id_agency" IS NOT NULL
)
UPDATE "Lead" l
SET "agency_lead_id" = ordered.seq
FROM ordered
WHERE l."id_lead" = ordered."id_lead" AND l."agency_lead_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "agency_lead_id_unique" ON "Lead"("id_agency", "agency_lead_id");

-- RecurringInvestment: add agency_recurring_investment_id and backfill per agency
ALTER TABLE "RecurringInvestment" ADD COLUMN IF NOT EXISTS "agency_recurring_investment_id" INTEGER;

WITH ordered AS (
  SELECT "id_recurring", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_recurring") AS seq
  FROM "RecurringInvestment"
)
UPDATE "RecurringInvestment" r
SET "agency_recurring_investment_id" = ordered.seq
FROM ordered
WHERE r."id_recurring" = ordered."id_recurring" AND r."agency_recurring_investment_id" IS NULL;

ALTER TABLE "RecurringInvestment" ALTER COLUMN "agency_recurring_investment_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "agency_recurring_investment_id_unique" ON "RecurringInvestment"("id_agency", "agency_recurring_investment_id");

-- Seed counters
INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'lead'::"AgencyCounterKey", COALESCE(MAX("agency_lead_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "Lead"
WHERE "id_agency" IS NOT NULL
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'recurring_investment'::"AgencyCounterKey", COALESCE(MAX("agency_recurring_investment_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "RecurringInvestment"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;
