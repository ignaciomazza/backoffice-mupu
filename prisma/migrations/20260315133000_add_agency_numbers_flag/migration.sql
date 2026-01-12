-- Add agency display flag for internal numbering
ALTER TABLE "Agency"
ADD COLUMN "use_agency_numbers" BOOLEAN NOT NULL DEFAULT true;
