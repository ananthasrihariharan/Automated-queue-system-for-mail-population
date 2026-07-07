-- CreateEnum
CREATE TYPE "ParcelReceiverType" AS ENUM ('SELF', 'OTHER');

-- AlterEnum
ALTER TYPE "MigrationEntity" ADD VALUE 'PARCEL';

-- CreateTable
CREATE TABLE "Parcel" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "parcelId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "receiverType" "ParcelReceiverType" NOT NULL,
    "receiverName" TEXT NOT NULL,
    "receiverPhone" TEXT NOT NULL,
    "qrPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_legacyMongoId_key" ON "Parcel"("legacyMongoId");

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_parcelId_key" ON "Parcel"("parcelId");

-- CreateIndex
CREATE INDEX "Parcel_legacyMongoId_idx" ON "Parcel"("legacyMongoId");

-- CreateIndex
CREATE INDEX "Parcel_parcelId_idx" ON "Parcel"("parcelId");

-- CreateIndex
CREATE INDEX "Parcel_jobId_idx" ON "Parcel"("jobId");
