/*
  Warnings:

  - You are about to drop the column `currency` on the `Service` table. All the data in the column will be lost.
  - Added the required column `currency` to the `Booking` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "currency" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "currency";
