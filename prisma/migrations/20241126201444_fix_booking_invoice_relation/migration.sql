/*
  Warnings:

  - You are about to drop the column `booking_date` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `departure_date` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `id_client` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `profit` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `return_date` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `total_amount` on the `Booking` table. All the data in the column will be lost.
  - You are about to drop the column `id_booking` on the `Invoice` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[bookingId_booking]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `titular_id` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bookingId_booking` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_id_client_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_id_booking_fkey";

-- DropIndex
DROP INDEX "Invoice_id_booking_key";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "booking_date",
DROP COLUMN "departure_date",
DROP COLUMN "id_client",
DROP COLUMN "profit",
DROP COLUMN "return_date",
DROP COLUMN "total_amount",
ADD COLUMN     "titular_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "id_booking",
ADD COLUMN     "bookingId_booking" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "Service" (
    "id_service" SERIAL NOT NULL,
    "venta" DOUBLE PRECISION NOT NULL,
    "costo" DOUBLE PRECISION NOT NULL,
    "destino" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "iva_21" DOUBLE PRECISION,
    "iva_105" DOUBLE PRECISION,
    "exento" DOUBLE PRECISION,
    "impuestos" DOUBLE PRECISION,
    "no_computable" DOUBLE PRECISION,
    "gravado_21" DOUBLE PRECISION,
    "gravado_105" DOUBLE PRECISION,
    "moneda" TEXT NOT NULL,
    "vencimiento_pago" TIMESTAMP(3) NOT NULL,
    "creation_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_booking" INTEGER NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id_service")
);

-- CreateTable
CREATE TABLE "_BookingClients" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_BookingClients_AB_unique" ON "_BookingClients"("A", "B");

-- CreateIndex
CREATE INDEX "_BookingClients_B_index" ON "_BookingClients"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_bookingId_booking_key" ON "Invoice"("bookingId_booking");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_titular_id_fkey" FOREIGN KEY ("titular_id") REFERENCES "Client"("id_client") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_id_booking_fkey" FOREIGN KEY ("id_booking") REFERENCES "Booking"("id_booking") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_booking_fkey" FOREIGN KEY ("bookingId_booking") REFERENCES "Booking"("id_booking") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookingClients" ADD CONSTRAINT "_BookingClients_A_fkey" FOREIGN KEY ("A") REFERENCES "Booking"("id_booking") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookingClients" ADD CONSTRAINT "_BookingClients_B_fkey" FOREIGN KEY ("B") REFERENCES "Client"("id_client") ON DELETE CASCADE ON UPDATE CASCADE;
