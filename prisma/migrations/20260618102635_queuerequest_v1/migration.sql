-- CreateEnum
CREATE TYPE "QueueRequestType" AS ENUM ('WALKIN', 'REASSIGN');

-- CreateEnum
CREATE TYPE "QueueRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "QueueRequest" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "type" "QueueRequestType" NOT NULL,
    "description" TEXT NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "legacyJobMongoId" TEXT,
    "status" "QueueRequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminAction" TEXT,
    "legacyResultJobMongoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueRequest_legacyMongoId_key" ON "QueueRequest"("legacyMongoId");

-- CreateIndex
CREATE INDEX "QueueRequest_requestedById_idx" ON "QueueRequest"("requestedById");

-- CreateIndex
CREATE INDEX "QueueRequest_status_idx" ON "QueueRequest"("status");

-- CreateIndex
CREATE INDEX "QueueRequest_legacyMongoId_idx" ON "QueueRequest"("legacyMongoId");
