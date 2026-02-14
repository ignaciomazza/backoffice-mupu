-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "travel_group_id" INTEGER,
ADD COLUMN "travel_group_departure_id" INTEGER;

-- CreateTable
CREATE TABLE "TravelGroup" (
    "id_travel_group" SERIAL NOT NULL,
    "agency_travel_group_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "id_user" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "description" TEXT,
    "note" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "currency" TEXT,
    "capacity_mode" TEXT NOT NULL DEFAULT 'TOTAL',
    "capacity_total" INTEGER,
    "allow_overbooking" BOOLEAN NOT NULL DEFAULT false,
    "overbooking_limit" INTEGER,
    "waitlist_enabled" BOOLEAN NOT NULL DEFAULT false,
    "waitlist_limit" INTEGER,
    "sale_mode" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelGroup_pkey" PRIMARY KEY ("id_travel_group")
);

-- CreateTable
CREATE TABLE "TravelGroupDeparture" (
    "id_travel_group_departure" SERIAL NOT NULL,
    "agency_travel_group_departure_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "travel_group_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "departure_date" TIMESTAMP(3) NOT NULL,
    "return_date" TIMESTAMP(3),
    "release_date" TIMESTAMP(3),
    "capacity_total" INTEGER,
    "allow_overbooking" BOOLEAN,
    "overbooking_limit" INTEGER,
    "waitlist_enabled" BOOLEAN,
    "waitlist_limit" INTEGER,
    "price_list" JSONB,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelGroupDeparture_pkey" PRIMARY KEY ("id_travel_group_departure")
);

-- CreateTable
CREATE TABLE "TravelGroupInventory" (
    "id_travel_group_inventory" SERIAL NOT NULL,
    "agency_travel_group_inventory_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "travel_group_id" INTEGER NOT NULL,
    "travel_group_departure_id" INTEGER,
    "inventory_type" TEXT NOT NULL,
    "service_type" TEXT,
    "label" TEXT NOT NULL,
    "provider" TEXT,
    "locator" TEXT,
    "total_qty" INTEGER NOT NULL,
    "assigned_qty" INTEGER NOT NULL DEFAULT 0,
    "confirmed_qty" INTEGER NOT NULL DEFAULT 0,
    "blocked_qty" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT,
    "unit_cost" DECIMAL(18,2),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelGroupInventory_pkey" PRIMARY KEY ("id_travel_group_inventory")
);

-- CreateTable
CREATE TABLE "TravelGroupPassenger" (
    "id_travel_group_passenger" SERIAL NOT NULL,
    "agency_travel_group_passenger_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "travel_group_id" INTEGER NOT NULL,
    "travel_group_departure_id" INTEGER,
    "booking_id" INTEGER,
    "client_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "waitlist_position" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelGroupPassenger_pkey" PRIMARY KEY ("id_travel_group_passenger")
);

-- CreateIndex
CREATE UNIQUE INDEX "agency_travel_group_id_unique" ON "TravelGroup"("id_agency", "agency_travel_group_id");
CREATE INDEX "TravelGroup_id_agency_status_idx" ON "TravelGroup"("id_agency", "status");
CREATE INDEX "TravelGroup_id_agency_type_idx" ON "TravelGroup"("id_agency", "type");
CREATE INDEX "TravelGroup_id_user_idx" ON "TravelGroup"("id_user");

CREATE UNIQUE INDEX "agency_travel_group_departure_id_unique" ON "TravelGroupDeparture"("id_agency", "agency_travel_group_departure_id");
CREATE INDEX "TravelGroupDeparture_id_agency_travel_group_id_idx" ON "TravelGroupDeparture"("id_agency", "travel_group_id");
CREATE INDEX "TravelGroupDeparture_departure_date_idx" ON "TravelGroupDeparture"("departure_date");
CREATE INDEX "TravelGroupDeparture_status_idx" ON "TravelGroupDeparture"("status");

