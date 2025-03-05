-- CreateTable
CREATE TABLE "_InvoiceClients" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_InvoiceClients_AB_unique" ON "_InvoiceClients"("A", "B");

-- CreateIndex
CREATE INDEX "_InvoiceClients_B_index" ON "_InvoiceClients"("B");

-- AddForeignKey
ALTER TABLE "_InvoiceClients" ADD CONSTRAINT "_InvoiceClients_A_fkey" FOREIGN KEY ("A") REFERENCES "Client"("id_client") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceClients" ADD CONSTRAINT "_InvoiceClients_B_fkey" FOREIGN KEY ("B") REFERENCES "Invoice"("id_invoice") ON DELETE CASCADE ON UPDATE CASCADE;
