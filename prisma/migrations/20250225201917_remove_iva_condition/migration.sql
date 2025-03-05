/*
  Warnings:

  - You are about to drop the column `billing_preference` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `iva_condition` on the `Client` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Client" DROP COLUMN "billing_preference",
DROP COLUMN "iva_condition";
