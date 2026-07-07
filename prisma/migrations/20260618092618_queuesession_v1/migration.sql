-- AlterEnum
ALTER TYPE "MigrationEntity" ADD VALUE 'QUEUESESSION';

-- CreateTable
CREATE TABLE "QueueSession" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "staffId" INTEGER NOT NULL,
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoutAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isQueuePaused" BOOLEAN NOT NULL DEFAULT false,
    "legacyCurrentQueueJobMongoId" TEXT,
    "legacyCurrentWalkinJobMongoId" TEXT,
    "pinnedJobs" JSONB,
    "pausedJobs" JSONB,
    "serverVersion" TEXT NOT NULL DEFAULT '1.0.6-trojan',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueSession_legacyMongoId_key" ON "QueueSession"("legacyMongoId");

-- CreateIndex
CREATE INDEX "QueueSession_staffId_idx" ON "QueueSession"("staffId");

-- CreateIndex
CREATE INDEX "QueueSession_isActive_idx" ON "QueueSession"("isActive");

-- CreateIndex
CREATE INDEX "QueueSession_legacyMongoId_idx" ON "QueueSession"("legacyMongoId");
