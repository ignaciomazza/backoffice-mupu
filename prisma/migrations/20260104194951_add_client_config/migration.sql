-- CreateTable
CREATE TABLE "ClientConfig" (
    "id_config" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "visibility_mode" TEXT NOT NULL DEFAULT 'all',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientConfig_pkey" PRIMARY KEY ("id_config")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientConfig_id_agency_key" ON "ClientConfig"("id_agency");

-- CreateIndex
CREATE INDEX "ClientConfig_id_agency_idx" ON "ClientConfig"("id_agency");

-- AddForeignKey
ALTER TABLE "ClientConfig" ADD CONSTRAINT "ClientConfig_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
