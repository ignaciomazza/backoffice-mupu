-- AlterTable
ALTER TABLE "Agency" ADD COLUMN     "transfer_fee_pct" DECIMAL(9,6);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "transfer_fee_amount" DECIMAL(14,2),
ADD COLUMN     "transfer_fee_pct" DECIMAL(9,6);