CREATE UNIQUE INDEX "agency_travel_group_inventory_id_unique" ON "TravelGroupInventory"("id_agency", "agency_travel_group_inventory_id");
CREATE INDEX "TravelGroupInventory_id_agency_travel_group_id_idx" ON "TravelGroupInventory"("id_agency", "travel_group_id");
CREATE INDEX "TravelGroupInventory_travel_group_departure_id_idx" ON "TravelGroupInventory"("travel_group_departure_id");

CREATE UNIQUE INDEX "agency_travel_group_passenger_id_unique" ON "TravelGroupPassenger"("id_agency", "agency_travel_group_passenger_id");
CREATE UNIQUE INDEX "TravelGroupPassenger_travel_group_id_booking_id_key" ON "TravelGroupPassenger"("travel_group_id", "booking_id");
CREATE INDEX "TravelGroupPassenger_id_agency_travel_group_id_idx" ON "TravelGroupPassenger"("id_agency", "travel_group_id");
CREATE INDEX "TravelGroupPassenger_travel_group_departure_id_idx" ON "TravelGroupPassenger"("travel_group_departure_id");
CREATE INDEX "TravelGroupPassenger_booking_id_idx" ON "TravelGroupPassenger"("booking_id");
CREATE INDEX "TravelGroupPassenger_client_id_idx" ON "TravelGroupPassenger"("client_id");
CREATE INDEX "TravelGroupPassenger_status_idx" ON "TravelGroupPassenger"("status");

CREATE INDEX "Booking_travel_group_id_idx" ON "Booking"("travel_group_id");
CREATE INDEX "Booking_travel_group_departure_id_idx" ON "Booking"("travel_group_departure_id");

-- AddForeignKey
ALTER TABLE "TravelGroup" ADD CONSTRAINT "TravelGroup_id_agency_fkey"
FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravelGroup" ADD CONSTRAINT "TravelGroup_id_user_fkey"
FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TravelGroupDeparture" ADD CONSTRAINT "TravelGroupDeparture_id_agency_fkey"
FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravelGroupDeparture" ADD CONSTRAINT "TravelGroupDeparture_travel_group_id_fkey"
FOREIGN KEY ("travel_group_id") REFERENCES "TravelGroup"("id_travel_group") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravelGroupInventory" ADD CONSTRAINT "TravelGroupInventory_id_agency_fkey"
FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravelGroupInventory" ADD CONSTRAINT "TravelGroupInventory_travel_group_id_fkey"
FOREIGN KEY ("travel_group_id") REFERENCES "TravelGroup"("id_travel_group") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravelGroupInventory" ADD CONSTRAINT "TravelGroupInventory_travel_group_departure_id_fkey"
FOREIGN KEY ("travel_group_departure_id") REFERENCES "TravelGroupDeparture"("id_travel_group_departure") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravelGroupPassenger" ADD CONSTRAINT "TravelGroupPassenger_id_agency_fkey"
FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravelGroupPassenger" ADD CONSTRAINT "TravelGroupPassenger_travel_group_id_fkey"
FOREIGN KEY ("travel_group_id") REFERENCES "TravelGroup"("id_travel_group") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravelGroupPassenger" ADD CONSTRAINT "TravelGroupPassenger_travel_group_departure_id_fkey"
FOREIGN KEY ("travel_group_departure_id") REFERENCES "TravelGroupDeparture"("id_travel_group_departure") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TravelGroupPassenger" ADD CONSTRAINT "TravelGroupPassenger_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "Booking"("id_booking") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TravelGroupPassenger" ADD CONSTRAINT "TravelGroupPassenger_client_id_fkey"
FOREIGN KEY ("client_id") REFERENCES "Client"("id_client") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_travel_group_id_fkey"
FOREIGN KEY ("travel_group_id") REFERENCES "TravelGroup"("id_travel_group") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_travel_group_departure_id_fkey"
FOREIGN KEY ("travel_group_departure_id") REFERENCES "TravelGroupDeparture"("id_travel_group_departure") ON DELETE SET NULL ON UPDATE CASCADE;
