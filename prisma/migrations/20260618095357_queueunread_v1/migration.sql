-- AlterEnum
ALTER TYPE "MigrationEntity" ADD VALUE 'QUEUEUNREAD';

-- CreateTable
CREATE TABLE "QueueUnread" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "userId" INTEGER NOT NULL,
    "threadId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueUnread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueUnread_legacyMongoId_key" ON "QueueUnread"("legacyMongoId");

-- CreateIndex
CREATE INDEX "QueueUnread_userId_idx" ON "QueueUnread"("userId");

-- CreateIndex
CREATE INDEX "QueueUnread_threadId_idx" ON "QueueUnread"("threadId");

-- CreateIndex
CREATE INDEX "QueueUnread_legacyMongoId_idx" ON "QueueUnread"("legacyMongoId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueUnread_userId_threadId_key" ON "QueueUnread"("userId", "threadId");
