-- Add custom fields support for clients and client config
ALTER TABLE "Client" ADD COLUMN "custom_fields" JSONB;
ALTER TABLE "ClientConfig" ADD COLUMN "required_fields" JSONB;
ALTER TABLE "ClientConfig" ADD COLUMN "custom_fields" JSONB;
