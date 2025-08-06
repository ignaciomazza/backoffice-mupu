-- AlterTable
ALTER TABLE "Agency" ADD COLUMN     "afip_cert_base64" TEXT,
ADD COLUMN     "afip_key_base64" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "id_agency" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Resources" ADD COLUMN     "id_agency" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "SalesTeam" ADD COLUMN     "id_agency" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTeam" ADD CONSTRAINT "SalesTeam_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resources" ADD CONSTRAINT "Resources_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
