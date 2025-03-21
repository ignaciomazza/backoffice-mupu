/*
  Warnings:

  - Made the column `invoice_type` on table `Booking` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "invoice_type" SET NOT NULL;
