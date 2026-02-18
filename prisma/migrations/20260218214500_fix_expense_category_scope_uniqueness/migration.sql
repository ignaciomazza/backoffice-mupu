DO $$
DECLARE
  has_scope boolean;
  rec record;
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

  -- Drop any UNIQUE constraint that is exactly (id_agency, name)
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    JOIN LATERAL (
      SELECT array_agg(a.attname ORDER BY k.ord) AS cols
      FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a
        ON a.attrelid = t.oid
       AND a.attnum = k.attnum
    ) colset ON true
    WHERE n.nspname = 'public'
      AND t.relname = 'ExpenseCategory'
      AND c.contype = 'u'
      AND colset.cols::text[] = ARRAY['id_agency', 'name']::text[]
  LOOP
    EXECUTE format(
      'ALTER TABLE "ExpenseCategory" DROP CONSTRAINT %I',
      rec.conname
    );
  END LOOP;

  -- Drop any standalone UNIQUE index that is exactly (id_agency, name)
  FOR rec IN
    SELECT idx.relname AS index_name
    FROM pg_index i
    JOIN pg_class t
      ON t.oid = i.indrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    JOIN pg_class idx
      ON idx.oid = i.indexrelid
    LEFT JOIN pg_constraint c
      ON c.conindid = i.indexrelid
    JOIN LATERAL (
      SELECT array_agg(a.attname ORDER BY k.ord) AS cols
      FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a
        ON a.attrelid = t.oid
       AND a.attnum = k.attnum
    ) colset ON true
    WHERE n.nspname = 'public'
      AND t.relname = 'ExpenseCategory'
      AND i.indisunique = true
      AND i.indisprimary = false
      AND c.oid IS NULL
      AND colset.cols::text[] = ARRAY['id_agency', 'name']::text[]
  LOOP
    EXECUTE format(
      'DROP INDEX IF EXISTS %I',
      rec.index_name
    );
  END LOOP;

  -- Ensure final unique constraint by scope exists
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    JOIN LATERAL (
      SELECT array_agg(a.attname ORDER BY k.ord) AS cols
      FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a
        ON a.attrelid = t.oid
       AND a.attnum = k.attnum
    ) colset ON true
    WHERE n.nspname = 'public'
      AND t.relname = 'ExpenseCategory'
      AND c.contype = 'u'
      AND colset.cols::text[] = ARRAY['id_agency', 'scope', 'name']::text[]
  ) THEN
    ALTER TABLE "ExpenseCategory"
    ADD CONSTRAINT "ExpenseCategory_id_agency_scope_name_key"
    UNIQUE ("id_agency", "scope", "name");
  END IF;
END $$;
