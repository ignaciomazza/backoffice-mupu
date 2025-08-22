-- CreateTable
CREATE TABLE "OperatorDue" (
    "id_due" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "booking_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "concept" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "OperatorDue_pkey" PRIMARY KEY ("id_due")
);

-- CreateTable
CREATE TABLE "ClientPayment" (
    "id_payment" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "booking_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "method" TEXT NOT NULL,

    CONSTRAINT "ClientPayment_pkey" PRIMARY KEY ("id_payment")
);

-- CreateIndex
CREATE INDEX "OperatorDue_booking_id_idx" ON "OperatorDue"("booking_id");

-- CreateIndex
CREATE INDEX "OperatorDue_service_id_idx" ON "OperatorDue"("service_id");

-- CreateIndex
CREATE INDEX "OperatorDue_due_date_idx" ON "OperatorDue"("due_date");

-- CreateIndex
CREATE INDEX "ClientPayment_booking_id_idx" ON "ClientPayment"("booking_id");

-- CreateIndex
CREATE INDEX "ClientPayment_client_id_idx" ON "ClientPayment"("client_id");

-- AddForeignKey
ALTER TABLE "OperatorDue" ADD CONSTRAINT "OperatorDue_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id_booking") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorDue" ADD CONSTRAINT "OperatorDue_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service"("id_service") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "Booking"("id_booking") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id_client") ON DELETE RESTRICT ON UPDATE CASCADE;
