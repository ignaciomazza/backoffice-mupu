/*
  Warnings:

  - You are about to drop the column `email` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `marital_status` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `occupation` on the `Client` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Client_email_key";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "email",
DROP COLUMN "marital_status",
DROP COLUMN "occupation",
ADD COLUMN     "billing_preference" TEXT,
ADD COLUMN     "commercial_address" TEXT,
ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "dni_expiry_date" TIMESTAMP(3),
ADD COLUMN     "dni_issue_date" TIMESTAMP(3),
ADD COLUMN     "dni_number" TEXT,
ADD COLUMN     "iva_condition" TEXT,
ADD COLUMN     "locality" TEXT,
ADD COLUMN     "passport_number" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "tax_id" TEXT;
