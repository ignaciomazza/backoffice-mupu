/*
  Warnings:

  - You are about to drop the column `amount` on the `CreditNote` table. All the data in the column will be lost.
  - You are about to drop the column `details` on the `CreditNote` table. All the data in the column will be lost.
  - Added the required column `currency` to the `CreditNote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recipient` to the `CreditNote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `CreditNote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total_amount` to the `CreditNote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `CreditNote` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CreditNote" DROP COLUMN "amount",
DROP COLUMN "details",
ADD COLUMN     "currency" TEXT NOT NULL,
ADD COLUMN     "payloadAfip" JSONB,
ADD COLUMN     "recipient" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL,
ADD COLUMN     "total_amount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "CreditNoteItem" (
    "id" SERIAL NOT NULL,
    "creditNoteId" INTEGER NOT NULL,
    "serviceId" INTEGER,
    "description" TEXT NOT NULL,
    "sale_price" DOUBLE PRECISION NOT NULL,
    "taxableBase21" DOUBLE PRECISION NOT NULL,
    "commission21" DOUBLE PRECISION NOT NULL,
    "tax_21" DOUBLE PRECISION NOT NULL,
    "vatOnCommission21" DOUBLE PRECISION NOT NULL,
    "taxableBase10_5" DOUBLE PRECISION,
    "commission10_5" DOUBLE PRECISION,
    "tax_105" DOUBLE PRECISION,
    "vatOnCommission10_5" DOUBLE PRECISION,
    "taxableCardInterest" DOUBLE PRECISION,
    "vatOnCardInterest" DOUBLE PRECISION,

    CONSTRAINT "CreditNoteItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id_credit_note") ON DELETE CASCADE ON UPDATE CASCADE;
