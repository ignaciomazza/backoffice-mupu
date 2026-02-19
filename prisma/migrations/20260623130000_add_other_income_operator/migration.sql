ALTER TABLE "OtherIncome"
ADD COLUMN IF NOT EXISTS "operator_id" INTEGER;

CREATE INDEX IF NOT EXISTS "OtherIncome_operator_id_idx"
ON "OtherIncome"("operator_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OtherIncome_operator_id_fkey'
  ) THEN
    ALTER TABLE "OtherIncome"
    ADD CONSTRAINT "OtherIncome_operator_id_fkey"
    FOREIGN KEY ("operator_id")
    REFERENCES "Operator"("id_operator")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
