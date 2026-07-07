-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alternatePhones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "password" TEXT NOT NULL,
    "isCreditCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_legacyMongoId_key" ON "Customer"("legacyMongoId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_legacyMongoId_idx" ON "Customer"("legacyMongoId");
