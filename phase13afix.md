QueueJob Migration Fix (Critical Schema Correction)

A critical issue was discovered in Phase 13A QueueJob PostgreSQL migration.

Problem Discovered

During QueueJob migration, PostgreSQL failed with:

Value out of range for the type: value "1778214741837" is out of range for type integer

Investigation completed.

A MongoDB diagnostic script confirmed the root cause.

The field causing failure is:

queuePosition

Example corrupted records found in MongoDB:

Mongo ID: 69fc8ec38473d4f68a16a5f1
queuePosition: 1778159299338

Mongo ID: 69fd67556b38b4adb014efec
queuePosition: 1778214741837

Over 100 QueueJob records contain queuePosition values far exceeding PostgreSQL INTEGER limits.

Current PostgreSQL schema:

queuePosition INTEGER NOT NULL DEFAULT 0

PostgreSQL INTEGER max:

2147483647

Actual values:

1778214741837

Root Cause

queuePosition in MongoDB is storing timestamp-like values (similar to Date.now()) instead of small FIFO integers.

This is NOT a migration bug.

This is existing production data behavior.

Because of this:

QueueJob migration partially succeeded

151 QueueJobs migrated

101 QueueJobs failed

As a consequence:

JobEvent migration skipped 533 records because corresponding QueueJob mappings were missing


Required Fix

Schema Change

Modify QueueJob schema.

Current:

queuePosition Int @default(0)

Change to:

queuePosition BigInt @default(0)

This must update PostgreSQL column type from:

INTEGER

to:

BIGINT


Migration Required

Create a new Prisma migration:

npx prisma migrate dev --name queuejob_fix_bigint


Rollback Existing Partial QueueJob Migration

Delete partially migrated QueueJob records.

Run:

node scripts/rollbackQueueJobs.js


Re-run QueueJob Migration

Run:

node scripts/migrateQueueJobs.js

Expected result:

All QueueJob records migrate successfully

No integer overflow failures

No skipped records

No partial inserts


Rollback Existing JobEvent Migration

Since JobEvent depended on QueueJob mappings, many records were skipped.

Run:

node scripts/rollbackJobEvents.js


Re-run JobEvent Migration

Run:

node scripts/migrateJobEvents.js

Expected:

Previously skipped 533 JobEvent records should migrate successfully

No missing QueueJob mapping failures


Additional Investigation Required

Search the entire codebase.

Somewhere application logic is writing timestamp values into queuePosition.

Search globally for:

queuePosition

Look for logic similar to:

queuePosition = Date.now()

or

queuePosition = new Date().getTime()

or any timestamp assignment.


Verification Steps

1.

Modify schema:

queuePosition BigInt

2.

Run migration:

npx prisma migrate dev --name queuejob_fix_bigint

3.

Rollback QueueJob:

node scripts/rollbackQueueJobs.js

4.

Re-run QueueJob migration:

node scripts/migrateQueueJobs.js

Expected:

Full migration succeeds

No failed records

5.

Rollback JobEvent:

node scripts/rollbackJobEvents.js

6.

Re-run JobEvent migration:

node scripts/migrateJobEvents.js

Expected:

No skipped JobEvents

7.

Test production server:

node server.js


Important Rules

Do NOT modify MongoDB production code

Do NOT change repository architecture

Do NOT truncate queuePosition values

Do NOT force queuePosition to 0

Preserve all original MongoDB values exactly

Use BIGINT to preserve production data integrity


Expected Final State

QueueJob migration completes fully

No integer overflow errors

JobEvent migration completes fully

No skipped JobEvents

Production MongoDB path remains untouched