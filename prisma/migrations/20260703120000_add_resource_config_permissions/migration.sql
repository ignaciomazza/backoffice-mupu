-- CreateTable
CREATE TABLE "ResourceConfig" (
    "id_config" SERIAL NOT NULL,
    "agency_resource_config_id" INTEGER NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "access_rules" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceConfig_pkey" PRIMARY KEY ("id_config")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResourceConfig_id_agency_key" ON "ResourceConfig"("id_agency");

-- CreateIndex
CREATE UNIQUE INDEX "agency_resource_config_id_unique" ON "ResourceConfig"("id_agency", "agency_resource_config_id");

-- CreateIndex
CREATE INDEX "ResourceConfig_id_agency_idx" ON "ResourceConfig"("id_agency");

-- AddForeignKey
ALTER TABLE "ResourceConfig" ADD CONSTRAINT "ResourceConfig_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
