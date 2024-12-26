-- DropForeignKey
ALTER TABLE "UserTeam" DROP CONSTRAINT "UserTeam_id_user_fkey";

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;
