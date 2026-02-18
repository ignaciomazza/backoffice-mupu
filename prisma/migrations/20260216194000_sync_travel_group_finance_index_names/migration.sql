-- Keep travel-group finance indexes/defaults aligned with current schema.
-- This migration is idempotent on already-updated databases.

-- AlterTable
ALTER TABLE IF EXISTS "TravelGroupClientPayment" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "TravelGroupInvoice" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "TravelGroupInvoiceItem" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "TravelGroupOperatorDue" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "TravelGroupOperatorPayment" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE IF EXISTS "TravelGroupReceipt" ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupClientPayment_client_idx" RENAME TO "TravelGroupClientPayment_client_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupClientPayment_departure_idx" RENAME TO "TravelGroupClientPayment_travel_group_departure_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupClientPayment_due_idx" RENAME TO "TravelGroupClientPayment_due_date_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupClientPayment_group_idx" RENAME TO "TravelGroupClientPayment_id_agency_travel_group_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupClientPayment_passenger_idx" RENAME TO "TravelGroupClientPayment_travel_group_passenger_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "agency_travel_group_client_payment_id_unique" RENAME TO "TravelGroupClientPayment_id_agency_agency_travel_group_clie_key";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupInvoice_client_idx" RENAME TO "TravelGroupInvoice_client_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupInvoice_departure_idx" RENAME TO "TravelGroupInvoice_travel_group_departure_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupInvoice_group_idx" RENAME TO "TravelGroupInvoice_id_agency_travel_group_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupInvoice_issue_idx" RENAME TO "TravelGroupInvoice_issue_date_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupInvoice_passenger_idx" RENAME TO "TravelGroupInvoice_travel_group_passenger_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "agency_travel_group_invoice_id_unique" RENAME TO "TravelGroupInvoice_id_agency_agency_travel_group_invoice_id_key";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupInvoiceItem_invoice_idx" RENAME TO "TravelGroupInvoiceItem_travel_group_invoice_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupOperatorDue_departure_idx" RENAME TO "TravelGroupOperatorDue_travel_group_departure_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupOperatorDue_due_idx" RENAME TO "TravelGroupOperatorDue_due_date_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupOperatorDue_group_idx" RENAME TO "TravelGroupOperatorDue_id_agency_travel_group_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupOperatorDue_operator_idx" RENAME TO "TravelGroupOperatorDue_operator_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupOperatorDue_passenger_idx" RENAME TO "TravelGroupOperatorDue_travel_group_passenger_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "agency_travel_group_operator_due_id_unique" RENAME TO "TravelGroupOperatorDue_id_agency_agency_travel_group_operat_key";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupOperatorPayment_created_idx" RENAME TO "TravelGroupOperatorPayment_created_at_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupOperatorPayment_departure_idx" RENAME TO "TravelGroupOperatorPayment_travel_group_departure_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupOperatorPayment_group_idx" RENAME TO "TravelGroupOperatorPayment_id_agency_travel_group_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupOperatorPayment_operator_idx" RENAME TO "TravelGroupOperatorPayment_operator_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupOperatorPayment_passenger_idx" RENAME TO "TravelGroupOperatorPayment_travel_group_passenger_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "agency_travel_group_operator_payment_id_unique" RENAME TO "TravelGroupOperatorPayment_id_agency_agency_travel_group_op_key";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupReceipt_client_idx" RENAME TO "TravelGroupReceipt_client_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupReceipt_departure_idx" RENAME TO "TravelGroupReceipt_travel_group_departure_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupReceipt_group_idx" RENAME TO "TravelGroupReceipt_id_agency_travel_group_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupReceipt_issue_idx" RENAME TO "TravelGroupReceipt_issue_date_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "TravelGroupReceipt_passenger_idx" RENAME TO "TravelGroupReceipt_travel_group_passenger_id_idx";

-- RenameIndex
ALTER INDEX IF EXISTS "agency_travel_group_receipt_id_unique" RENAME TO "TravelGroupReceipt_id_agency_agency_travel_group_receipt_id_key";
