-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "pax_count" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "id_agency" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Resources" ALTER COLUMN "id_agency" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SalesTeam" ALTER COLUMN "id_agency" DROP DEFAULT;
