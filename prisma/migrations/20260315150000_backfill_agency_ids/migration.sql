-- Add agency-scoped IDs and backfill existing data safely

-- Invoice: add id_agency + agency_invoice_id
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "id_agency" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "agency_invoice_id" INTEGER;

UPDATE "Invoice" i
SET "id_agency" = b."id_agency"
FROM "Booking" b
WHERE i."id_agency" IS NULL AND i."bookingId_booking" = b."id_booking";

UPDATE "Invoice" i
SET "id_agency" = c."id_agency"
FROM "Client" c
WHERE i."id_agency" IS NULL AND i."client_id" = c."id_client";

ALTER TABLE "Invoice" ALTER COLUMN "id_agency" SET NOT NULL;

WITH ordered AS (
  SELECT "id_invoice", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "issue_date", "id_invoice") AS seq
  FROM "Invoice"
)
UPDATE "Invoice" i
SET "agency_invoice_id" = ordered.seq
FROM ordered
WHERE i."id_invoice" = ordered."id_invoice" AND i."agency_invoice_id" IS NULL;

ALTER TABLE "Invoice" ALTER COLUMN "agency_invoice_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "agency_invoice_id_unique" ON "Invoice"("id_agency", "agency_invoice_id");
CREATE INDEX IF NOT EXISTS "Invoice_id_agency_idx" ON "Invoice"("id_agency");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_id_agency_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_id_agency_fkey"
      FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreditNote: add id_agency + agency_credit_note_id
ALTER TABLE "CreditNote" ADD COLUMN IF NOT EXISTS "id_agency" INTEGER;
ALTER TABLE "CreditNote" ADD COLUMN IF NOT EXISTS "agency_credit_note_id" INTEGER;

UPDATE "CreditNote" cn
SET "id_agency" = i."id_agency"
FROM "Invoice" i
WHERE cn."id_agency" IS NULL AND cn."invoiceId" = i."id_invoice";

ALTER TABLE "CreditNote" ALTER COLUMN "id_agency" SET NOT NULL;

WITH ordered AS (
  SELECT "id_credit_note", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "issue_date", "id_credit_note") AS seq
  FROM "CreditNote"
)
UPDATE "CreditNote" cn
SET "agency_credit_note_id" = ordered.seq
FROM ordered
WHERE cn."id_credit_note" = ordered."id_credit_note" AND cn."agency_credit_note_id" IS NULL;

ALTER TABLE "CreditNote" ALTER COLUMN "agency_credit_note_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "agency_credit_note_id_unique" ON "CreditNote"("id_agency", "agency_credit_note_id");
CREATE INDEX IF NOT EXISTS "CreditNote_id_agency_idx" ON "CreditNote"("id_agency");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditNote_id_agency_fkey') THEN
    ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_id_agency_fkey"
      FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AgencyBillingConfig
ALTER TABLE "AgencyBillingConfig" ADD COLUMN IF NOT EXISTS "agency_billing_config_id" INTEGER;
WITH ordered AS (
  SELECT "id_config", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "id_config") AS seq
  FROM "AgencyBillingConfig"
)
UPDATE "AgencyBillingConfig" c
SET "agency_billing_config_id" = ordered.seq
FROM ordered
WHERE c."id_config" = ordered."id_config" AND c."agency_billing_config_id" IS NULL;
ALTER TABLE "AgencyBillingConfig" ALTER COLUMN "agency_billing_config_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_config_id_unique" ON "AgencyBillingConfig"("id_agency", "agency_billing_config_id");

-- AgencyBillingAdjustment
ALTER TABLE "AgencyBillingAdjustment" ADD COLUMN IF NOT EXISTS "agency_billing_adjustment_id" INTEGER;
WITH ordered AS (
  SELECT "id_adjustment", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_adjustment") AS seq
  FROM "AgencyBillingAdjustment"
)
UPDATE "AgencyBillingAdjustment" a
SET "agency_billing_adjustment_id" = ordered.seq
FROM ordered
WHERE a."id_adjustment" = ordered."id_adjustment" AND a."agency_billing_adjustment_id" IS NULL;
ALTER TABLE "AgencyBillingAdjustment" ALTER COLUMN "agency_billing_adjustment_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_adjustment_id_unique" ON "AgencyBillingAdjustment"("id_agency", "agency_billing_adjustment_id");

-- AgencyBillingCharge
ALTER TABLE "AgencyBillingCharge" ADD COLUMN IF NOT EXISTS "agency_billing_charge_id" INTEGER;
WITH ordered AS (
  SELECT "id_charge", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_charge") AS seq
  FROM "AgencyBillingCharge"
)
UPDATE "AgencyBillingCharge" c
SET "agency_billing_charge_id" = ordered.seq
FROM ordered
WHERE c."id_charge" = ordered."id_charge" AND c."agency_billing_charge_id" IS NULL;
ALTER TABLE "AgencyBillingCharge" ALTER COLUMN "agency_billing_charge_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_billing_charge_id_unique" ON "AgencyBillingCharge"("id_agency", "agency_billing_charge_id");

