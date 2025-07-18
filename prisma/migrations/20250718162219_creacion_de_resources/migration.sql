-- CreateTable
CREATE TABLE "Resources" (
    "id_receipt" SERIAL NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Resources_pkey" PRIMARY KEY ("id_receipt")
);
