-- Extend AgencyCounterKey with credit and invoice keys
ALTER TYPE "AgencyCounterKey" ADD VALUE IF NOT EXISTS 'credit_account';
ALTER TYPE "AgencyCounterKey" ADD VALUE IF NOT EXISTS 'credit_entry';
ALTER TYPE "AgencyCounterKey" ADD VALUE IF NOT EXISTS 'invoice';
ALTER TYPE "AgencyCounterKey" ADD VALUE IF NOT EXISTS 'credit_note';
