/*
  Warnings:

  - Added the required column `recipient` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "details" TEXT,
ADD COLUMN     "recipient" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "OperatorTransaction" ADD COLUMN     "invoice_number" TEXT;

-- CreateTable
CREATE TABLE "Receipt" (
    "id_receipt" SERIAL NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "payment_details" TEXT,
    "pax_type" TEXT NOT NULL,
    "bookingId_booking" INTEGER NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id_receipt")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id_credit_note" SERIAL NOT NULL,
    "credit_number" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "details" TEXT,
    "invoiceId" INTEGER NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id_credit_note")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receipt_number_key" ON "Receipt"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_credit_number_key" ON "CreditNote"("credit_number");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_bookingId_booking_fkey" FOREIGN KEY ("bookingId_booking") REFERENCES "Booking"("id_booking") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id_invoice") ON DELETE RESTRICT ON UPDATE CASCADE;
