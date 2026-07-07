-- AlterEnum
ALTER TYPE "MigrationEntity" ADD VALUE 'JOBCARD';

-- CreateTable
CREATE TABLE "JobCard" (
    "id" SERIAL NOT NULL,
    "legacyMongoId" TEXT,
    "jobId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "attBy" TEXT,
    "date" TIMESTAMP(3),
    "processes" JSONB,
    "vcBox" JSONB,
    "binding" JSONB,
    "dieCutting" JSONB,
    "cornerCutting" JSONB,
    "cutting" JSONB,
    "lamination" JSONB,
    "creasingPerforation" JSONB,
    "foil" JSONB,
    "idCard" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobCard_legacyMongoId_key" ON "JobCard"("legacyMongoId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCard_jobId_key" ON "JobCard"("jobId");

-- CreateIndex
CREATE INDEX "JobCard_legacyMongoId_idx" ON "JobCard"("legacyMongoId");

-- CreateIndex
CREATE INDEX "JobCard_jobId_idx" ON "JobCard"("jobId");
