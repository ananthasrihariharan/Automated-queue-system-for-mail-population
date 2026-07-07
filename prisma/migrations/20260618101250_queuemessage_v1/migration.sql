-- CreateEnum
CREATE TYPE "QueueMessageType" AS ENUM ('DIRECT', 'BROADCAST');

-- CreateTable
CREATE TABLE "QueueMessage" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "senderId" INTEGER NOT NULL,
    "senderName" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "QueueMessageType" NOT NULL,
    "legacyJobMongoId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueMessage_legacyMongoId_key" ON "QueueMessage"("legacyMongoId");

-- CreateIndex
CREATE INDEX "QueueMessage_senderId_idx" ON "QueueMessage"("senderId");

-- CreateIndex
CREATE INDEX "QueueMessage_recipientId_idx" ON "QueueMessage"("recipientId");

-- CreateIndex
CREATE INDEX "QueueMessage_timestamp_idx" ON "QueueMessage"("timestamp");

-- CreateIndex
CREATE INDEX "QueueMessage_legacyMongoId_idx" ON "QueueMessage"("legacyMongoId");
