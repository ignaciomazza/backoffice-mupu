-- Travel-group specific finance persistence (isolated from booking tables)

CREATE TABLE IF NOT EXISTS "TravelGroupClientPayment" (
    "id_travel_group_client_payment" SERIAL NOT NULL,
    "agency_travel_group_client_payment_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "travel_group_id" INTEGER NOT NULL,
    "travel_group_departure_id" INTEGER,
    "travel_group_passenger_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "concept" TEXT,
    "service_ref" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "paid_at" TIMESTAMP(3),
    "paid_by" INTEGER,
    "status_reason" TEXT,
    "receipt_id" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelGroupClientPayment_pkey" PRIMARY KEY ("id_travel_group_client_payment")
);

CREATE TABLE IF NOT EXISTS "TravelGroupReceipt" (
    "id_travel_group_receipt" SERIAL NOT NULL,
    "agency_travel_group_receipt_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "travel_group_id" INTEGER NOT NULL,
    "travel_group_departure_id" INTEGER,
    "travel_group_passenger_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(18,2) NOT NULL,
    "amount_string" TEXT NOT NULL,
    "amount_currency" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "payment_method" TEXT,
    "payment_fee_amount" DECIMAL(18,2),
    "account" TEXT,
    "base_amount" DECIMAL(18,2),
    "base_currency" TEXT,
    "counter_amount" DECIMAL(18,2),
    "counter_currency" TEXT,
    "client_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "service_refs" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelGroupReceipt_pkey" PRIMARY KEY ("id_travel_group_receipt")
);

CREATE TABLE IF NOT EXISTS "TravelGroupOperatorDue" (
    "id_travel_group_operator_due" SERIAL NOT NULL,
    "agency_travel_group_operator_due_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "travel_group_id" INTEGER NOT NULL,
    "travel_group_departure_id" INTEGER,
    "travel_group_passenger_id" INTEGER,
    "operator_id" INTEGER,
    "concept" TEXT NOT NULL,
    "service_ref" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelGroupOperatorDue_pkey" PRIMARY KEY ("id_travel_group_operator_due")
);

CREATE TABLE IF NOT EXISTS "TravelGroupOperatorPayment" (
    "id_travel_group_operator_payment" SERIAL NOT NULL,
    "agency_travel_group_operator_payment_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "travel_group_id" INTEGER NOT NULL,
    "travel_group_departure_id" INTEGER,
    "travel_group_passenger_id" INTEGER,
    "operator_id" INTEGER,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "payment_method" TEXT,
    "account" TEXT,
    "base_amount" DECIMAL(18,2),
    "base_currency" TEXT,
    "counter_amount" DECIMAL(18,2),
    "counter_currency" TEXT,
    "service_refs" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "payload" JSONB,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelGroupOperatorPayment_pkey" PRIMARY KEY ("id_travel_group_operator_payment")
);

CREATE TABLE IF NOT EXISTS "TravelGroupInvoice" (
    "id_travel_group_invoice" SERIAL NOT NULL,
    "agency_travel_group_invoice_id" INTEGER,
    "id_agency" INTEGER NOT NULL,
    "travel_group_id" INTEGER NOT NULL,
    "travel_group_departure_id" INTEGER,
    "travel_group_passenger_id" INTEGER,
    "client_id" INTEGER NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoice_number" TEXT NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "exchange_rate" DECIMAL(18,6),
    "tipo_factura" INTEGER,
    "service_refs" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "payload_afip" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelGroupInvoice_pkey" PRIMARY KEY ("id_travel_group_invoice")
);

