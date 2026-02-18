ALTER TABLE "OtherIncome"
ADD COLUMN IF NOT EXISTS "category_id" INTEGER;

CREATE INDEX IF NOT EXISTS "OtherIncome_category_id_idx"
ON "OtherIncome"("category_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OtherIncome_category_id_fkey'
  ) THEN
    ALTER TABLE "OtherIncome"
    ADD CONSTRAINT "OtherIncome_category_id_fkey"
    FOREIGN KEY ("category_id")
    REFERENCES "ExpenseCategory"("id_category")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
