-- Billing recurrente Galicia - PR #5
-- Jobs automation scheduler + locks + observability

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingJobSource') THEN
    CREATE TYPE "BillingJobSource" AS ENUM ('CRON', 'MANUAL', 'SYSTEM');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingJobRunStatus') THEN
    CREATE TYPE "BillingJobRunStatus" AS ENUM (
      'RUNNING',
      'SUCCESS',
      'PARTIAL',
      'FAILED',
      'SKIPPED_LOCKED',
      'NO_OP'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BillingJobRun" (
  "id_job_run" SERIAL PRIMARY KEY,
  "job_name" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "source" "BillingJobSource" NOT NULL DEFAULT 'SYSTEM',
  "status" "BillingJobRunStatus" NOT NULL DEFAULT 'RUNNING',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "target_date_ar" TEXT,
  "adapter" TEXT,
  "counters_json" JSONB,
  "error_message" TEXT,
  "error_stack" TEXT,
  "metadata_json" JSONB,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'BillingJobRun_created_by_fkey'
  ) THEN
    ALTER TABLE "BillingJobRun"
      ADD CONSTRAINT "BillingJobRun_created_by_fkey"
      FOREIGN KEY ("created_by")
      REFERENCES "User"("id_user")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BillingJobLock" (
  "id_lock" SERIAL PRIMARY KEY,
  "lock_key" TEXT NOT NULL,
  "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "owner_run_id" TEXT,
  "metadata" JSONB,
  "released_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'BillingJobLock_lock_key_key'
  ) THEN
    ALTER TABLE "BillingJobLock"
      ADD CONSTRAINT "BillingJobLock_lock_key_key" UNIQUE ("lock_key");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BillingJobRun_job_name_started_at_idx"
  ON "BillingJobRun"("job_name", "started_at");
CREATE INDEX IF NOT EXISTS "BillingJobRun_source_started_at_idx"
  ON "BillingJobRun"("source", "started_at");
CREATE INDEX IF NOT EXISTS "BillingJobRun_status_started_at_idx"
  ON "BillingJobRun"("status", "started_at");
CREATE INDEX IF NOT EXISTS "BillingJobRun_run_id_idx"
  ON "BillingJobRun"("run_id");
CREATE INDEX IF NOT EXISTS "BillingJobLock_expires_at_idx"
  ON "BillingJobLock"("expires_at");
CREATE INDEX IF NOT EXISTS "BillingJobLock_released_at_idx"
  ON "BillingJobLock"("released_at");
