-- Add serviceIds array to Investment for operator payment associations
ALTER TABLE "Investment" ADD COLUMN IF NOT EXISTS "serviceIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
