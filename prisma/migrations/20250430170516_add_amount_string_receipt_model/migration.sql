/*
  Warnings:

  - Added the required column `amount_string` to the `Receipt` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "amount_string" TEXT NOT NULL;
