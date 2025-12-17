-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "account_id" INTEGER,
ADD COLUMN     "payment_method_id" INTEGER;

-- CreateTable
CREATE TABLE "ReceiptPayment" (
    "id_receipt_payment" SERIAL NOT NULL,
    "receipt_id" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_method_id" INTEGER NOT NULL,
    "account_id" INTEGER,

    CONSTRAINT "ReceiptPayment_pkey" PRIMARY KEY ("id_receipt_payment")
);

-- CreateIndex
CREATE INDEX "ReceiptPayment_receipt_id_idx" ON "ReceiptPayment"("receipt_id");

-- AddForeignKey
ALTER TABLE "ReceiptPayment" ADD CONSTRAINT "ReceiptPayment_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "Receipt"("id_receipt") ON DELETE CASCADE ON UPDATE CASCADE;
