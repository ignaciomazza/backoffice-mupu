ALTER TABLE "ServiceType"
ADD COLUMN IF NOT EXISTS "allow_no_destination" BOOLEAN NOT NULL DEFAULT false;
