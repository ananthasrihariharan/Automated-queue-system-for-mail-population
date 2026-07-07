-- CreateEnum
CREATE TYPE "MigrationEntity" AS ENUM ('USER', 'CUSTOMER', 'JOB', 'JOBEVENT', 'QUEUEJOB', 'QUEUEMESSAGE', 'QUEUEREQUEST');

-- CreateTable
CREATE TABLE "MigrationMap" (
    "id" SERIAL NOT NULL,
    "entityType" "MigrationEntity" NOT NULL,
    "mongoId" TEXT NOT NULL,
    "postgresId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MigrationMap_mongoId_idx" ON "MigrationMap"("mongoId");

-- CreateIndex
CREATE INDEX "MigrationMap_entityType_idx" ON "MigrationMap"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationMap_entityType_mongoId_key" ON "MigrationMap"("entityType", "mongoId");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationMap_entityType_postgresId_key" ON "MigrationMap"("entityType", "postgresId");
