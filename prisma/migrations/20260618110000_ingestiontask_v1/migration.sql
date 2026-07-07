-- CreateEnum
CREATE TYPE "IngestionTaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "IngestionTask" (
    "id" SERIAL NOT NULL,
    "folderPath" TEXT NOT NULL,
    "status" "IngestionTaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestionTask_folderPath_key" ON "IngestionTask"("folderPath");

-- CreateIndex
CREATE INDEX "IngestionTask_folderPath_idx" ON "IngestionTask"("folderPath");

-- CreateIndex
CREATE INDEX "IngestionTask_status_idx" ON "IngestionTask"("status");
