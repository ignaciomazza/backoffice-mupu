-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "clientIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
