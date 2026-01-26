-- AlterTable
ALTER TABLE "AgencyStorageConfig" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AgencyStorageUsage" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "AgencyStorageConfig_id_agency_idx" ON "AgencyStorageConfig"("id_agency");

-- RenameIndex
ALTER INDEX "agency_file_id_unique" RENAME TO "FileAsset_id_agency_agency_file_id_key";
