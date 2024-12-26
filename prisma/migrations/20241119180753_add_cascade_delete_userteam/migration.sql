-- DropForeignKey
ALTER TABLE "UserTeam" DROP CONSTRAINT "UserTeam_id_team_fkey";

-- DropForeignKey
ALTER TABLE "UserTeam" DROP CONSTRAINT "UserTeam_id_user_fkey";

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_id_team_fkey" FOREIGN KEY ("id_team") REFERENCES "SalesTeam"("id_team") ON DELETE CASCADE ON UPDATE CASCADE;
