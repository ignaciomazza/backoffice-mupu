-- CreateTable
CREATE TABLE "CreditAccount" (
    "id_credit_account" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "subject_type" TEXT NOT NULL,
    "operator_id" INTEGER,
    "client_id" INTEGER,
    "currency" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit_limit" DECIMAL(18,2),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id_credit_account")
);

-- CreateTable
CREATE TABLE "CreditEntry" (
    "id_entry" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value_date" TIMESTAMP(3),
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "booking_id" INTEGER,
    "receipt_id" INTEGER,
    "investment_id" INTEGER,
    "operator_due_id" INTEGER,
    "doc_type" TEXT,
    "reference" TEXT,
    "created_by" INTEGER,

    CONSTRAINT "CreditEntry_pkey" PRIMARY KEY ("id_entry")
);

-- CreateIndex
CREATE INDEX "CreditAccount_id_agency_subject_type_idx" ON "CreditAccount"("id_agency", "subject_type");

-- CreateIndex
CREATE INDEX "CreditAccount_operator_id_idx" ON "CreditAccount"("operator_id");

-- CreateIndex
CREATE INDEX "CreditAccount_client_id_idx" ON "CreditAccount"("client_id");

-- CreateIndex
CREATE INDEX "CreditAccount_currency_idx" ON "CreditAccount"("currency");

-- CreateIndex
CREATE INDEX "CreditEntry_account_id_idx" ON "CreditEntry"("account_id");

-- CreateIndex
CREATE INDEX "CreditEntry_id_agency_created_at_idx" ON "CreditEntry"("id_agency", "created_at");

-- CreateIndex
CREATE INDEX "CreditEntry_booking_id_idx" ON "CreditEntry"("booking_id");

-- CreateIndex
CREATE INDEX "CreditEntry_receipt_id_idx" ON "CreditEntry"("receipt_id");

-- CreateIndex
CREATE INDEX "CreditEntry_investment_id_idx" ON "CreditEntry"("investment_id");

-- CreateIndex
CREATE INDEX "CreditEntry_operator_due_id_idx" ON "CreditEntry"("operator_due_id");

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "Operator"("id_operator") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id_client") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "CreditAccount"("id_credit_account") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id_booking") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "Receipt"("id_receipt") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "Investment"("id_investment") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_operator_due_id_fkey" FOREIGN KEY ("operator_due_id") REFERENCES "OperatorDue"("id_due") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;
