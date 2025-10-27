-- CreateTable
CREATE TABLE "Lead" (
    "id_lead" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "full_name" TEXT NOT NULL,
    "agency_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "team_size" TEXT,
    "location" TEXT,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "contacted_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'landing',
    "id_agency" INTEGER,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id_lead")
);

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_created_at_idx" ON "Lead"("created_at");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE SET NULL ON UPDATE CASCADE;
