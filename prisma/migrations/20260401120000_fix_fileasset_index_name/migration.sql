-- Ensure FileAsset unique index name is normalized
ALTER INDEX IF EXISTS "agency_file_id_unique" RENAME TO "FileAsset_id_agency_agency_file_id_key";
