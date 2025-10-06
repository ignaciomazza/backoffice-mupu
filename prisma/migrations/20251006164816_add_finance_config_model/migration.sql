-- CreateTable
CREATE TABLE "FinanceConfig" (
    "id_config" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "default_currency_code" TEXT NOT NULL,
    "hide_operator_expenses_in_investments" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceConfig_pkey" PRIMARY KEY ("id_config")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConfig_id_agency_key" ON "FinanceConfig"("id_agency");

-- CreateIndex
CREATE INDEX "FinanceConfig_id_agency_idx" ON "FinanceConfig"("id_agency");

-- AddForeignKey
ALTER TABLE "FinanceConfig" ADD CONSTRAINT "FinanceConfig_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
