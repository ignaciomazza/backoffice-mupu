/*
  Warnings:

  - The `booking_code` column on the `Booking` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "booking_code",
ADD COLUMN     "booking_code" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_booking_code_key" ON "Booking"("booking_code");
