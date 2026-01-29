-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "category_id" INTEGER;

-- AlterTable
ALTER TABLE "ServiceTypePresetItem" ADD COLUMN     "sale_markup_pct" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ClientSimpleCompanion" (
    "id_template" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "age" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientSimpleCompanion_pkey" PRIMARY KEY ("id_template")
);

-- CreateIndex
CREATE INDEX "ClientSimpleCompanion_client_id_idx" ON "ClientSimpleCompanion"("client_id");

-- CreateIndex
CREATE INDEX "ClientSimpleCompanion_category_id_idx" ON "ClientSimpleCompanion"("category_id");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "PassengerCategory"("id_category") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSimpleCompanion" ADD CONSTRAINT "ClientSimpleCompanion_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id_client") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSimpleCompanion" ADD CONSTRAINT "ClientSimpleCompanion_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "PassengerCategory"("id_category") ON DELETE SET NULL ON UPDATE CASCADE;
