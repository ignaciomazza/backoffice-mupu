ALTER TABLE "ReceiptPayment"
ADD COLUMN IF NOT EXISTS "payment_currency" TEXT,
ADD COLUMN IF NOT EXISTS "fee_mode" TEXT,
ADD COLUMN IF NOT EXISTS "fee_value" DECIMAL(18, 6),
ADD COLUMN IF NOT EXISTS "fee_amount" DECIMAL(18, 2);

ALTER TABLE "Investment"
ADD COLUMN IF NOT EXISTS "payment_fee_amount" DECIMAL(18, 2);

CREATE TABLE IF NOT EXISTS "InvestmentPayment" (
    "id_investment_payment" SERIAL NOT NULL,
    "investment_id" INTEGER NOT NULL,
    "amount" DECIMAL(18, 2) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "account" TEXT,
    "payment_currency" TEXT NOT NULL,
    "fee_mode" TEXT,
    "fee_value" DECIMAL(18, 6),
    "fee_amount" DECIMAL(18, 2),

    CONSTRAINT "InvestmentPayment_pkey" PRIMARY KEY ("id_investment_payment"),
    CONSTRAINT "InvestmentPayment_investment_id_fkey"
      FOREIGN KEY ("investment_id") REFERENCES "Investment"("id_investment")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "InvestmentPayment_investment_id_idx"
  ON "InvestmentPayment"("investment_id");
