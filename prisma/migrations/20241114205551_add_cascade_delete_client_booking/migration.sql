-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_id_client_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_id_agency_fkey";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_id_client_fkey" FOREIGN KEY ("id_client") REFERENCES "Client"("id_client") ON DELETE CASCADE ON UPDATE CASCADE;
