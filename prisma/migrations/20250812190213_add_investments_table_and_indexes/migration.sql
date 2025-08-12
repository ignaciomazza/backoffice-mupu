-- CreateTable
CREATE TABLE "Investment" (
    "id_investment" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "operator_id" INTEGER,
    "user_id" INTEGER,
    "created_by" INTEGER NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id_investment")
);

-- CreateIndex
CREATE INDEX "Investment_id_agency_category_idx" ON "Investment"("id_agency", "category");

-- CreateIndex
CREATE INDEX "Investment_created_at_idx" ON "Investment"("created_at");

-- CreateIndex
CREATE INDEX "Investment_paid_at_idx" ON "Investment"("paid_at");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "Operator"("id_operator") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;
