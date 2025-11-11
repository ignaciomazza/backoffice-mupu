/*
  Warnings:

  - You are about to drop the column `credit_limit` on the `CreditAccount` table. All the data in the column will be lost.
  - You are about to drop the column `subject_type` on the `CreditAccount` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "CreditAccount_id_agency_subject_type_idx";

-- AlterTable
ALTER TABLE "CreditAccount" DROP COLUMN "credit_limit",
DROP COLUMN "subject_type";

-- CreateIndex
CREATE INDEX "CreditAccount_id_agency_idx" ON "CreditAccount"("id_agency");
