/*
  Warnings:

  - You are about to drop the column `fx_note` on the `Investment` table. All the data in the column will be lost.
  - You are about to drop the column `fx_rate` on the `Investment` table. All the data in the column will be lost.
  - You are about to drop the column `fx_note` on the `Receipt` table. All the data in the column will be lost.
  - You are about to drop the column `fx_rate` on the `Receipt` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Investment" DROP COLUMN "fx_note",
DROP COLUMN "fx_rate";

-- AlterTable
ALTER TABLE "Receipt" DROP COLUMN "fx_note",
DROP COLUMN "fx_rate";
