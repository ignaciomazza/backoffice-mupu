-- CreateTable
CREATE TABLE "TravelGroupConfig" (
    "id_travel_group_config" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "required_fields_agencia" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "required_fields_estudiantil" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "required_fields_precomprado" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "capacity_options" TEXT[] NOT NULL DEFAULT ARRAY['TOTAL', 'SERVICIO', 'OVERBOOKING', 'WAITLIST']::TEXT[],
    "default_capacity_mode" TEXT NOT NULL DEFAULT 'TOTAL',
    "default_allow_overbooking" BOOLEAN NOT NULL DEFAULT false,
    "default_waitlist_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelGroupConfig_pkey" PRIMARY KEY ("id_travel_group_config")
);

-- CreateTable
CREATE TABLE "TravelGroupPaymentTemplate" (
    "id_travel_group_payment_template" SERIAL NOT NULL,
    "agency_travel_group_payment_template_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "created_by" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target_type" TEXT,
    "payment_mode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_preloaded" BOOLEAN NOT NULL DEFAULT false,
    "assigned_user_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "installments" JSONB NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelGroupPaymentTemplate_pkey" PRIMARY KEY ("id_travel_group_payment_template")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelGroupConfig_id_agency_key" ON "TravelGroupConfig"("id_agency");
CREATE UNIQUE INDEX "agency_travel_group_payment_template_id_unique" ON "TravelGroupPaymentTemplate"("id_agency", "agency_travel_group_payment_template_id");
CREATE INDEX "TravelGroupPaymentTemplate_id_agency_is_active_idx" ON "TravelGroupPaymentTemplate"("id_agency", "is_active");
CREATE INDEX "TravelGroupPaymentTemplate_id_agency_target_type_idx" ON "TravelGroupPaymentTemplate"("id_agency", "target_type");
CREATE INDEX "TravelGroupPaymentTemplate_created_by_idx" ON "TravelGroupPaymentTemplate"("created_by");

-- AddForeignKey
ALTER TABLE "TravelGroupConfig" ADD CONSTRAINT "TravelGroupConfig_id_agency_fkey"
FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravelGroupPaymentTemplate" ADD CONSTRAINT "TravelGroupPaymentTemplate_id_agency_fkey"
FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravelGroupPaymentTemplate" ADD CONSTRAINT "TravelGroupPaymentTemplate_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;
