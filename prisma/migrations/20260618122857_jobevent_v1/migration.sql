-- CreateEnum
CREATE TYPE "JobEventActionType" AS ENUM ('CREATED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'RESUMED', 'COMPLETED', 'REASSIGNED', 'MERGED', 'DUPLICATE_FLAGGED', 'JUNK_FLAGGED');

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "queueJobId" INTEGER NOT NULL,
    "userId" INTEGER,
    "actionType" "JobEventActionType" NOT NULL,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobEvent_legacyMongoId_key" ON "JobEvent"("legacyMongoId");

-- CreateIndex
CREATE INDEX "JobEvent_legacyMongoId_idx" ON "JobEvent"("legacyMongoId");

-- CreateIndex
CREATE INDEX "JobEvent_queueJobId_idx" ON "JobEvent"("queueJobId");

-- CreateIndex
CREATE INDEX "JobEvent_userId_idx" ON "JobEvent"("userId");

-- CreateIndex
CREATE INDEX "JobEvent_actionType_idx" ON "JobEvent"("actionType");

-- CreateIndex
CREATE INDEX "JobEvent_timestamp_idx" ON "JobEvent"("timestamp");
