/*
  Warnings:

  - The primary key for the `Resources` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id_receipt` on the `Resources` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Resources" DROP CONSTRAINT "Resources_pkey",
DROP COLUMN "id_receipt",
ADD COLUMN     "id_resource" SERIAL NOT NULL,
ADD CONSTRAINT "Resources_pkey" PRIMARY KEY ("id_resource");