CREATE TABLE IF NOT EXISTS "TravelGroupInvoiceItem" (
    "id_travel_group_invoice_item" SERIAL NOT NULL,
    "travel_group_invoice_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "tax_category" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelGroupInvoiceItem_pkey" PRIMARY KEY ("id_travel_group_invoice_item")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agency_travel_group_client_payment_id_unique"
    ON "TravelGroupClientPayment"("id_agency", "agency_travel_group_client_payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agency_travel_group_receipt_id_unique"
    ON "TravelGroupReceipt"("id_agency", "agency_travel_group_receipt_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agency_travel_group_operator_due_id_unique"
    ON "TravelGroupOperatorDue"("id_agency", "agency_travel_group_operator_due_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agency_travel_group_operator_payment_id_unique"
    ON "TravelGroupOperatorPayment"("id_agency", "agency_travel_group_operator_payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agency_travel_group_invoice_id_unique"
    ON "TravelGroupInvoice"("id_agency", "agency_travel_group_invoice_id");

CREATE INDEX IF NOT EXISTS "TravelGroupClientPayment_group_idx"
    ON "TravelGroupClientPayment"("id_agency", "travel_group_id");
CREATE INDEX IF NOT EXISTS "TravelGroupClientPayment_departure_idx"
    ON "TravelGroupClientPayment"("travel_group_departure_id");
CREATE INDEX IF NOT EXISTS "TravelGroupClientPayment_passenger_idx"
    ON "TravelGroupClientPayment"("travel_group_passenger_id");
CREATE INDEX IF NOT EXISTS "TravelGroupClientPayment_client_idx"
    ON "TravelGroupClientPayment"("client_id");
CREATE INDEX IF NOT EXISTS "TravelGroupClientPayment_due_idx"
    ON "TravelGroupClientPayment"("due_date");
CREATE INDEX IF NOT EXISTS "TravelGroupClientPayment_status_idx"
    ON "TravelGroupClientPayment"("status");

CREATE INDEX IF NOT EXISTS "TravelGroupReceipt_group_idx"
    ON "TravelGroupReceipt"("id_agency", "travel_group_id");
CREATE INDEX IF NOT EXISTS "TravelGroupReceipt_departure_idx"
    ON "TravelGroupReceipt"("travel_group_departure_id");
CREATE INDEX IF NOT EXISTS "TravelGroupReceipt_passenger_idx"
    ON "TravelGroupReceipt"("travel_group_passenger_id");
CREATE INDEX IF NOT EXISTS "TravelGroupReceipt_client_idx"
    ON "TravelGroupReceipt"("client_id");
CREATE INDEX IF NOT EXISTS "TravelGroupReceipt_issue_idx"
    ON "TravelGroupReceipt"("issue_date");

CREATE INDEX IF NOT EXISTS "TravelGroupOperatorDue_group_idx"
    ON "TravelGroupOperatorDue"("id_agency", "travel_group_id");
CREATE INDEX IF NOT EXISTS "TravelGroupOperatorDue_departure_idx"
    ON "TravelGroupOperatorDue"("travel_group_departure_id");
CREATE INDEX IF NOT EXISTS "TravelGroupOperatorDue_passenger_idx"
    ON "TravelGroupOperatorDue"("travel_group_passenger_id");
CREATE INDEX IF NOT EXISTS "TravelGroupOperatorDue_operator_idx"
    ON "TravelGroupOperatorDue"("operator_id");
CREATE INDEX IF NOT EXISTS "TravelGroupOperatorDue_due_idx"
    ON "TravelGroupOperatorDue"("due_date");
CREATE INDEX IF NOT EXISTS "TravelGroupOperatorDue_status_idx"
    ON "TravelGroupOperatorDue"("status");

CREATE INDEX IF NOT EXISTS "TravelGroupOperatorPayment_group_idx"
    ON "TravelGroupOperatorPayment"("id_agency", "travel_group_id");
CREATE INDEX IF NOT EXISTS "TravelGroupOperatorPayment_departure_idx"
    ON "TravelGroupOperatorPayment"("travel_group_departure_id");
CREATE INDEX IF NOT EXISTS "TravelGroupOperatorPayment_passenger_idx"
    ON "TravelGroupOperatorPayment"("travel_group_passenger_id");
CREATE INDEX IF NOT EXISTS "TravelGroupOperatorPayment_operator_idx"
    ON "TravelGroupOperatorPayment"("operator_id");
CREATE INDEX IF NOT EXISTS "TravelGroupOperatorPayment_created_idx"
    ON "TravelGroupOperatorPayment"("created_at");

CREATE INDEX IF NOT EXISTS "TravelGroupInvoice_group_idx"
    ON "TravelGroupInvoice"("id_agency", "travel_group_id");
CREATE INDEX IF NOT EXISTS "TravelGroupInvoice_departure_idx"
    ON "TravelGroupInvoice"("travel_group_departure_id");
CREATE INDEX IF NOT EXISTS "TravelGroupInvoice_passenger_idx"
    ON "TravelGroupInvoice"("travel_group_passenger_id");
CREATE INDEX IF NOT EXISTS "TravelGroupInvoice_client_idx"
    ON "TravelGroupInvoice"("client_id");
CREATE INDEX IF NOT EXISTS "TravelGroupInvoice_issue_idx"
    ON "TravelGroupInvoice"("issue_date");

CREATE INDEX IF NOT EXISTS "TravelGroupInvoiceItem_invoice_idx"
    ON "TravelGroupInvoiceItem"("travel_group_invoice_id");
