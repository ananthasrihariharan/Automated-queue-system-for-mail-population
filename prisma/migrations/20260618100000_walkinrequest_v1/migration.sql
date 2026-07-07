-- AlterEnum
ALTER TYPE "MigrationEntity" ADD VALUE 'WALKINREQUEST';

-- CreateEnum
CREATE TYPE "WalkinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "WalkinRequest" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "description" TEXT NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "status" "WalkinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminAction" TEXT,
    "legacyQueueJobMongoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalkinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalkinRequest_legacyMongoId_key" ON "WalkinRequest"("legacyMongoId");

-- CreateIndex
CREATE INDEX "WalkinRequest_requestedById_idx" ON "WalkinRequest"("requestedById");

-- CreateIndex
CREATE INDEX "WalkinRequest_assignedToId_idx" ON "WalkinRequest"("assignedToId");

-- CreateIndex
CREATE INDEX "WalkinRequest_status_idx" ON "WalkinRequest"("status");

-- CreateIndex
CREATE INDEX "WalkinRequest_legacyMongoId_idx" ON "WalkinRequest"("legacyMongoId");
