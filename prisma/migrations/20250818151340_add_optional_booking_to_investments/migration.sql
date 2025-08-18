-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "booking_id" INTEGER;

-- CreateIndex
CREATE INDEX "Investment_booking_id_idx" ON "Investment"("booking_id");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id_booking") ON DELETE SET NULL ON UPDATE CASCADE;
