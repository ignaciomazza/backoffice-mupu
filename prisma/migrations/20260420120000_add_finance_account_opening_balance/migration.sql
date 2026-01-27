-- CreateTable
CREATE TABLE "FinanceAccountOpeningBalance" (
    "id_opening_balance" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccountOpeningBalance_pkey" PRIMARY KEY ("id_opening_balance")
);

-- CreateIndex
CREATE INDEX "FinanceAccountOpeningBalance_id_agency_idx" ON "FinanceAccountOpeningBalance"("id_agency");

-- CreateIndex
CREATE INDEX "FinanceAccountOpeningBalance_account_id_idx" ON "FinanceAccountOpeningBalance"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccountOpeningBalance_id_agency_account_id_currency_key" ON "FinanceAccountOpeningBalance"("id_agency", "account_id", "currency");

-- AddForeignKey
ALTER TABLE "FinanceAccountOpeningBalance" ADD CONSTRAINT "FinanceAccountOpeningBalance_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountOpeningBalance" ADD CONSTRAINT "FinanceAccountOpeningBalance_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "FinanceAccount"("id_account") ON DELETE CASCADE ON UPDATE CASCADE;
