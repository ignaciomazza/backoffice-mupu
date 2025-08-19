-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "account" TEXT,
ADD COLUMN     "base_amount" DECIMAL(18,2),
ADD COLUMN     "base_currency" TEXT,
ADD COLUMN     "counter_amount" DECIMAL(18,2),
ADD COLUMN     "counter_currency" TEXT,
ADD COLUMN     "fx_note" TEXT,
ADD COLUMN     "fx_rate" DECIMAL(18,6),
ADD COLUMN     "payment_method" TEXT;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "account" TEXT,
ADD COLUMN     "base_amount" DECIMAL(18,2),
ADD COLUMN     "base_currency" TEXT,
ADD COLUMN     "counter_amount" DECIMAL(18,2),
ADD COLUMN     "counter_currency" TEXT,
ADD COLUMN     "fx_note" TEXT,
ADD COLUMN     "fx_rate" DECIMAL(18,6),
ADD COLUMN     "payment_method" TEXT;
