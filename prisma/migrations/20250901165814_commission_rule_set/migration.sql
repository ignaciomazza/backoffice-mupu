-- CreateTable
CREATE TABLE "CommissionRuleSet" (
    "id_rule_set" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "own_pct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "CommissionRuleSet_pkey" PRIMARY KEY ("id_rule_set")
);

-- CreateTable
CREATE TABLE "CommissionShare" (
    "id_share" SERIAL NOT NULL,
    "rule_set_id" INTEGER NOT NULL,
    "beneficiary_user_id" INTEGER NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "CommissionShare_pkey" PRIMARY KEY ("id_share")
);

-- CreateIndex
CREATE INDEX "CommissionRuleSet_id_agency_owner_user_id_valid_from_idx" ON "CommissionRuleSet"("id_agency", "owner_user_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionShare_rule_set_id_beneficiary_user_id_key" ON "CommissionShare"("rule_set_id", "beneficiary_user_id");

-- AddForeignKey
ALTER TABLE "CommissionRuleSet" ADD CONSTRAINT "CommissionRuleSet_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRuleSet" ADD CONSTRAINT "CommissionRuleSet_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "User"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionShare" ADD CONSTRAINT "CommissionShare_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "CommissionRuleSet"("id_rule_set") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionShare" ADD CONSTRAINT "CommissionShare_beneficiary_user_id_fkey" FOREIGN KEY ("beneficiary_user_id") REFERENCES "User"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;
