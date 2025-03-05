/*
  Warnings:

  - You are about to drop the `_InvoiceClients` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `client_id` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "_InvoiceClients" DROP CONSTRAINT "_InvoiceClients_A_fkey";

-- DropForeignKey
ALTER TABLE "_InvoiceClients" DROP CONSTRAINT "_InvoiceClients_B_fkey";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "client_id" INTEGER NOT NULL;

-- DropTable
DROP TABLE "_InvoiceClients";

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id_client") ON DELETE RESTRICT ON UPDATE CASCADE;
