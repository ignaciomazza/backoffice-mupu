/*
  Warnings:

  - You are about to drop the column `not_computable` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `payment_due_date` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `taxable_105` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `taxable_21` on the `Service` table. All the data in the column will be lost.
  - Made the column `description` on table `Service` required. This step will fail if there are existing NULL values in that column.
  - Made the column `departure_date` on table `Service` required. This step will fail if there are existing NULL values in that column.
  - Made the column `return_date` on table `Service` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Service" DROP COLUMN "not_computable",
DROP COLUMN "payment_due_date",
DROP COLUMN "taxable_105",
DROP COLUMN "taxable_21",
ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "departure_date" SET NOT NULL,
ALTER COLUMN "return_date" SET NOT NULL;
