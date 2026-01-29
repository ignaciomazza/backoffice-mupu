-- AlterTable
ALTER TABLE "ClientConfig" ADD COLUMN     "use_simple_companions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PassengerCategory" (
    "id_category" SERIAL NOT NULL,
    "agency_passenger_category_id" INTEGER NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "min_age" INTEGER,
    "max_age" INTEGER,
    "ignore_age" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassengerCategory_pkey" PRIMARY KEY ("id_category")
);

-- CreateTable
CREATE TABLE "BookingCompanion" (
    "id_companion" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "age" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingCompanion_pkey" PRIMARY KEY ("id_companion")
);

-- CreateTable
CREATE TABLE "ServiceTypePreset" (
    "id_preset" SERIAL NOT NULL,
    "agency_service_type_preset_id" INTEGER NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "service_type_id" INTEGER NOT NULL,
    "operator_id" INTEGER,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTypePreset_pkey" PRIMARY KEY ("id_preset")
);

-- CreateTable
CREATE TABLE "ServiceTypePresetItem" (
    "id_item" SERIAL NOT NULL,
    "preset_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "sale_price" DOUBLE PRECISION NOT NULL,
    "cost_price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ServiceTypePresetItem_pkey" PRIMARY KEY ("id_item")
);

-- CreateTable
CREATE TABLE "ClientRelation" (
    "id_relation" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "related_client_id" INTEGER NOT NULL,
    "relation_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRelation_pkey" PRIMARY KEY ("id_relation")
);

-- CreateIndex
CREATE INDEX "PassengerCategory_id_agency_enabled_idx" ON "PassengerCategory"("id_agency", "enabled");

-- CreateIndex
CREATE INDEX "PassengerCategory_id_agency_sort_order_idx" ON "PassengerCategory"("id_agency", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "PassengerCategory_id_agency_code_key" ON "PassengerCategory"("id_agency", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PassengerCategory_id_agency_name_key" ON "PassengerCategory"("id_agency", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PassengerCategory_id_agency_agency_passenger_category_id_key" ON "PassengerCategory"("id_agency", "agency_passenger_category_id");

-- CreateIndex
CREATE INDEX "BookingCompanion_booking_id_idx" ON "BookingCompanion"("booking_id");

-- CreateIndex
CREATE INDEX "BookingCompanion_category_id_idx" ON "BookingCompanion"("category_id");

-- CreateIndex
CREATE INDEX "ServiceTypePreset_id_agency_enabled_idx" ON "ServiceTypePreset"("id_agency", "enabled");

-- CreateIndex
CREATE INDEX "ServiceTypePreset_service_type_id_idx" ON "ServiceTypePreset"("service_type_id");

-- CreateIndex
CREATE INDEX "ServiceTypePreset_operator_id_idx" ON "ServiceTypePreset"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTypePreset_id_agency_agency_service_type_preset_id_key" ON "ServiceTypePreset"("id_agency", "agency_service_type_preset_id");

-- CreateIndex
CREATE INDEX "ServiceTypePresetItem_preset_id_idx" ON "ServiceTypePresetItem"("preset_id");

-- CreateIndex
CREATE INDEX "ServiceTypePresetItem_category_id_idx" ON "ServiceTypePresetItem"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTypePresetItem_preset_id_category_id_key" ON "ServiceTypePresetItem"("preset_id", "category_id");

-- CreateIndex
CREATE INDEX "ClientRelation_id_agency_client_id_idx" ON "ClientRelation"("id_agency", "client_id");

-- CreateIndex
CREATE INDEX "ClientRelation_id_agency_related_client_id_idx" ON "ClientRelation"("id_agency", "related_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRelation_id_agency_client_id_related_client_id_key" ON "ClientRelation"("id_agency", "client_id", "related_client_id");

-- AddForeignKey
ALTER TABLE "PassengerCategory" ADD CONSTRAINT "PassengerCategory_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCompanion" ADD CONSTRAINT "BookingCompanion_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id_booking") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCompanion" ADD CONSTRAINT "BookingCompanion_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "PassengerCategory"("id_category") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTypePreset" ADD CONSTRAINT "ServiceTypePreset_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTypePreset" ADD CONSTRAINT "ServiceTypePreset_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "ServiceType"("id_service_type") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTypePreset" ADD CONSTRAINT "ServiceTypePreset_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "Operator"("id_operator") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTypePresetItem" ADD CONSTRAINT "ServiceTypePresetItem_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "ServiceTypePreset"("id_preset") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTypePresetItem" ADD CONSTRAINT "ServiceTypePresetItem_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "PassengerCategory"("id_category") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRelation" ADD CONSTRAINT "ClientRelation_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRelation" ADD CONSTRAINT "ClientRelation_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id_client") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRelation" ADD CONSTRAINT "ClientRelation_related_client_id_fkey" FOREIGN KEY ("related_client_id") REFERENCES "Client"("id_client") ON DELETE CASCADE ON UPDATE CASCADE;
