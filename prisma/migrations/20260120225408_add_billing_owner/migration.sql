-- AlterTable
ALTER TABLE "Agency" ADD COLUMN     "billing_owner_agency_id" INTEGER;

-- CreateIndex
CREATE INDEX "Agency_billing_owner_agency_id_idx" ON "Agency"("billing_owner_agency_id");

-- AddForeignKey
ALTER TABLE "Agency" ADD CONSTRAINT "Agency_billing_owner_agency_id_fkey" FOREIGN KEY ("billing_owner_agency_id") REFERENCES "Agency"("id_agency") ON DELETE SET NULL ON UPDATE CASCADE;
