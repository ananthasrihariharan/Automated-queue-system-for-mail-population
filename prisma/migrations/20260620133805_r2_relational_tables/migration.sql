/*
  Warnings:

  - You are about to drop the column `itemScreenshots` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `items` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `packingOverride` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `parcels` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `taskLog` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `binding` on the `JobCard` table. All the data in the column will be lost.
  - You are about to drop the column `cornerCutting` on the `JobCard` table. All the data in the column will be lost.
  - You are about to drop the column `creasingPerforation` on the `JobCard` table. All the data in the column will be lost.
  - You are about to drop the column `cutting` on the `JobCard` table. All the data in the column will be lost.
  - You are about to drop the column `dieCutting` on the `JobCard` table. All the data in the column will be lost.
  - You are about to drop the column `foil` on the `JobCard` table. All the data in the column will be lost.
  - You are about to drop the column `idCard` on the `JobCard` table. All the data in the column will be lost.
  - You are about to drop the column `lamination` on the `JobCard` table. All the data in the column will be lost.
  - You are about to drop the column `processes` on the `JobCard` table. All the data in the column will be lost.
  - You are about to drop the column `vcBox` on the `JobCard` table. All the data in the column will be lost.
  - You are about to drop the `Parcel` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Job" DROP COLUMN "itemScreenshots",
DROP COLUMN "items",
DROP COLUMN "packingOverride",
DROP COLUMN "parcels",
DROP COLUMN "taskLog";

-- AlterTable
ALTER TABLE "JobCard" DROP COLUMN "binding",
DROP COLUMN "cornerCutting",
DROP COLUMN "creasingPerforation",
DROP COLUMN "cutting",
DROP COLUMN "dieCutting",
DROP COLUMN "foil",
DROP COLUMN "idCard",
DROP COLUMN "lamination",
DROP COLUMN "processes",
DROP COLUMN "vcBox",
ADD COLUMN     "bindingCase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bindingCaseQty" TEXT,
ADD COLUMN     "bindingCenterPin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bindingCenterPinQty" TEXT,
ADD COLUMN     "bindingDate" TEXT,
ADD COLUMN     "bindingNoOfBooks" TEXT,
ADD COLUMN     "bindingPerfect" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bindingPerfectQty" TEXT,
ADD COLUMN     "bindingPouchLam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bindingPouchLamQty" TEXT,
ADD COLUMN     "bindingSpecial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bindingSpecialDesc" TEXT,
ADD COLUMN     "bindingSpecialQty" TEXT,
ADD COLUMN     "bindingWiro" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bindingWiroQty" TEXT,
ADD COLUMN     "cornerBl" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cornerBr" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cornerDate" TEXT,
ADD COLUMN     "cornerNoOfCards" TEXT,
ADD COLUMN     "cornerTl" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cornerTr" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cpCreasing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cpCreasingNo" TEXT,
ADD COLUMN     "cpDate" TEXT,
ADD COLUMN     "cpNoOfSheets" TEXT,
ADD COLUMN     "cpNoOfStock" TEXT,
ADD COLUMN     "cpPerforation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cpPerforationNo" TEXT,
ADD COLUMN     "cpWheelPerforation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cpWheelPerforationNo" TEXT,
ADD COLUMN     "cuttingDate" TEXT,
ADD COLUMN     "cuttingNoOfCutting" TEXT,
ADD COLUMN     "cuttingSizes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dieCuttingDate" TEXT,
ADD COLUMN     "dieCuttingNoOfSheets" TEXT,
ADD COLUMN     "foilQty" TEXT,
ADD COLUMN     "foilType" TEXT,
ADD COLUMN     "hasBinding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasCornerCut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasCreasing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasCutting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasDieCutting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasFoil" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasIdCard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasLamination" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasNcBox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasPerforation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "idFusing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "idFusingQty" TEXT,
ADD COLUMN     "idFusingType" TEXT,
ADD COLUMN     "idHoles" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "idHolesType" TEXT,
ADD COLUMN     "lamDate" TEXT,
ADD COLUMN     "lamDoubleSide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lamGlossy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lamGlossyQty" TEXT,
ADD COLUMN     "lamGlossySide" TEXT,
ADD COLUMN     "lamMatt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lamMattQty" TEXT,
ADD COLUMN     "lamMattSide" TEXT,
ADD COLUMN     "lamOther" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lamOtherQty" TEXT,
ADD COLUMN     "lamOtherSide" TEXT,
ADD COLUMN     "lamOtherType" TEXT,
ADD COLUMN     "lamSingleSide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lamVelvet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lamVelvetQty" TEXT,
ADD COLUMN     "lamVelvetSide" TEXT,
ADD COLUMN     "vcBoxCount" TEXT;

-- DropTable
DROP TABLE "Parcel";

-- DropEnum
DROP TYPE "ParcelReceiverType";

-- CreateTable
CREATE TABLE "JobCardDieCuttingRow" (
    "id" SERIAL NOT NULL,
    "jobCardId" INTEGER NOT NULL,
    "sheets" TEXT,
    "halfCut" TEXT,
    "throughCut" TEXT,
    "timing" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobCardDieCuttingRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessMaster" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "module" "TaskModule" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItem" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "orderDescription" TEXT,
    "media" TEXT,
    "type" TEXT,
    "printType" TEXT,
    "sizeDefault" TEXT DEFAULT 'Custom',
    "sizeH" TEXT,
    "sizeW" TEXT,
    "qty" TEXT DEFAULT '1',
    "pages" TEXT,
    "sheets" TEXT,
    "mc" TEXT,
    "fc" TEXT,
    "ac" TEXT,
    "screenshot" TEXT,
    "printConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "pressStatus" "WorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "activeStage" "ActiveStage" NOT NULL DEFAULT 'press',
    "printedById" INTEGER,
    "pouchLamination" BOOLEAN NOT NULL DEFAULT false,
    "idCard" BOOLEAN NOT NULL DEFAULT false,
    "syncTimestamp" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItemProcess" (
    "id" SERIAL NOT NULL,
    "jobItemId" INTEGER NOT NULL,
    "processMasterId" INTEGER NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'NONE',
    "operatorId" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "syncTimestamp" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobItemProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItemProcessConfig" (
    "id" SERIAL NOT NULL,
    "jobItemProcessId" INTEGER NOT NULL,
    "configKey" TEXT NOT NULL,
    "configValue" TEXT,

    CONSTRAINT "JobItemProcessConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItemDieCuttingRow" (
    "id" SERIAL NOT NULL,
    "jobItemProcessId" INTEGER NOT NULL,
    "sheets" TEXT,
    "halfCut" TEXT,
    "throughCut" TEXT,
    "timing" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobItemDieCuttingRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItemCuttingSize" (
    "id" SERIAL NOT NULL,
    "jobItemProcessId" INTEGER NOT NULL,
    "sizeValue" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobItemCuttingSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItemCornerDetail" (
    "id" SERIAL NOT NULL,
    "jobItemProcessId" INTEGER NOT NULL,
    "cornerPosition" "CornerPosition" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JobItemCornerDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobParcel" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "parcelNo" INTEGER NOT NULL,
    "receiverType" "ReceiverType" NOT NULL,
    "deliveryType" "DeliveryType" NOT NULL DEFAULT 'COURIER',
    "receiverName" TEXT,
    "receiverPhone" TEXT,
    "qrCode" TEXT,
    "status" "ParcelStatus" NOT NULL DEFAULT 'PENDING',
    "packedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedBy" TEXT,
    "rack" TEXT,
    "rackLocation" TEXT,
    "syncTimestamp" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "JobParcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobParcelItem" (
    "id" SERIAL NOT NULL,
    "jobParcelId" INTEGER NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "status" "ParcelStatus" NOT NULL DEFAULT 'PENDING',
    "dispatchedAt" TIMESTAMP(3),
    "rackName" TEXT,

    CONSTRAINT "JobParcelItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTaskLog" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "task" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "staffName" TEXT,
    "staffId" INTEGER,
    "module" "TaskModule",

    CONSTRAINT "JobTaskLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingOverride" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "overriddenById" INTEGER,
    "overriddenAt" TIMESTAMP(3),

    CONSTRAINT "PackingOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItemScreenshot" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "screenshotPath" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobItemScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobCardDieCuttingRow_jobCardId_idx" ON "JobCardDieCuttingRow"("jobCardId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessMaster_name_key" ON "ProcessMaster"("name");

-- CreateIndex
CREATE INDEX "JobItem_jobId_idx" ON "JobItem"("jobId");

-- CreateIndex
CREATE INDEX "JobItem_activeStage_idx" ON "JobItem"("activeStage");

-- CreateIndex
CREATE UNIQUE INDEX "JobItem_jobId_itemIndex_key" ON "JobItem"("jobId", "itemIndex");

-- CreateIndex
CREATE INDEX "JobItemProcess_jobItemId_idx" ON "JobItemProcess"("jobItemId");

-- CreateIndex
CREATE INDEX "JobItemProcess_processMasterId_idx" ON "JobItemProcess"("processMasterId");

-- CreateIndex
CREATE UNIQUE INDEX "JobItemProcess_jobItemId_processMasterId_key" ON "JobItemProcess"("jobItemId", "processMasterId");

-- CreateIndex
CREATE INDEX "JobItemProcessConfig_jobItemProcessId_idx" ON "JobItemProcessConfig"("jobItemProcessId");

-- CreateIndex
CREATE UNIQUE INDEX "JobItemProcessConfig_jobItemProcessId_configKey_key" ON "JobItemProcessConfig"("jobItemProcessId", "configKey");

-- CreateIndex
CREATE INDEX "JobItemDieCuttingRow_jobItemProcessId_idx" ON "JobItemDieCuttingRow"("jobItemProcessId");

-- CreateIndex
CREATE INDEX "JobItemCuttingSize_jobItemProcessId_idx" ON "JobItemCuttingSize"("jobItemProcessId");

-- CreateIndex
CREATE INDEX "JobItemCornerDetail_jobItemProcessId_idx" ON "JobItemCornerDetail"("jobItemProcessId");

-- CreateIndex
CREATE INDEX "JobParcel_jobId_idx" ON "JobParcel"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobParcel_jobId_parcelNo_key" ON "JobParcel"("jobId", "parcelNo");

-- CreateIndex
CREATE INDEX "JobParcelItem_jobParcelId_idx" ON "JobParcelItem"("jobParcelId");

-- CreateIndex
CREATE UNIQUE INDEX "JobParcelItem_jobParcelId_itemIndex_key" ON "JobParcelItem"("jobParcelId", "itemIndex");

-- CreateIndex
CREATE INDEX "JobTaskLog_jobId_idx" ON "JobTaskLog"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "PackingOverride_jobId_key" ON "PackingOverride"("jobId");

-- CreateIndex
CREATE INDEX "JobItemScreenshot_jobId_idx" ON "JobItemScreenshot"("jobId");

-- AddForeignKey
ALTER TABLE "JobCardDieCuttingRow" ADD CONSTRAINT "JobCardDieCuttingRow_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItemProcess" ADD CONSTRAINT "JobItemProcess_jobItemId_fkey" FOREIGN KEY ("jobItemId") REFERENCES "JobItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItemProcess" ADD CONSTRAINT "JobItemProcess_processMasterId_fkey" FOREIGN KEY ("processMasterId") REFERENCES "ProcessMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItemProcessConfig" ADD CONSTRAINT "JobItemProcessConfig_jobItemProcessId_fkey" FOREIGN KEY ("jobItemProcessId") REFERENCES "JobItemProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItemDieCuttingRow" ADD CONSTRAINT "JobItemDieCuttingRow_jobItemProcessId_fkey" FOREIGN KEY ("jobItemProcessId") REFERENCES "JobItemProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItemCuttingSize" ADD CONSTRAINT "JobItemCuttingSize_jobItemProcessId_fkey" FOREIGN KEY ("jobItemProcessId") REFERENCES "JobItemProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItemCornerDetail" ADD CONSTRAINT "JobItemCornerDetail_jobItemProcessId_fkey" FOREIGN KEY ("jobItemProcessId") REFERENCES "JobItemProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobParcel" ADD CONSTRAINT "JobParcel_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobParcelItem" ADD CONSTRAINT "JobParcelItem_jobParcelId_fkey" FOREIGN KEY ("jobParcelId") REFERENCES "JobParcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTaskLog" ADD CONSTRAINT "JobTaskLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingOverride" ADD CONSTRAINT "PackingOverride_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItemScreenshot" ADD CONSTRAINT "JobItemScreenshot_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
