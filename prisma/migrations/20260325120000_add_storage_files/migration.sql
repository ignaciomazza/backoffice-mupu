-- Add AgencyCounterKey value
ALTER TYPE "AgencyCounterKey" ADD VALUE IF NOT EXISTS 'file';

-- CreateTable
CREATE TABLE "AgencyStorageConfig" (
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

-- CreateTable
CREATE TABLE "AgencyStorageUsage" (
    "id_usage" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "storage_bytes" BIGINT NOT NULL DEFAULT 0,
    "transfer_bytes" BIGINT NOT NULL DEFAULT 0,
    "transfer_month" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyStorageUsage_pkey" PRIMARY KEY ("id_usage")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id_file" SERIAL NOT NULL,
    "agency_file_id" INTEGER NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "booking_id" INTEGER,
    "client_id" INTEGER,
    "service_id" INTEGER,
    "original_name" TEXT NOT NULL,
    "display_name" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "downloaded_at" TIMESTAMP(3),
    "download_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id_file")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgencyStorageConfig_id_agency_key" ON "AgencyStorageConfig"("id_agency");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyStorageUsage_id_agency_key" ON "AgencyStorageUsage"("id_agency");

-- CreateIndex
CREATE INDEX "AgencyStorageUsage_id_agency_idx" ON "AgencyStorageUsage"("id_agency");

-- CreateIndex
CREATE INDEX "FileAsset_id_agency_idx" ON "FileAsset"("id_agency");

-- CreateIndex
CREATE INDEX "FileAsset_booking_id_idx" ON "FileAsset"("booking_id");

-- CreateIndex
CREATE INDEX "FileAsset_client_id_idx" ON "FileAsset"("client_id");

-- CreateIndex
CREATE INDEX "FileAsset_service_id_idx" ON "FileAsset"("service_id");

-- CreateIndex
CREATE INDEX "FileAsset_status_idx" ON "FileAsset"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agency_file_id_unique" ON "FileAsset"("id_agency", "agency_file_id");

-- AddForeignKey
ALTER TABLE "AgencyStorageConfig" ADD CONSTRAINT "AgencyStorageConfig_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyStorageUsage" ADD CONSTRAINT "AgencyStorageUsage_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id_booking") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id_client") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service"("id_service") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;