-- ClientConfig
ALTER TABLE "ClientConfig" ADD COLUMN IF NOT EXISTS "agency_client_config_id" INTEGER;
WITH ordered AS (
  SELECT "id_config", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "id_config") AS seq
  FROM "ClientConfig"
)
UPDATE "ClientConfig" c
SET "agency_client_config_id" = ordered.seq
FROM ordered
WHERE c."id_config" = ordered."id_config" AND c."agency_client_config_id" IS NULL;
ALTER TABLE "ClientConfig" ALTER COLUMN "agency_client_config_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_client_config_id_unique" ON "ClientConfig"("id_agency", "agency_client_config_id");

-- CommissionRuleSet
ALTER TABLE "CommissionRuleSet" ADD COLUMN IF NOT EXISTS "agency_commission_rule_set_id" INTEGER;
WITH ordered AS (
  SELECT "id_rule_set", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "valid_from", "id_rule_set") AS seq
  FROM "CommissionRuleSet"
)
UPDATE "CommissionRuleSet" r
SET "agency_commission_rule_set_id" = ordered.seq
FROM ordered
WHERE r."id_rule_set" = ordered."id_rule_set" AND r."agency_commission_rule_set_id" IS NULL;
ALTER TABLE "CommissionRuleSet" ALTER COLUMN "agency_commission_rule_set_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_commission_rule_set_id_unique" ON "CommissionRuleSet"("id_agency", "agency_commission_rule_set_id");

-- CreditAccount
ALTER TABLE "CreditAccount" ADD COLUMN IF NOT EXISTS "agency_credit_account_id" INTEGER;
WITH ordered AS (
  SELECT "id_credit_account", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_credit_account") AS seq
  FROM "CreditAccount"
)
UPDATE "CreditAccount" a
SET "agency_credit_account_id" = ordered.seq
FROM ordered
WHERE a."id_credit_account" = ordered."id_credit_account" AND a."agency_credit_account_id" IS NULL;
ALTER TABLE "CreditAccount" ALTER COLUMN "agency_credit_account_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_credit_account_id_unique" ON "CreditAccount"("id_agency", "agency_credit_account_id");

-- CreditEntry
ALTER TABLE "CreditEntry" ADD COLUMN IF NOT EXISTS "agency_credit_entry_id" INTEGER;
WITH ordered AS (
  SELECT "id_entry", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_entry") AS seq
  FROM "CreditEntry"
)
UPDATE "CreditEntry" e
SET "agency_credit_entry_id" = ordered.seq
FROM ordered
WHERE e."id_entry" = ordered."id_entry" AND e."agency_credit_entry_id" IS NULL;
ALTER TABLE "CreditEntry" ALTER COLUMN "agency_credit_entry_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_credit_entry_id_unique" ON "CreditEntry"("id_agency", "agency_credit_entry_id");

-- ExpenseCategory
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "agency_expense_category_id" INTEGER;
WITH ordered AS (
  SELECT "id_category", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "sort_order", "id_category") AS seq
  FROM "ExpenseCategory"
)
UPDATE "ExpenseCategory" c
SET "agency_expense_category_id" = ordered.seq
FROM ordered
WHERE c."id_category" = ordered."id_category" AND c."agency_expense_category_id" IS NULL;
ALTER TABLE "ExpenseCategory" ALTER COLUMN "agency_expense_category_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_expense_category_id_unique" ON "ExpenseCategory"("id_agency", "agency_expense_category_id");

-- FinanceAccount
ALTER TABLE "FinanceAccount" ADD COLUMN IF NOT EXISTS "agency_finance_account_id" INTEGER;
WITH ordered AS (
  SELECT "id_account", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "sort_order", "id_account") AS seq
  FROM "FinanceAccount"
)
UPDATE "FinanceAccount" a
SET "agency_finance_account_id" = ordered.seq
FROM ordered
WHERE a."id_account" = ordered."id_account" AND a."agency_finance_account_id" IS NULL;
ALTER TABLE "FinanceAccount" ALTER COLUMN "agency_finance_account_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_finance_account_id_unique" ON "FinanceAccount"("id_agency", "agency_finance_account_id");

-- FinanceConfig
ALTER TABLE "FinanceConfig" ADD COLUMN IF NOT EXISTS "agency_finance_config_id" INTEGER;
WITH ordered AS (
  SELECT "id_config", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "id_config") AS seq
  FROM "FinanceConfig"
)
UPDATE "FinanceConfig" c
SET "agency_finance_config_id" = ordered.seq
FROM ordered
WHERE c."id_config" = ordered."id_config" AND c."agency_finance_config_id" IS NULL;
ALTER TABLE "FinanceConfig" ALTER COLUMN "agency_finance_config_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_finance_config_id_unique" ON "FinanceConfig"("id_agency", "agency_finance_config_id");

