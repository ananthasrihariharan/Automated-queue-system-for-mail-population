/*
  Warnings:

  - Made the column `legacyMongoId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ProcessType" AS ENUM ('LAMINATION', 'CREASING', 'BINDING', 'CUTTING', 'DIE_CUTTING', 'CORNER_CUTTING', 'FOIL', 'FUSING', 'HOLES', 'ID_CARD', 'CUTTING2', 'POUCH_LAMINATION', 'PERFORATION', 'WHEEL_PERFORATION');

-- CreateEnum
CREATE TYPE "ProcessVariant" AS ENUM ('NONE', 'GLOSSY', 'MATTE', 'VELVET', 'SINGLE_SIDE', 'DOUBLE_SIDE', 'CENTRE_PIN', 'PERFECT', 'CASE_BINDING', 'WIRO_BINDING', 'POUCH_LAMINATION', 'SPECIAL');

-- CreateEnum
CREATE TYPE "LaminationSide" AS ENUM ('SINGLE', 'DOUBLE');

-- CreateEnum
CREATE TYPE "CornerPosition" AS ENUM ('TL', 'TR', 'BL', 'BR');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('NONE', 'PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ActiveStage" AS ENUM ('press', 'lamination', 'foil', 'binding', 'fusing', 'holes', 'cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2', 'done');

-- CreateEnum
CREATE TYPE "TaskModule" AS ENUM ('press', 'post_press', 'finishing');

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('PENDING', 'PACKED', 'DISPATCHED');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('COURIER', 'WALK_IN');

-- CreateEnum
CREATE TYPE "ReceiverType" AS ENUM ('SELF', 'OTHER');

-- CreateEnum
CREATE TYPE "SyncFailureStatus" AS ENUM ('PENDING', 'RETRYING', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WriteSyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'RETRY_PENDING', 'SYNCED');

-- CreateEnum
CREATE TYPE "SyncOperationType" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncTimestamp" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncTimestamp" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncTimestamp" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Parcel" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncTimestamp" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QueueJob" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncTimestamp" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QueueSession" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncTimestamp" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncTimestamp" BIGINT NOT NULL DEFAULT 0,
ALTER COLUMN "legacyMongoId" SET NOT NULL;

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "roleName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncFailureQueue" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "mongoRecordId" TEXT NOT NULL,
    "operationType" "SyncOperationType" NOT NULL,
    "failedTable" TEXT NOT NULL,
    "referenceId" TEXT,
    "errorMessage" TEXT,
    "errorStack" TEXT,
    "errorMetadata" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "status" "SyncFailureStatus" NOT NULL DEFAULT 'PENDING',
    "syncTimestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),

    CONSTRAINT "SyncFailureQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriteSyncLog" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "mongoId" TEXT NOT NULL,
    "postgresId" INTEGER,
    "syncStatus" "WriteSyncStatus" NOT NULL,
    "syncTimestamp" BIGINT NOT NULL,
    "sourceHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WriteSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_roleName_key" ON "Role"("roleName");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "SyncFailureQueue_status_idx" ON "SyncFailureQueue"("status");

-- CreateIndex
CREATE INDEX "SyncFailureQueue_entityType_idx" ON "SyncFailureQueue"("entityType");

-- CreateIndex
CREATE INDEX "SyncFailureQueue_createdAt_idx" ON "SyncFailureQueue"("createdAt");

-- CreateIndex
CREATE INDEX "SyncFailureQueue_status_createdAt_idx" ON "SyncFailureQueue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WriteSyncLog_entityType_mongoId_idx" ON "WriteSyncLog"("entityType", "mongoId");

-- CreateIndex
CREATE INDEX "WriteSyncLog_syncStatus_idx" ON "WriteSyncLog"("syncStatus");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
