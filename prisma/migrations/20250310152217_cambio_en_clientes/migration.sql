/*
  Warnings:

  - Made the column `phone` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `birth_date` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `nationality` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gender` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `dni_expiry_date` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `dni_issue_date` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `dni_number` on table `Client` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "birth_date" SET NOT NULL,
ALTER COLUMN "nationality" SET NOT NULL,
ALTER COLUMN "gender" SET NOT NULL,
ALTER COLUMN "dni_expiry_date" SET NOT NULL,
ALTER COLUMN "dni_issue_date" SET NOT NULL,
ALTER COLUMN "dni_number" SET NOT NULL;
