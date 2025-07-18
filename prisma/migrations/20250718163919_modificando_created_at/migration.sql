/*
  Warnings:

  - You are about to drop the column `issue_date` on the `Resources` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Resources" DROP COLUMN "issue_date",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
