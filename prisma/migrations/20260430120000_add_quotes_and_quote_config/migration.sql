-- CreateTable
CREATE TABLE "Quote" (
    "id_quote" SERIAL NOT NULL,
    "agency_quote_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "id_user" INTEGER NOT NULL,
    "lead_name" TEXT,
    "lead_phone" TEXT,
    "lead_email" TEXT,
    "note" TEXT,
    "booking_draft" JSONB,
    "pax_drafts" JSONB,
    "service_drafts" JSONB,
    "custom_values" JSONB,
    "creation_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id_quote")
);

-- CreateTable
CREATE TABLE "QuoteConfig" (
    "id_config" SERIAL NOT NULL,
    "agency_quote_config_id" INTEGER NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "required_fields" JSONB,
    "hidden_fields" JSONB,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteConfig_pkey" PRIMARY KEY ("id_config")
);

-- CreateIndex
CREATE UNIQUE INDEX "agency_quote_id_unique" ON "Quote"("id_agency", "agency_quote_id");

-- CreateIndex
CREATE INDEX "agency_quote_idx" ON "Quote"("id_agency", "id_quote");

-- CreateIndex
CREATE INDEX "agency_quote_owner_idx" ON "Quote"("id_agency", "id_user");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteConfig_id_agency_key" ON "QuoteConfig"("id_agency");

-- CreateIndex
CREATE UNIQUE INDEX "agency_quote_config_id_unique" ON "QuoteConfig"("id_agency", "agency_quote_config_id");

-- CreateIndex
CREATE INDEX "QuoteConfig_id_agency_idx" ON "QuoteConfig"("id_agency");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteConfig" ADD CONSTRAINT "QuoteConfig_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
