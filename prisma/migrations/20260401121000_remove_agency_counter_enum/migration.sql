-- Convert enum column to text and drop enum type
ALTER TABLE "AgencyCounter"
  ALTER COLUMN "key" TYPE TEXT USING "key"::text;

DROP TYPE IF EXISTS "AgencyCounterKey";
