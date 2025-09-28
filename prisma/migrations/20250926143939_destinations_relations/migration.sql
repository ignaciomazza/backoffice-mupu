-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "nationality_country_id" INTEGER;

-- CreateTable
CREATE TABLE "Country" (
    "id_country" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "iso2" TEXT NOT NULL,
    "iso3" TEXT,
    "slug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id_country")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id_destination" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "alt_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "country_id" INTEGER NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id_destination")
);

-- CreateTable
CREATE TABLE "ServiceDestination" (
    "service_id" INTEGER NOT NULL,
    "destination_id" INTEGER NOT NULL,
    "added_by" INTEGER,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceDestination_pkey" PRIMARY KEY ("service_id","destination_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso2_key" ON "Country"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "Country_slug_key" ON "Country"("slug");

-- CreateIndex
CREATE INDEX "Destination_popularity_idx" ON "Destination"("popularity");

-- CreateIndex
CREATE INDEX "Destination_enabled_idx" ON "Destination"("enabled");

-- CreateIndex
CREATE INDEX "Destination_slug_idx" ON "Destination"("slug");

-- CreateIndex
CREATE INDEX "Destination_country_id_slug_idx" ON "Destination"("country_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_country_id_slug_key" ON "Destination"("country_id", "slug");

-- CreateIndex
CREATE INDEX "ServiceDestination_service_id_idx" ON "ServiceDestination"("service_id");

-- CreateIndex
CREATE INDEX "ServiceDestination_destination_id_idx" ON "ServiceDestination"("destination_id");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_nationality_country_id_fkey" FOREIGN KEY ("nationality_country_id") REFERENCES "Country"("id_country") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "Country"("id_country") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDestination" ADD CONSTRAINT "ServiceDestination_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service"("id_service") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDestination" ADD CONSTRAINT "ServiceDestination_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "Destination"("id_destination") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDestination" ADD CONSTRAINT "ServiceDestination_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "User"("id_user") ON DELETE SET NULL ON UPDATE CASCADE;
