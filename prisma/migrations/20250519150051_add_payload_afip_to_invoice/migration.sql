/*
  Warnings:

  - You are about to drop the column `details` on the `Invoice` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "details",
ADD COLUMN     "payloadAfip" JSONB;
