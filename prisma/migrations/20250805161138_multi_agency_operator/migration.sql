-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "id_agency" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "Operator" ADD CONSTRAINT "Operator_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
