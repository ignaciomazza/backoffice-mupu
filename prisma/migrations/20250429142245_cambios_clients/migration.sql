-- This is an empty migration.

ALTER TABLE "Client"
  ADD COLUMN "id_user" integer DEFAULT 10;

UPDATE "Client" SET "id_user" = 10 WHERE "id_user" IS NULL;

ALTER TABLE "Client" ALTER COLUMN "id_user" DROP DEFAULT;
ALTER TABLE "Client" ALTER COLUMN "id_user" SET NOT NULL;

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_id_user_fkey"
  FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE CASCADE;