-- FinanceCurrency
ALTER TABLE "FinanceCurrency" ADD COLUMN IF NOT EXISTS "agency_finance_currency_id" INTEGER;
WITH ordered AS (
  SELECT "id_currency", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "sort_order", "id_currency") AS seq
  FROM "FinanceCurrency"
)
UPDATE "FinanceCurrency" c
SET "agency_finance_currency_id" = ordered.seq
FROM ordered
WHERE c."id_currency" = ordered."id_currency" AND c."agency_finance_currency_id" IS NULL;
ALTER TABLE "FinanceCurrency" ALTER COLUMN "agency_finance_currency_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_finance_currency_id_unique" ON "FinanceCurrency"("id_agency", "agency_finance_currency_id");

-- FinancePaymentMethod
ALTER TABLE "FinancePaymentMethod" ADD COLUMN IF NOT EXISTS "agency_finance_payment_method_id" INTEGER;
WITH ordered AS (
  SELECT "id_method", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "sort_order", "id_method") AS seq
  FROM "FinancePaymentMethod"
)
UPDATE "FinancePaymentMethod" m
SET "agency_finance_payment_method_id" = ordered.seq
FROM ordered
WHERE m."id_method" = ordered."id_method" AND m."agency_finance_payment_method_id" IS NULL;
ALTER TABLE "FinancePaymentMethod" ALTER COLUMN "agency_finance_payment_method_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_finance_payment_method_id_unique" ON "FinancePaymentMethod"("id_agency", "agency_finance_payment_method_id");

-- Operator
ALTER TABLE "Operator" ADD COLUMN IF NOT EXISTS "agency_operator_id" INTEGER;
WITH ordered AS (
  SELECT "id_operator", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "registration_date", "id_operator") AS seq
  FROM "Operator"
)
UPDATE "Operator" o
SET "agency_operator_id" = ordered.seq
FROM ordered
WHERE o."id_operator" = ordered."id_operator" AND o."agency_operator_id" IS NULL;
ALTER TABLE "Operator" ALTER COLUMN "agency_operator_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_operator_id_unique" ON "Operator"("id_agency", "agency_operator_id");

-- Resources
ALTER TABLE "Resources" ADD COLUMN IF NOT EXISTS "agency_resource_id" INTEGER;
WITH ordered AS (
  SELECT "id_resource", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "createdAt", "id_resource") AS seq
  FROM "Resources"
)
UPDATE "Resources" r
SET "agency_resource_id" = ordered.seq
FROM ordered
WHERE r."id_resource" = ordered."id_resource" AND r."agency_resource_id" IS NULL;
ALTER TABLE "Resources" ALTER COLUMN "agency_resource_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_resource_id_unique" ON "Resources"("id_agency", "agency_resource_id");

-- SalesTeam
ALTER TABLE "SalesTeam" ADD COLUMN IF NOT EXISTS "agency_sales_team_id" INTEGER;
WITH ordered AS (
  SELECT "id_team", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "id_team") AS seq
  FROM "SalesTeam"
)
UPDATE "SalesTeam" t
SET "agency_sales_team_id" = ordered.seq
FROM ordered
WHERE t."id_team" = ordered."id_team" AND t."agency_sales_team_id" IS NULL;
ALTER TABLE "SalesTeam" ALTER COLUMN "agency_sales_team_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_sales_team_id_unique" ON "SalesTeam"("id_agency", "agency_sales_team_id");

-- ServiceCalcConfig
ALTER TABLE "ServiceCalcConfig" ADD COLUMN IF NOT EXISTS "agency_service_calc_config_id" INTEGER;
WITH ordered AS (
  SELECT "id_config", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "id_config") AS seq
  FROM "ServiceCalcConfig"
)
UPDATE "ServiceCalcConfig" c
SET "agency_service_calc_config_id" = ordered.seq
FROM ordered
WHERE c."id_config" = ordered."id_config" AND c."agency_service_calc_config_id" IS NULL;
ALTER TABLE "ServiceCalcConfig" ALTER COLUMN "agency_service_calc_config_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_service_calc_config_id_unique" ON "ServiceCalcConfig"("id_agency", "agency_service_calc_config_id");

