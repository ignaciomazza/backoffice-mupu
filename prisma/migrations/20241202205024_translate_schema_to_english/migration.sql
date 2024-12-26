/*
  Warnings:

  - You are about to drop the column `costo` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `creation_date` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `destino` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `exento` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `gravado_105` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `gravado_21` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `id_booking` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `impuestos` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `iva_105` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `iva_21` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `moneda` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `no_computable` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `referencia` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `vencimiento_pago` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `venta` on the `Service` table. All the data in the column will be lost.
  - Added the required column `booking_id` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cost_price` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currency` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destination` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `payment_due_date` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reference` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sale_price` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Service` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_id_booking_fkey";

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "costo",
DROP COLUMN "creation_date",
DROP COLUMN "destino",
DROP COLUMN "exento",
DROP COLUMN "gravado_105",
DROP COLUMN "gravado_21",
DROP COLUMN "id_booking",
DROP COLUMN "impuestos",
DROP COLUMN "iva_105",
DROP COLUMN "iva_21",
DROP COLUMN "moneda",
DROP COLUMN "no_computable",
DROP COLUMN "referencia",
DROP COLUMN "vencimiento_pago",
DROP COLUMN "venta",
ADD COLUMN     "booking_id" INTEGER NOT NULL,
ADD COLUMN     "cost_price" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currency" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "destination" TEXT NOT NULL,
ADD COLUMN     "exempt" DOUBLE PRECISION,
ADD COLUMN     "not_computable" DOUBLE PRECISION,
ADD COLUMN     "other_taxes" DOUBLE PRECISION,
ADD COLUMN     "payment_due_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "reference" TEXT NOT NULL,
ADD COLUMN     "sale_price" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "tax_105" DOUBLE PRECISION,
ADD COLUMN     "tax_21" DOUBLE PRECISION,
ADD COLUMN     "taxable_105" DOUBLE PRECISION,
ADD COLUMN     "taxable_21" DOUBLE PRECISION,
ADD COLUMN     "type" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id_booking") ON DELETE CASCADE ON UPDATE CASCADE;
