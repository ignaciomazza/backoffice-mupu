-- RenameIndex
ALTER INDEX IF EXISTS "finance_account_opening_balance_unique" RENAME TO "FinanceAccountOpeningBalance_id_agency_account_id_currency_key";
