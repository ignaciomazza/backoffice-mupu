-- Ensure user counters exist per agency
INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT
  id_agency,
  'user'::"AgencyCounterKey",
  COALESCE(MAX("agency_user_id"), 0) + 1,
  CURRENT_TIMESTAMP
FROM "User"
GROUP BY id_agency
ON CONFLICT ("id_agency", "key") DO UPDATE
SET
  "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
  "updated_at" = CURRENT_TIMESTAMP;
