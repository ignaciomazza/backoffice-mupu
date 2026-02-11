-- CreateTable
CREATE TABLE "FinanceTransfer" (
    "id_transfer" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "transfer_date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "origin_account_id" INTEGER,
    "origin_method_id" INTEGER,
    "origin_currency" TEXT NOT NULL,
    "origin_amount" DECIMAL(18,2) NOT NULL,
    "destination_account_id" INTEGER,
    "destination_method_id" INTEGER,
    "destination_currency" TEXT NOT NULL,
    "destination_amount" DECIMAL(18,2) NOT NULL,
    "fx_rate" DECIMAL(18,6),
    "fee_amount" DECIMAL(18,2),
    "fee_currency" TEXT,
    "fee_account_id" INTEGER,
    "fee_method_id" INTEGER,
    "fee_note" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" INTEGER,
    "delete_reason" TEXT,

    CONSTRAINT "FinanceTransfer_pkey" PRIMARY KEY ("id_transfer")
);

-- CreateTable
CREATE TABLE "FinanceAccountAdjustment" (
    "id_adjustment" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "audit_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccountAdjustment_pkey" PRIMARY KEY ("id_adjustment")
);

-- CreateTable
CREATE TABLE "FinanceAccountAudit" (
    "id_audit" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "expected_balance" DECIMAL(18,2) NOT NULL,
    "actual_balance" DECIMAL(18,2) NOT NULL,
    "difference" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "create_adjustment" BOOLEAN NOT NULL DEFAULT false,
    "adjustment_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAccountAudit_pkey" PRIMARY KEY ("id_audit")
);

-- CreateTable
CREATE TABLE "FinanceMonthLock" (
    "id_lock" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "locked_by" INTEGER,
    "locked_at" TIMESTAMP(3),
    "unlocked_by" INTEGER,
    "unlocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMonthLock_pkey" PRIMARY KEY ("id_lock")
);

-- CreateTable
CREATE TABLE "FinanceMonthLockEvent" (
    "id_event" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "acted_by" INTEGER,
    "acted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceMonthLockEvent_pkey" PRIMARY KEY ("id_event")
);

-- CreateIndex
CREATE INDEX "FinanceTransfer_id_agency_transfer_date_idx" ON "FinanceTransfer"("id_agency", "transfer_date");

-- CreateIndex
CREATE INDEX "FinanceTransfer_id_agency_origin_account_id_idx" ON "FinanceTransfer"("id_agency", "origin_account_id");

-- CreateIndex
CREATE INDEX "FinanceTransfer_id_agency_destination_account_id_idx" ON "FinanceTransfer"("id_agency", "destination_account_id");

-- CreateIndex
CREATE INDEX "FinanceTransfer_id_agency_deleted_at_idx" ON "FinanceTransfer"("id_agency", "deleted_at");

-- CreateIndex
CREATE INDEX "FinanceAccountAdjustment_id_agency_account_id_currency_effective_date_idx" ON "FinanceAccountAdjustment"("id_agency", "account_id", "currency", "effective_date");

-- CreateIndex
CREATE INDEX "FinanceAccountAdjustment_id_agency_effective_date_idx" ON "FinanceAccountAdjustment"("id_agency", "effective_date");

-- CreateIndex
CREATE INDEX "FinanceAccountAdjustment_audit_id_idx" ON "FinanceAccountAdjustment"("audit_id");

-- CreateIndex
CREATE INDEX "FinanceAccountAudit_id_agency_account_id_currency_year_month_idx" ON "FinanceAccountAudit"("id_agency", "account_id", "currency", "year", "month");

-- CreateIndex
CREATE INDEX "FinanceAccountAudit_id_agency_year_month_idx" ON "FinanceAccountAudit"("id_agency", "year", "month");

-- CreateIndex
CREATE INDEX "FinanceAccountAudit_adjustment_id_idx" ON "FinanceAccountAudit"("adjustment_id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceMonthLock_id_agency_year_month_key" ON "FinanceMonthLock"("id_agency", "year", "month");

-- CreateIndex
CREATE INDEX "FinanceMonthLock_id_agency_is_locked_idx" ON "FinanceMonthLock"("id_agency", "is_locked");

-- CreateIndex
CREATE INDEX "FinanceMonthLockEvent_id_agency_year_month_acted_at_idx" ON "FinanceMonthLockEvent"("id_agency", "year", "month", "acted_at");

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountAdjustment" ADD CONSTRAINT "FinanceAccountAdjustment_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccountAudit" ADD CONSTRAINT "FinanceAccountAudit_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMonthLock" ADD CONSTRAINT "FinanceMonthLock_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMonthLockEvent" ADD CONSTRAINT "FinanceMonthLockEvent_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
