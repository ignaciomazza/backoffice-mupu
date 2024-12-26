/*
  Warnings:

  - You are about to drop the column `operatorId_operator` on the `Booking` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_operatorId_operator_fkey";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "operatorId_operator";
