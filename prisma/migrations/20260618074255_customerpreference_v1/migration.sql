-- CreateTable
CREATE TABLE "CustomerPreference" (
    "id" SERIAL NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT,
    "preferredStaffId" INTEGER NOT NULL,
    "legacyPreferredStaffMongoId" TEXT,
    "confirmedCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPreference_customerEmail_idx" ON "CustomerPreference"("customerEmail");

-- CreateIndex
CREATE INDEX "CustomerPreference_preferredStaffId_idx" ON "CustomerPreference"("preferredStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPreference_customerEmail_preferredStaffId_key" ON "CustomerPreference"("customerEmail", "preferredStaffId");
