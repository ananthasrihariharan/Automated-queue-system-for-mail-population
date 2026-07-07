-- Migration: fix_jobitem_types_and_relations
-- Applied via: npx prisma db push (schema already in sync)
--
-- Changes:
--   1. JobItem.qty    INT -> TEXT (Mongo stores '100', 'A4', '2-up')
--   2. JobItem.pages  INT -> TEXT (Mongo stores free-text page specs)
--   3. JobItem.sheets INT -> TEXT (Mongo stores free-text sheet specs)
--   4. Job.createdById made nullable (Mongo ObjectId stored in legacyCreatedByMongoId)
--   5. Job.createdBy relation made optional to match nullable FK

ALTER TABLE "JobItem" ALTER COLUMN "qty"    TYPE TEXT USING "qty"::TEXT;
ALTER TABLE "JobItem" ALTER COLUMN "pages"  TYPE TEXT USING "pages"::TEXT;
ALTER TABLE "JobItem" ALTER COLUMN "sheets" TYPE TEXT USING "sheets"::TEXT;

ALTER TABLE "Job" ALTER COLUMN "createdById" DROP NOT NULL;
