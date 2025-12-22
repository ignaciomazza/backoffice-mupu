-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by" INTEGER;

-- CreateIndex
CREATE INDEX "Receipt_verification_status_idx" ON "Receipt"("verification_status");

-- CreateIndex
CREATE INDEX "Receipt_verified_by_idx" ON "Receipt"("verified_by");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;
