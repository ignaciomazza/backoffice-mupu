-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "id_category" INTEGER;

-- CreateTable
CREATE TABLE "Category" (
    "id_category" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id_category")
);

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_id_category_fkey" FOREIGN KEY ("id_category") REFERENCES "Category"("id_category") ON DELETE SET NULL ON UPDATE CASCADE;
