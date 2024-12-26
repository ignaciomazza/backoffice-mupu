-- CreateTable
CREATE TABLE "Agency" (
    "id_agency" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "tax_id" TEXT NOT NULL,
    "website" TEXT,
    "foundation_date" TIMESTAMP(3),
    "logo_url" TEXT,
    "creation_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id_agency")
);

-- CreateTable
CREATE TABLE "User" (
    "id_user" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "position" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "creation_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_agency" INTEGER NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id_user")
);

-- CreateTable
CREATE TABLE "Client" (
    "id_client" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "birth_date" TIMESTAMP(3),
    "nationality" TEXT,
    "gender" TEXT,
    "marital_status" TEXT,
    "occupation" TEXT,
    "registration_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passport_issue" TIMESTAMP(3),
    "passport_expiry" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id_client")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id_booking" SERIAL NOT NULL,
    "booking_code" TEXT NOT NULL,
    "booking_date" TIMESTAMP(3) NOT NULL,
    "departure_date" TIMESTAMP(3) NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "profit" DOUBLE PRECISION NOT NULL,
    "details" TEXT,
    "creation_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_client" INTEGER NOT NULL,
    "id_operator" INTEGER NOT NULL,
    "id_user" INTEGER NOT NULL,
    "id_agency" INTEGER NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id_booking")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id_operator" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "registration_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credit_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debit_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id_operator")
);

-- CreateTable
CREATE TABLE "OperatorTransaction" (
    "id_transaction" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_operator" INTEGER NOT NULL,
    "details" TEXT,

    CONSTRAINT "OperatorTransaction_pkey" PRIMARY KEY ("id_transaction")
);

-- CreateTable
CREATE TABLE "AdminRecord" (
    "id_transaction" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "id_user" INTEGER NOT NULL,

    CONSTRAINT "AdminRecord_pkey" PRIMARY KEY ("id_transaction")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id_invoice" SERIAL NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "id_booking" INTEGER NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id_invoice")
);

-- CreateTable
CREATE TABLE "AFIPAuthentication" (
    "id_authentication" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "expiration_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AFIPAuthentication_pkey" PRIMARY KEY ("id_authentication")
);

-- CreateTable
CREATE TABLE "SalesTeam" (
    "id_team" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SalesTeam_pkey" PRIMARY KEY ("id_team")
);

-- CreateTable
CREATE TABLE "UserTeam" (
    "id_user_team" SERIAL NOT NULL,
    "id_user" INTEGER NOT NULL,
    "id_team" INTEGER NOT NULL,

    CONSTRAINT "UserTeam_pkey" PRIMARY KEY ("id_user_team")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_booking_code_key" ON "Booking"("booking_code");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoice_number_key" ON "Invoice"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_id_booking_key" ON "Invoice"("id_booking");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_id_client_fkey" FOREIGN KEY ("id_client") REFERENCES "Client"("id_client") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_id_operator_fkey" FOREIGN KEY ("id_operator") REFERENCES "Operator"("id_operator") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorTransaction" ADD CONSTRAINT "OperatorTransaction_id_operator_fkey" FOREIGN KEY ("id_operator") REFERENCES "Operator"("id_operator") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRecord" ADD CONSTRAINT "AdminRecord_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_id_booking_fkey" FOREIGN KEY ("id_booking") REFERENCES "Booking"("id_booking") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_id_team_fkey" FOREIGN KEY ("id_team") REFERENCES "SalesTeam"("id_team") ON DELETE RESTRICT ON UPDATE CASCADE;
