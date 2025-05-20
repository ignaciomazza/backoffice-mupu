-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "serviceId" INTEGER,
    "description" TEXT NOT NULL,
    "sale_price" DOUBLE PRECISION NOT NULL,
    "taxableBase21" DOUBLE PRECISION NOT NULL,
    "commission21" DOUBLE PRECISION NOT NULL,
    "tax_21" DOUBLE PRECISION NOT NULL,
    "vatOnCommission21" DOUBLE PRECISION NOT NULL,
    "taxableBase10_5" DOUBLE PRECISION,
    "commission10_5" DOUBLE PRECISION,
    "tax_105" DOUBLE PRECISION,
    "vatOnCommission10_5" DOUBLE PRECISION,
    "taxableCardInterest" DOUBLE PRECISION,
    "vatOnCardInterest" DOUBLE PRECISION,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id_invoice") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id_service") ON DELETE SET NULL ON UPDATE CASCADE;
