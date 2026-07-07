-- AlterTable
ALTER TABLE "JobEvent" ADD COLUMN     "legacyQueueJobMongoId" TEXT,
ALTER COLUMN "queueJobId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "JobEvent_legacyQueueJobMongoId_idx" ON "JobEvent"("legacyQueueJobMongoId");
