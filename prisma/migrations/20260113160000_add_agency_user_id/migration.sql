-- Add agency_user_id and backfill per agency
ALTER TABLE "User" ADD COLUMN "agency_user_id" INTEGER;

WITH ordered AS (
  SELECT
    id_user,
    id_agency,
    ROW_NUMBER() OVER (PARTITION BY id_agency ORDER BY id_user) AS seq
  FROM "User"
)
UPDATE "User" u
SET "agency_user_id" = ordered.seq
FROM ordered
WHERE u.id_user = ordered.id_user;

ALTER TABLE "User" ALTER COLUMN "agency_user_id" SET NOT NULL;

CREATE UNIQUE INDEX "agency_user_id_unique" ON "User"("id_agency", "agency_user_id");

DO $$
BEGIN
  IF to_regclass('public.\"AgencyCounter\"') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AgencyCounterKey') THEN
    EXECUTE $sql$
      INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "created_at", "updated_at")
      SELECT
        id_agency,
        'user'::"AgencyCounterKey",
        COALESCE(MAX("agency_user_id"), 0) + 1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM "User"
      GROUP BY id_agency
      ON CONFLICT ("id_agency", "key") DO UPDATE
      SET
        "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
        "updated_at" = CURRENT_TIMESTAMP
    $sql$;
  END IF;
END $$;
