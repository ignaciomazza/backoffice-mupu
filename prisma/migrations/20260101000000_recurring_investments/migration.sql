-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "recurring_id" INTEGER;

-- CreateTable
CREATE TABLE "RecurringInvestment" (
    "id_recurring" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "payment_method" TEXT,
    "account" TEXT,
    "base_amount" DECIMAL(18,2),
    "base_currency" TEXT,
    "counter_amount" DECIMAL(18,2),
    "counter_currency" TEXT,
    "operator_id" INTEGER,
    "user_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "day_of_month" INTEGER NOT NULL,
    "interval_months" INTEGER NOT NULL DEFAULT 1,
    "last_run" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringInvestment_pkey" PRIMARY KEY ("id_recurring")
);

-- CreateIndex
CREATE INDEX "Investment_recurring_id_idx" ON "Investment"("recurring_id");

-- CreateIndex
CREATE UNIQUE INDEX "Investment_recurring_id_paid_at_key" ON "Investment"("recurring_id", "paid_at");

-- CreateIndex
CREATE INDEX "RecurringInvestment_id_agency_active_idx" ON "RecurringInvestment"("id_agency", "active");

-- CreateIndex
CREATE INDEX "RecurringInvestment_start_date_idx" ON "RecurringInvestment"("start_date");

-- CreateIndex
CREATE INDEX "RecurringInvestment_last_run_idx" ON "RecurringInvestment"("last_run");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "RecurringInvestment"("id_recurring") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvestment" ADD CONSTRAINT "RecurringInvestment_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvestment" ADD CONSTRAINT "RecurringInvestment_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "Operator"("id_operator") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvestment" ADD CONSTRAINT "RecurringInvestment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvestment" ADD CONSTRAINT "RecurringInvestment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;
