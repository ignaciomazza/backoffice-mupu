DO $$
DECLARE
  has_scope boolean;
  old_unique_name text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ExpenseCategory'
      AND column_name = 'scope'
  ) INTO has_scope;

  IF NOT has_scope THEN
    RETURN;
  END IF;

  SELECT conname
  INTO old_unique_name
  FROM pg_constraint
  WHERE conrelid = '"ExpenseCategory"'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) IN (
      'UNIQUE (id_agency, name)',
      'UNIQUE ("id_agency", "name")'
    )
  LIMIT 1;

  IF old_unique_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE "ExpenseCategory" DROP CONSTRAINT %I',
      old_unique_name
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"ExpenseCategory"'::regclass
      AND conname = 'ExpenseCategory_id_agency_scope_name_key'
  ) THEN
    ALTER TABLE "ExpenseCategory"
    ADD CONSTRAINT "ExpenseCategory_id_agency_scope_name_key"
    UNIQUE ("id_agency", "scope", "name");
  END IF;
END $$;
