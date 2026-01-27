-- Ensure tables exist for shadow DB ordering issues
CREATE TABLE IF NOT EXISTS "AgencyStorageConfig" (
    "id_config" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT NOT NULL DEFAULT 'agency',
    "storage_pack_count" INTEGER NOT NULL DEFAULT 1,
    "transfer_pack_count" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyStorageConfig_pkey" PRIMARY KEY ("id_config")
);

CREATE TABLE IF NOT EXISTS "AgencyStorageUsage" (
    "id_usage" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "storage_bytes" BIGINT NOT NULL DEFAULT 0,
    "transfer_bytes" BIGINT NOT NULL DEFAULT 0,
    "transfer_month" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyStorageUsage_pkey" PRIMARY KEY ("id_usage")
);

-- AlterTable
ALTER TABLE IF EXISTS "AgencyStorageConfig" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "AgencyStorageUsage" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgencyStorageConfig_id_agency_idx" ON "AgencyStorageConfig"("id_agency");

-- RenameIndex
ALTER INDEX IF EXISTS "agency_file_id_unique" RENAME TO "FileAsset_id_agency_agency_file_id_key";
