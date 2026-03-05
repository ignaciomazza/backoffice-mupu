-- Make birth date optional for client profiles that do not require it
ALTER TABLE "Client"
ALTER COLUMN "birth_date" DROP NOT NULL;
