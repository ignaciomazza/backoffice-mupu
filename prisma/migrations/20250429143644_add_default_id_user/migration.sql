-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "id_user" INTEGER NOT NULL DEFAULT 10;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;
