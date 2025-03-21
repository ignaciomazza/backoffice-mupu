/*
  Warnings:

  - You are about to drop the column `dni_expiry_date` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `dni_issue_date` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `passport_expiry` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `passport_issue` on the `Client` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Client" DROP COLUMN "dni_expiry_date",
DROP COLUMN "dni_issue_date",
DROP COLUMN "passport_expiry",
DROP COLUMN "passport_issue",
ADD COLUMN     "email" TEXT,
ALTER COLUMN "dni_number" DROP NOT NULL;