-- ServiceType
ALTER TABLE "ServiceType" ADD COLUMN IF NOT EXISTS "agency_service_type_id" INTEGER;
WITH ordered AS (
  SELECT "id_service_type", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "id_service_type") AS seq
  FROM "ServiceType"
)
UPDATE "ServiceType" t
SET "agency_service_type_id" = ordered.seq
FROM ordered
WHERE t."id_service_type" = ordered."id_service_type" AND t."agency_service_type_id" IS NULL;
ALTER TABLE "ServiceType" ALTER COLUMN "agency_service_type_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_service_type_id_unique" ON "ServiceType"("id_agency", "agency_service_type_id");

-- TemplateConfig
ALTER TABLE "TemplateConfig" ADD COLUMN IF NOT EXISTS "agency_template_config_id" INTEGER;
WITH ordered AS (
  SELECT "id_template", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_template") AS seq
  FROM "TemplateConfig"
)
UPDATE "TemplateConfig" t
SET "agency_template_config_id" = ordered.seq
FROM ordered
WHERE t."id_template" = ordered."id_template" AND t."agency_template_config_id" IS NULL;
ALTER TABLE "TemplateConfig" ALTER COLUMN "agency_template_config_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_template_config_id_unique" ON "TemplateConfig"("id_agency", "agency_template_config_id");

-- TextPreset
ALTER TABLE "TextPreset" ADD COLUMN IF NOT EXISTS "agency_text_preset_id" INTEGER;
WITH ordered AS (
  SELECT "id_preset", "id_agency",
         ROW_NUMBER() OVER (PARTITION BY "id_agency" ORDER BY "created_at", "id_preset") AS seq
  FROM "TextPreset"
)
UPDATE "TextPreset" p
SET "agency_text_preset_id" = ordered.seq
FROM ordered
WHERE p."id_preset" = ordered."id_preset" AND p."agency_text_preset_id" IS NULL;
ALTER TABLE "TextPreset" ALTER COLUMN "agency_text_preset_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "agency_text_preset_id_unique" ON "TextPreset"("id_agency", "agency_text_preset_id");

-- AgencyCounters for new keys
INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'agency_billing_adjustment'::"AgencyCounterKey", COALESCE(MAX("agency_billing_adjustment_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "AgencyBillingAdjustment"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'agency_billing_charge'::"AgencyCounterKey", COALESCE(MAX("agency_billing_charge_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "AgencyBillingCharge"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'agency_billing_config'::"AgencyCounterKey", COALESCE(MAX("agency_billing_config_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "AgencyBillingConfig"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'client_config'::"AgencyCounterKey", COALESCE(MAX("agency_client_config_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "ClientConfig"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'commission_rule_set'::"AgencyCounterKey", COALESCE(MAX("agency_commission_rule_set_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "CommissionRuleSet"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'credit_account'::"AgencyCounterKey", COALESCE(MAX("agency_credit_account_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "CreditAccount"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'credit_entry'::"AgencyCounterKey", COALESCE(MAX("agency_credit_entry_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "CreditEntry"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'credit_note'::"AgencyCounterKey", COALESCE(MAX("agency_credit_note_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "CreditNote"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'invoice'::"AgencyCounterKey", COALESCE(MAX("agency_invoice_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "Invoice"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'expense_category'::"AgencyCounterKey", COALESCE(MAX("agency_expense_category_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "ExpenseCategory"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'finance_account'::"AgencyCounterKey", COALESCE(MAX("agency_finance_account_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "FinanceAccount"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'finance_config'::"AgencyCounterKey", COALESCE(MAX("agency_finance_config_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "FinanceConfig"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'finance_currency'::"AgencyCounterKey", COALESCE(MAX("agency_finance_currency_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "FinanceCurrency"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'finance_payment_method'::"AgencyCounterKey", COALESCE(MAX("agency_finance_payment_method_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "FinancePaymentMethod"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'operator'::"AgencyCounterKey", COALESCE(MAX("agency_operator_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "Operator"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'resource'::"AgencyCounterKey", COALESCE(MAX("agency_resource_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "Resources"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'sales_team'::"AgencyCounterKey", COALESCE(MAX("agency_sales_team_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "SalesTeam"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'service_calc_config'::"AgencyCounterKey", COALESCE(MAX("agency_service_calc_config_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "ServiceCalcConfig"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'service_type'::"AgencyCounterKey", COALESCE(MAX("agency_service_type_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "ServiceType"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'template_config'::"AgencyCounterKey", COALESCE(MAX("agency_template_config_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "TemplateConfig"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "AgencyCounter" ("id_agency", "key", "next_value", "updated_at")
SELECT "id_agency", 'text_preset'::"AgencyCounterKey", COALESCE(MAX("agency_text_preset_id"), 0) + 1, CURRENT_TIMESTAMP
FROM "TextPreset"
GROUP BY "id_agency"
ON CONFLICT ("id_agency", "key") DO UPDATE
SET "next_value" = GREATEST("AgencyCounter"."next_value", EXCLUDED."next_value"),
    "updated_at" = CURRENT_TIMESTAMP;
