-- AlterTable
ALTER TABLE "TravelGroupClientPayment" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TravelGroupInvoice" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TravelGroupInvoiceItem" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TravelGroupOperatorDue" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TravelGroupOperatorPayment" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TravelGroupReceipt" ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "TravelGroupClientPayment_client_idx" RENAME TO "TravelGroupClientPayment_client_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupClientPayment_departure_idx" RENAME TO "TravelGroupClientPayment_travel_group_departure_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupClientPayment_due_idx" RENAME TO "TravelGroupClientPayment_due_date_idx";

-- RenameIndex
ALTER INDEX "TravelGroupClientPayment_group_idx" RENAME TO "TravelGroupClientPayment_id_agency_travel_group_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupClientPayment_passenger_idx" RENAME TO "TravelGroupClientPayment_travel_group_passenger_id_idx";

-- RenameIndex
ALTER INDEX "agency_travel_group_client_payment_id_unique" RENAME TO "TravelGroupClientPayment_id_agency_agency_travel_group_clie_key";

-- RenameIndex
ALTER INDEX "TravelGroupInvoice_client_idx" RENAME TO "TravelGroupInvoice_client_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupInvoice_departure_idx" RENAME TO "TravelGroupInvoice_travel_group_departure_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupInvoice_group_idx" RENAME TO "TravelGroupInvoice_id_agency_travel_group_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupInvoice_issue_idx" RENAME TO "TravelGroupInvoice_issue_date_idx";

-- RenameIndex
ALTER INDEX "TravelGroupInvoice_passenger_idx" RENAME TO "TravelGroupInvoice_travel_group_passenger_id_idx";

-- RenameIndex
ALTER INDEX "agency_travel_group_invoice_id_unique" RENAME TO "TravelGroupInvoice_id_agency_agency_travel_group_invoice_id_key";

-- RenameIndex
ALTER INDEX "TravelGroupInvoiceItem_invoice_idx" RENAME TO "TravelGroupInvoiceItem_travel_group_invoice_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupOperatorDue_departure_idx" RENAME TO "TravelGroupOperatorDue_travel_group_departure_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupOperatorDue_due_idx" RENAME TO "TravelGroupOperatorDue_due_date_idx";

-- RenameIndex
ALTER INDEX "TravelGroupOperatorDue_group_idx" RENAME TO "TravelGroupOperatorDue_id_agency_travel_group_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupOperatorDue_operator_idx" RENAME TO "TravelGroupOperatorDue_operator_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupOperatorDue_passenger_idx" RENAME TO "TravelGroupOperatorDue_travel_group_passenger_id_idx";

-- RenameIndex
ALTER INDEX "agency_travel_group_operator_due_id_unique" RENAME TO "TravelGroupOperatorDue_id_agency_agency_travel_group_operat_key";

-- RenameIndex
ALTER INDEX "TravelGroupOperatorPayment_created_idx" RENAME TO "TravelGroupOperatorPayment_created_at_idx";

-- RenameIndex
ALTER INDEX "TravelGroupOperatorPayment_departure_idx" RENAME TO "TravelGroupOperatorPayment_travel_group_departure_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupOperatorPayment_group_idx" RENAME TO "TravelGroupOperatorPayment_id_agency_travel_group_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupOperatorPayment_operator_idx" RENAME TO "TravelGroupOperatorPayment_operator_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupOperatorPayment_passenger_idx" RENAME TO "TravelGroupOperatorPayment_travel_group_passenger_id_idx";

-- RenameIndex
ALTER INDEX "agency_travel_group_operator_payment_id_unique" RENAME TO "TravelGroupOperatorPayment_id_agency_agency_travel_group_op_key";

-- RenameIndex
ALTER INDEX "TravelGroupReceipt_client_idx" RENAME TO "TravelGroupReceipt_client_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupReceipt_departure_idx" RENAME TO "TravelGroupReceipt_travel_group_departure_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupReceipt_group_idx" RENAME TO "TravelGroupReceipt_id_agency_travel_group_id_idx";

-- RenameIndex
ALTER INDEX "TravelGroupReceipt_issue_idx" RENAME TO "TravelGroupReceipt_issue_date_idx";

-- RenameIndex
ALTER INDEX "TravelGroupReceipt_passenger_idx" RENAME TO "TravelGroupReceipt_travel_group_passenger_id_idx";

-- RenameIndex
ALTER INDEX "agency_travel_group_receipt_id_unique" RENAME TO "TravelGroupReceipt_id_agency_agency_travel_group_receipt_id_key";
