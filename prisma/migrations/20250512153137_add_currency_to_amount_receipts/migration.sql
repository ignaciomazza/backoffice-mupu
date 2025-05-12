-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "amount_currency" TEXT NOT NULL DEFAULT 'ARS',
ALTER COLUMN "serviceIds" DROP DEFAULT;
