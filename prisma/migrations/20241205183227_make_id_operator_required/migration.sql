/*
  Warnings:

  - Made the column `id_operator` on table `Service` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Service" ALTER COLUMN "id_operator" SET NOT NULL;
