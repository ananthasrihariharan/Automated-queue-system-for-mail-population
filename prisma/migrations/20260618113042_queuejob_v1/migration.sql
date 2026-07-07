-- CreateEnum
CREATE TYPE "QueueJobStatus" AS ENUM ('QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'DUPLICATE', 'JUNK', 'ADMIN_REVIEW');

-- CreateEnum
CREATE TYPE "QueueJobType" AS ENUM ('EMAIL', 'WALKIN', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "QueueComplexityTag" AS ENUM ('easy', 'medium', 'complex');

-- CreateEnum
CREATE TYPE "QueueHoldBehavior" AS ENUM ('RETURN_TO_POOL', 'STAY_HOLD');

-- CreateTable
CREATE TABLE "QueueJob" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "emailSubject" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "mailBody" TEXT,
    "folderPath" TEXT NOT NULL,
    "relativeFolderPath" TEXT,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attachmentMeta" JSONB,
    "externalLinks" JSONB,
    "status" "QueueJobStatus" NOT NULL,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "queuePosition" INTEGER NOT NULL DEFAULT 0,
    "pinnedToStaffId" INTEGER,
    "isHardPinned" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" INTEGER,
    "assignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dueBy" TIMESTAMP(3),
    "complexityTag" "QueueComplexityTag",
    "lastPausedById" INTEGER,
    "type" "QueueJobType" NOT NULL,
    "handoffNotes" TEXT,
    "staffHandoffReason" TEXT,
    "adminHandoffNotes" TEXT,
    "reassignedFromId" INTEGER,
    "returnReason" TEXT,
    "pauseReason" TEXT,
    "holdUntil" TIMESTAMP(3),
    "holdBehavior" "QueueHoldBehavior" NOT NULL DEFAULT 'STAY_HOLD',
    "fingerprint" TEXT,
    "threadId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isAutoAssigned" BOOLEAN NOT NULL DEFAULT false,
    "continuityContext" TEXT,
    "legacyParentJobMongoId" TEXT,
    "isSuperseded" BOOLEAN NOT NULL DEFAULT false,
    "auditLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueJob_legacyMongoId_key" ON "QueueJob"("legacyMongoId");

-- CreateIndex
CREATE INDEX "QueueJob_legacyMongoId_idx" ON "QueueJob"("legacyMongoId");

-- CreateIndex
CREATE INDEX "QueueJob_customerEmail_idx" ON "QueueJob"("customerEmail");

-- CreateIndex
CREATE INDEX "QueueJob_status_idx" ON "QueueJob"("status");

-- CreateIndex
CREATE INDEX "QueueJob_assignedToId_idx" ON "QueueJob"("assignedToId");

-- CreateIndex
CREATE INDEX "QueueJob_pinnedToStaffId_idx" ON "QueueJob"("pinnedToStaffId");

-- CreateIndex
CREATE INDEX "QueueJob_fingerprint_idx" ON "QueueJob"("fingerprint");

-- CreateIndex
CREATE INDEX "QueueJob_threadId_idx" ON "QueueJob"("threadId");
