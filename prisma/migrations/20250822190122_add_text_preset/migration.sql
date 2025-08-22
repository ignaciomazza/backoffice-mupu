-- CreateTable
CREATE TABLE "TextPreset" (
    "id_preset" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "id_user" INTEGER NOT NULL,
    "id_agency" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextPreset_pkey" PRIMARY KEY ("id_preset")
);

-- CreateIndex
CREATE INDEX "TextPreset_id_user_doc_type_created_at_idx" ON "TextPreset"("id_user", "doc_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "TextPreset_id_user_doc_type_title_key" ON "TextPreset"("id_user", "doc_type", "title");

-- AddForeignKey
ALTER TABLE "TextPreset" ADD CONSTRAINT "TextPreset_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User"("id_user") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextPreset" ADD CONSTRAINT "TextPreset_id_agency_fkey" FOREIGN KEY ("id_agency") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
