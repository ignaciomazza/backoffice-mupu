/*
  Warnings:

  - You are about to drop the column `currency` on the `Booking` table. All the data in the column will be lost.
  - Added the required column `currency` to the `Service` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "currency";

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "currency" TEXT NOT NULL;
