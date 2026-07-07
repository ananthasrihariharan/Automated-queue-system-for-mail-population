-- CreateEnum
CREATE TYPE "JobPackingPreference" AS ENUM ('SINGLE', 'MULTIPLE', 'MIXED');

-- CreateEnum
CREATE TYPE "JobDeliveryType" AS ENUM ('COURIER', 'WALK_IN');

-- CreateEnum
CREATE TYPE "JobPaymentStatus" AS ENUM ('UNPAID', 'PAID', 'ADMIN_APPROVED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'CREATED', 'PRINTED', 'PACKED', 'DISPATCHED', 'PARTIAL_DISPATCH');

-- CreateTable
CREATE TABLE "Job" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "jobId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "itemScreenshots" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "items" JSONB,
    "filesArchived" BOOLEAN NOT NULL DEFAULT false,
    "packingPreference" "JobPackingPreference" NOT NULL DEFAULT 'SINGLE',
    "packingMode" "JobPackingPreference",
    "defaultDeliveryType" "JobDeliveryType" NOT NULL DEFAULT 'COURIER',
    "contactMe" BOOLEAN NOT NULL DEFAULT false,
    "paymentStatus" "JobPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "jobStatus" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "dispatchedAt" TIMESTAMP(3),
    "rackLocation" TEXT,
    "createdById" INTEGER,
    "legacyCreatedByMongoId" TEXT,
    "printedById" INTEGER,
    "legacyPrintedByMongoId" TEXT,
    "ppsCompletedById" INTEGER,
    "legacyPpsCompletedByMongoId" TEXT,
    "ppsCompletedAt" TIMESTAMP(3),
    "finishingCompletedById" INTEGER,
    "legacyFinishingCompletedByMongoId" TEXT,
    "finishingCompletedAt" TIMESTAMP(3),
    "adminApprovalNote" TEXT,
    "adminApprovedAt" TIMESTAMP(3),
    "paymentHandledById" INTEGER,
    "legacyPaymentHandledByMongoId" TEXT,
    "dispatchedById" INTEGER,
    "legacyDispatchedByMongoId" TEXT,
    "packedById" INTEGER,
    "legacyPackedByMongoId" TEXT,
    "parcels" JSONB,
    "packingOverride" JSONB,
    "taskLog" JSONB,
    "customerId" INTEGER NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerConfirmedAt" TIMESTAMP(3),
    "approvalRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_legacyMongoId_key" ON "Job"("legacyMongoId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobId_key" ON "Job"("jobId");

-- CreateIndex
CREATE INDEX "Job_legacyMongoId_idx" ON "Job"("legacyMongoId");

-- CreateIndex
CREATE INDEX "Job_jobId_idx" ON "Job"("jobId");

-- CreateIndex
CREATE INDEX "Job_customerId_idx" ON "Job"("customerId");

-- CreateIndex
CREATE INDEX "Job_jobStatus_idx" ON "Job"("jobStatus");

-- CreateIndex
CREATE INDEX "Job_paymentStatus_idx" ON "Job"("paymentStatus");

-- CreateIndex
CREATE INDEX "Job_packingPreference_idx" ON "Job"("packingPreference");

-- CreateIndex
CREATE INDEX "Job_createdById_idx" ON "Job"("createdById");

-- CreateIndex
CREATE INDEX "Job_customerName_idx" ON "Job"("customerName");
