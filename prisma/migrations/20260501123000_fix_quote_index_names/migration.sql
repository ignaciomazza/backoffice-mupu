-- Align quote index names across environments
ALTER INDEX IF EXISTS "agency_quote_id_unique" RENAME TO "Quote_id_agency_agency_quote_id_key";
ALTER INDEX IF EXISTS "agency_quote_config_id_unique" RENAME TO "QuoteConfig_id_agency_agency_quote_config_id_key";
