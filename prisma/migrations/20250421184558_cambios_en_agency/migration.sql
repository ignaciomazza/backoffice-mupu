/*
  Warnings:

  - Made the column `legal_name` on table `Agency` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Agency" ALTER COLUMN "legal_name" SET NOT NULL;
