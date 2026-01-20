-- CreateTable
CREATE TABLE "AgencyBillingConfig" (
    "id_config" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "plan_key" TEXT NOT NULL DEFAULT 'basico',
    "billing_users" INTEGER NOT NULL DEFAULT 3,
    "user_limit" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "start_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyBillingConfig_pkey" PRIMARY KEY ("id_config")
);

-- CreateTable
CREATE TABLE "AgencyBillingAdjustment" (
    "id_adjustment" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "currency" TEXT,
    "label" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyBillingAdjustment_pkey" PRIMARY KEY ("id_adjustment")
);

-- CreateTable
CREATE TABLE "AgencyBillingCharge" (
    "id_charge" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "charge_kind" TEXT NOT NULL DEFAULT 'RECURRING',
    "label" TEXT,
    "base_amount_usd" DECIMAL(18,2) NOT NULL,
    "adjustments_total_usd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_usd" DECIMAL(18,2) NOT NULL,
    "paid_amount" DECIMAL(18,2),
    "paid_currency" TEXT,
    "fx_rate" DECIMAL(18,6),
    "paid_at" TIMESTAMP(3),
    "account" TEXT,
    "payment_method" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyBillingCharge_pkey" PRIMARY KEY ("id_charge")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgencyBillingConfig_id_agency_key" ON "AgencyBillingConfig"("id_agency");

-- CreateIndex
CREATE INDEX "AgencyBillingConfig_id_agency_idx" ON "AgencyBillingConfig"("id_agency");

-- CreateIndex
CREATE INDEX "AgencyBillingConfig_plan_key_idx" ON "AgencyBillingConfig"("plan_key");

-- CreateIndex
CREATE INDEX "AgencyBillingAdjustment_id_agency_active_idx" ON "AgencyBillingAdjustment"("id_agency", "active");

-- CreateIndex
CREATE INDEX "AgencyBillingAdjustment_id_agency_kind_idx" ON "AgencyBillingAdjustment"("id_agency", "kind");

-- CreateIndex
CREATE INDEX "AgencyBillingAdjustment_starts_at_idx" ON "AgencyBillingAdjustment"("starts_at");

-- CreateIndex
CREATE INDEX "AgencyBillingAdjustment_ends_at_idx" ON "AgencyBillingAdjustment"("ends_at");

-- CreateIndex
CREATE INDEX "AgencyBillingCharge_id_agency_status_idx" ON "AgencyBillingCharge"("id_agency", "status");

-- CreateIndex
CREATE INDEX "AgencyBillingCharge_id_agency_due_date_idx" ON "AgencyBillingCharge"("id_agency", "due_date");

-- CreateIndex
CREATE INDEX "AgencyBillingCharge_id_agency_period_start_idx" ON "AgencyBillingCharge"("id_agency", "period_start");

-- AddForeignKey
ALTER TABLE "AgencyBillingConfig" ADD CONSTRAINT "AgencyBillingConfig_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyBillingAdjustment" ADD CONSTRAINT "AgencyBillingAdjustment_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyBillingCharge" ADD CONSTRAINT "AgencyBillingCharge_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
