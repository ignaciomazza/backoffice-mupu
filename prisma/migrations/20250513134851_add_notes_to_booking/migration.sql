/*
  Warnings:

  - Made the column `details` on table `Booking` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "note" TEXT,
ALTER COLUMN "details" SET NOT NULL;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "note" TEXT;
