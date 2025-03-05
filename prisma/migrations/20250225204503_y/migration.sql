/*
  Warnings:

  - You are about to drop the `AFIPAuthentication` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdminRecord` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OperatorTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Receipt` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AdminRecord" DROP CONSTRAINT "AdminRecord_id_user_fkey";

-- DropForeignKey
ALTER TABLE "OperatorTransaction" DROP CONSTRAINT "OperatorTransaction_id_operator_fkey";

-- DropForeignKey
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_bookingId_booking_fkey";

-- DropTable
DROP TABLE "AFIPAuthentication";

-- DropTable
DROP TABLE "AdminRecord";

-- DropTable
DROP TABLE "OperatorTransaction";

-- DropTable
DROP TABLE "Receipt";
