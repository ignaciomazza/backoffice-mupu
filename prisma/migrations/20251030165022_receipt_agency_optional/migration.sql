-- DropForeignKey
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_bookingId_booking_fkey";

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "id_agency" INTEGER,
ALTER COLUMN "bookingId_booking" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Receipt_bookingId_booking_idx" ON "Receipt"("bookingId_booking");

-- CreateIndex
CREATE INDEX "Receipt_id_agency_idx" ON "Receipt"("id_agency");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_bookingId_booking_fkey" FOREIGN KEY ("bookingId_booking") REFERENCES "Booking"("id_booking") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE SET NULL ON UPDATE CASCADE;
