ALTER TABLE "Client"
ADD COLUMN "profile_key" TEXT NOT NULL DEFAULT 'persona';

ALTER TABLE "ClientConfig"
ADD COLUMN "profiles" JSONB;

UPDATE "ClientConfig"
SET "profiles" = jsonb_build_array(
  jsonb_build_object(
    'key', 'persona',
    'label', 'Pax',
    'required_fields', COALESCE(
      "required_fields",
      '["first_name","last_name","phone","birth_date","nationality","gender","document_any"]'::jsonb
    ),
    'hidden_fields', COALESCE("hidden_fields", '[]'::jsonb),
    'custom_fields', COALESCE("custom_fields", '[]'::jsonb)
  )
)
WHERE "profiles" IS NULL;

CREATE INDEX "Client_id_agency_profile_key_idx"
ON "Client"("id_agency", "profile_key");
