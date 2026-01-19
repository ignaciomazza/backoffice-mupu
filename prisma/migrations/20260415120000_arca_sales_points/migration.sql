-- Add sales points tracking for ARCA config
ALTER TABLE "AgencyArcaConfig"
ADD COLUMN "salesPointsDetected" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

ALTER TABLE "AgencyArcaConfig"
ADD COLUMN "selectedSalesPoint" INTEGER;
