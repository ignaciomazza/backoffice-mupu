-- AlterTable
ALTER TABLE "OtherIncome"
ADD COLUMN "counterparty_type" TEXT,
ADD COLUMN "counterparty_name" TEXT,
ADD COLUMN "receipt_to" TEXT,
ADD COLUMN "reference_note" TEXT;
