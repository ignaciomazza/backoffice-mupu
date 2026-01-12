-- CreateTable
CREATE TABLE "AgencyArcaConfig" (
    "id" SERIAL NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "taxIdRepresentado" TEXT NOT NULL,
    "taxIdLogin" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "certEncrypted" TEXT,
    "keyEncrypted" TEXT,
    "authorizedServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "lastOkAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyArcaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcaConnectionJob" (
    "id" SERIAL NOT NULL,
    "agencyId" INTEGER NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'connect',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "step" TEXT NOT NULL DEFAULT 'create_cert',
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentServiceIndex" INTEGER NOT NULL DEFAULT 0,
    "longJobId" TEXT,
    "taxIdRepresentado" TEXT NOT NULL,
    "taxIdLogin" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ArcaConnectionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgencyArcaConfig_agencyId_key" ON "AgencyArcaConfig"("agencyId");

-- AddForeignKey
ALTER TABLE "AgencyArcaConfig" ADD CONSTRAINT "AgencyArcaConfig_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcaConnectionJob" ADD CONSTRAINT "ArcaConnectionJob_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id_agency") ON DELETE CASCADE ON UPDATE CASCADE;
