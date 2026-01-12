-- RenameIndex
ALTER INDEX "agency_booking_id_unique" RENAME TO "Booking_id_agency_agency_booking_id_key";

-- RenameIndex
ALTER INDEX "agency_client_id_unique" RENAME TO "Client_id_agency_agency_client_id_key";

-- RenameIndex
ALTER INDEX "agency_client_payment_id_unique" RENAME TO "ClientPayment_id_agency_agency_client_payment_id_key";

-- RenameIndex
ALTER INDEX "agency_investment_id_unique" RENAME TO "Investment_id_agency_agency_investment_id_key";

-- RenameIndex
ALTER INDEX "agency_operator_due_id_unique" RENAME TO "OperatorDue_id_agency_agency_operator_due_id_key";

-- RenameIndex
ALTER INDEX "agency_receipt_id_unique" RENAME TO "Receipt_id_agency_agency_receipt_id_key";

-- RenameIndex
ALTER INDEX "agency_service_id_unique" RENAME TO "Service_id_agency_agency_service_id_key";
