/*
  Warnings:

  - You are about to drop the column `id_user` on the `Client` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_id_user_fkey";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "id_user";
