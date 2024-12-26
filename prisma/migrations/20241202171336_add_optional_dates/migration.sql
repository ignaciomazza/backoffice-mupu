/*
  Warnings:

  - Made the column `departure_date` on table `Booking` required. This step will fail if there are existing NULL values in that column.
  - Made the column `return_date` on table `Booking` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "departure_date" SET NOT NULL,
ALTER COLUMN "return_date" SET NOT NULL;
