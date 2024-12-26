/*
  Warnings:

  - You are about to drop the column `id_category` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the `Category` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_id_category_fkey";

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "id_category";

-- DropTable
DROP TABLE "Category";
