-- CreateTable
CREATE TABLE "ServiceType" (
    "id_service_type" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceType_pkey" PRIMARY KEY ("id_service_type")
);

-- CreateTable
CREATE TABLE "ServiceCalcConfig" (
    "id_config" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "billing_breakdown_mode" TEXT NOT NULL DEFAULT 'auto',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCalcConfig_pkey" PRIMARY KEY ("id_config")
);

-- CreateIndex
CREATE INDEX "ServiceType_id_agency_enabled_idx" ON "ServiceType"("id_agency", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceType_id_agency_code_key" ON "ServiceType"("id_agency", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceType_id_agency_name_key" ON "ServiceType"("id_agency", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCalcConfig_id_agency_key" ON "ServiceCalcConfig"("id_agency");

-- CreateIndex
CREATE INDEX "ServiceCalcConfig_id_agency_idx" ON "ServiceCalcConfig"("id_agency");

-- AddForeignKey
ALTER TABLE "ServiceType" ADD CONSTRAINT "ServiceType_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCalcConfig" ADD CONSTRAINT "ServiceCalcConfig_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
