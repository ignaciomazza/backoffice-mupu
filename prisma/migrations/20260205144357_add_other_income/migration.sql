-- CreateTable
CREATE TABLE "OtherIncome" (
    "id_other_income" SERIAL NOT NULL,
    "agency_other_income_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_fee_amount" DECIMAL(18,2),
    "payment_method_id" INTEGER,
    "account_id" INTEGER,
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "verified_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,

    CONSTRAINT "OtherIncome_pkey" PRIMARY KEY ("id_other_income")
);

-- CreateTable
CREATE TABLE "OtherIncomePayment" (
    "id_other_income_payment" SERIAL NOT NULL,
    "other_income_id" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_method_id" INTEGER NOT NULL,
    "account_id" INTEGER,

    CONSTRAINT "OtherIncomePayment_pkey" PRIMARY KEY ("id_other_income_payment")
);

-- CreateIndex
CREATE INDEX "OtherIncome_id_agency_idx" ON "OtherIncome"("id_agency");

-- CreateIndex
CREATE INDEX "OtherIncome_issue_date_idx" ON "OtherIncome"("issue_date");

-- CreateIndex
CREATE INDEX "OtherIncome_verification_status_idx" ON "OtherIncome"("verification_status");

-- CreateIndex
CREATE INDEX "OtherIncome_verified_by_idx" ON "OtherIncome"("verified_by");

-- CreateIndex
CREATE UNIQUE INDEX "OtherIncome_id_agency_agency_other_income_id_key" ON "OtherIncome"("id_agency", "agency_other_income_id");

-- CreateIndex
CREATE INDEX "OtherIncomePayment_other_income_id_idx" ON "OtherIncomePayment"("other_income_id");

-- AddForeignKey
ALTER TABLE "OtherIncome" ADD CONSTRAINT "OtherIncome_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherIncome" ADD CONSTRAINT "OtherIncome_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherIncome" ADD CONSTRAINT "OtherIncome_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherIncomePayment" ADD CONSTRAINT "OtherIncomePayment_other_income_id_fkey" FOREIGN KEY ("other_income_id") REFERENCES "OtherIncome"("id_other_income") ON DELETE CASCADE ON UPDATE CASCADE;
