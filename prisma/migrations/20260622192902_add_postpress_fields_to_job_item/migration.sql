-- Migration: add_postpress_fields_to_job_item
-- Adds per-item process status, qty, and value fields to JobItem so that
-- postpress activity state changes (lamination, binding, cutting, foil, fusing,
-- holes, cutting2, die-cutting, corner-cutting, creasing, idCard) can be tracked
-- in PostgreSQL, mirroring the existing Mongoose items[] subdocument fields.
-- Applied via: npx prisma db push (schema already in sync)

-- ── Press timing ──────────────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "pressStartedAt" TIMESTAMP(3);

-- ── ID Card ───────────────────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "idCardQty"        INTEGER;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "idCardStatus"     "WorkflowStatus" NOT NULL DEFAULT 'NONE';

-- ── Lamination ────────────────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "lamination"       TEXT;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "laminationStatus" "WorkflowStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "laminationQty"    INTEGER;

-- ── Creasing ──────────────────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "creasing"         TEXT;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "creasingStatus"   "WorkflowStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "creasingQty"      INTEGER;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "creasingNo"       TEXT;

-- ── Binding ───────────────────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "binding"          TEXT;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "bindingStatus"    "WorkflowStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "bindingQty"       INTEGER;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "bindingNo"        TEXT;

-- ── Die Cutting ───────────────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "dieCutting"       TEXT;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "dieCuttingStatus" "WorkflowStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "dieCuttingQty"    INTEGER;

-- ── Corner Cutting ────────────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "cornerCutting"       TEXT;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "cornerCuttingStatus" "WorkflowStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "cornerCuttingQty"    INTEGER;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "cornerCuttingValue"  TEXT;

-- ── Cutting (Finishing) ───────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "cutting"          TEXT;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "cuttingStatus"    "WorkflowStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "cuttingValue"     TEXT;

-- ── Cutting2 (ID-card second cut) ─────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "cutting2"         TEXT;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "cutting2Status"   "WorkflowStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "cutting2Value"    TEXT;

-- ── Foil ─────────────────────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "foil"             TEXT;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "foilStatus"       "WorkflowStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "foilQty"          TEXT;

-- ── Fusing (ID card) ─────────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "fusing"           TEXT;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "fusingStatus"     "WorkflowStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "fusingQty"        TEXT;

-- ── Holes (ID card) ──────────────────────────────────────────────────────────
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "holes"            TEXT;
ALTER TABLE "JobItem" ADD COLUMN IF NOT EXISTS "holesStatus"      "WorkflowStatus" NOT NULL DEFAULT 'NONE';

-- ── Indexes for postpress dashboard queries ───────────────────────────────────
CREATE INDEX IF NOT EXISTS "JobItem_jobId_laminationStatus_idx"     ON "JobItem"("jobId", "laminationStatus");
CREATE INDEX IF NOT EXISTS "JobItem_jobId_bindingStatus_idx"        ON "JobItem"("jobId", "bindingStatus");
CREATE INDEX IF NOT EXISTS "JobItem_jobId_cuttingStatus_idx"        ON "JobItem"("jobId", "cuttingStatus");
CREATE INDEX IF NOT EXISTS "JobItem_jobId_foilStatus_idx"           ON "JobItem"("jobId", "foilStatus");
CREATE INDEX IF NOT EXISTS "JobItem_jobId_fusingStatus_idx"         ON "JobItem"("jobId", "fusingStatus");
