-- AlterTable
ALTER TABLE "QueueJob" ADD COLUMN     "parentJobId" INTEGER;

-- CreateIndex
CREATE INDEX "QueueJob_parentJobId_idx" ON "QueueJob"("parentJobId");

-- AddForeignKey
ALTER TABLE "QueueJob" ADD CONSTRAINT "QueueJob_parentJobId_fkey" FOREIGN KEY ("parentJobId") REFERENCES "QueueJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
