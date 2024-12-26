/*
  Warnings:

  - You are about to drop the column `booking_code` on the `Booking` table. All the data in the column will be lost.
  - Added the required column `departure_date` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `return_date` to the `Booking` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Booking_booking_code_key";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "booking_code",
ADD COLUMN     "departure_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "observation" TEXT,
ADD COLUMN     "return_date" TIMESTAMP(3) NOT NULL;
