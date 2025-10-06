-- CreateTable
CREATE TABLE "FinanceCurrency" (
    "id_currency" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "lock_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCurrency_pkey" PRIMARY KEY ("id_currency")
);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id_account" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "alias" TEXT,
    "cbu" TEXT,
    "currency" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "lock_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id_account")
);

-- CreateTable
CREATE TABLE "FinancePaymentMethod" (
    "id_method" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "requires_account" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "lock_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancePaymentMethod_pkey" PRIMARY KEY ("id_method")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id_category" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "requires_operator" BOOLEAN NOT NULL DEFAULT false,
    "requires_user" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "lock_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id_category")
);

-- CreateIndex
CREATE INDEX "FinanceCurrency_id_agency_enabled_idx" ON "FinanceCurrency"("id_agency", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCurrency_id_agency_code_key" ON "FinanceCurrency"("id_agency", "code");

-- CreateIndex
CREATE INDEX "FinanceAccount_id_agency_enabled_idx" ON "FinanceAccount"("id_agency", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_id_agency_name_key" ON "FinanceAccount"("id_agency", "name");

-- CreateIndex
CREATE INDEX "FinancePaymentMethod_id_agency_enabled_idx" ON "FinancePaymentMethod"("id_agency", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePaymentMethod_id_agency_code_key" ON "FinancePaymentMethod"("id_agency", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePaymentMethod_id_agency_name_key" ON "FinancePaymentMethod"("id_agency", "name");

-- CreateIndex
CREATE INDEX "ExpenseCategory_id_agency_enabled_idx" ON "ExpenseCategory"("id_agency", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_id_agency_name_key" ON "ExpenseCategory"("id_agency", "name");

-- AddForeignKey
ALTER TABLE "FinanceCurrency" ADD CONSTRAINT "FinanceCurrency_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePaymentMethod" ADD CONSTRAINT "FinancePaymentMethod_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
