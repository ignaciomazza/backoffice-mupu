DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ExpenseCategoryScope'
  ) THEN
    CREATE TYPE "ExpenseCategoryScope" AS ENUM ('INVESTMENT', 'OTHER_INCOME');
  END IF;
END $$;

ALTER TABLE "ExpenseCategory"
ADD COLUMN IF NOT EXISTS "scope" "ExpenseCategoryScope";

UPDATE "ExpenseCategory"
SET "scope" = 'INVESTMENT'
WHERE "scope" IS NULL;

ALTER TABLE "ExpenseCategory"
ALTER COLUMN "scope" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "ExpenseCategory_id_agency_scope_enabled_idx"
ON "ExpenseCategory"("id_agency", "scope", "enabled");
