/*
  Warnings:

  - You are about to drop the column `id_operator` on the `Booking` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_id_operator_fkey";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "id_operator",
ADD COLUMN     "operatorId_operator" INTEGER;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "id_operator" INTEGER,
ADD COLUMN     "start_date" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_operatorId_operator_fkey" FOREIGN KEY ("operatorId_operator") REFERENCES "Operator"("id_operator") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_id_operator_fkey" FOREIGN KEY ("id_operator") REFERENCES "Operator"("id_operator") ON DELETE CASCADE ON UPDATE CASCADE;
