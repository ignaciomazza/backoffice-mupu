-- CreateTable
CREATE TABLE "Receipt" (
    "id_receipt" SERIAL NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "concept" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "facturaHtml" TEXT,
    "bookingId_booking" INTEGER NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id_receipt")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receipt_number_key" ON "Receipt"("receipt_number");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_bookingId_booking_fkey" FOREIGN KEY ("bookingId_booking") REFERENCES "Booking"("id_booking") ON DELETE RESTRICT ON UPDATE CASCADE;
