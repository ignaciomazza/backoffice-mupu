-- AlterTable
ALTER TABLE "Agency" ADD COLUMN     "phones" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "social" JSONB;

-- CreateTable
CREATE TABLE "TemplateConfig" (
    "id_template" SERIAL NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "doc_type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateConfig_pkey" PRIMARY KEY ("id_template")
);

-- CreateIndex
CREATE INDEX "TemplateConfig_id_agency_idx" ON "TemplateConfig"("id_agency");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateConfig_id_agency_doc_type_key" ON "TemplateConfig"("id_agency", "doc_type");

-- AddForeignKey
ALTER TABLE "TemplateConfig" ADD CONSTRAINT "TemplateConfig_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
