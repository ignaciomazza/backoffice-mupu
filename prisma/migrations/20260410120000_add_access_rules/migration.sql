-- AlterTable
ALTER TABLE "FinanceConfig" ADD COLUMN "section_access_rules" JSONB;

-- AlterTable
ALTER TABLE "ServiceCalcConfig" ADD COLUMN "booking_access_rules" JSONB;
