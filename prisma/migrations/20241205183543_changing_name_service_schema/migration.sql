/*
  Warnings:

  - You are about to drop the column `end_date` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `Service` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Service" DROP COLUMN "end_date",
DROP COLUMN "start_date",
ADD COLUMN     "departure_date" TIMESTAMP(3),
ADD COLUMN     "return_date" TIMESTAMP(3);
