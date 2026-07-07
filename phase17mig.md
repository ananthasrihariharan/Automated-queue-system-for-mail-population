JobEvent Migration (Phase 16) Implementation Plan

Implement Phase 16 PostgreSQL migration for JobEvent. Production MongoDB code must remain untouched, and the PostgreSQL implementation must remain isolated with no BaseRepository or generic CRUD.

User Review Required

IMPORTANT

jobId is a MongoDB ObjectId reference to QueueJob.

During migration, jobId must be translated using MigrationMap where entityType = QUEUEJOB.

If QueueJob mapping is missing:

Skip the JobEvent record and log failure.

userId is an optional MongoDB ObjectId reference to User.

During migration, userId must be translated using MigrationMap where entityType = USER.

If userId mapping is missing:

Store userId as null and continue migration.

details is a flexible Mixed object and must be stored as Json in PostgreSQL.

timestamp must preserve the original MongoDB timestamp exactly.

No foreign key constraints are introduced in this phase.

Migration must be idempotent — duplicates are skipped, never overwritten.


Proposed Changes

Database Schema

[MODIFY]
schema.prisma

Add JOBEVENT to MigrationEntity enum.

enum MigrationEntity {
  ...
  JOBEVENT
}

Add JobEventActionType enum.

enum JobEventActionType {
  CREATED
  ASSIGNED
  IN_PROGRESS
  PAUSED
  RESUMED
  COMPLETED
  REASSIGNED
  MERGED
  DUPLICATE_FLAGGED
  JUNK_FLAGGED
}

Add JobEvent model.

model JobEvent {
  id              Int                 @id @default(autoincrement())

  legacyMongoId   String?            @unique

  queueJobId      Int

  userId          Int?

  actionType      JobEventActionType

  details         Json?

  timestamp       DateTime

  @@index([legacyMongoId])

  @@index([queueJobId])

  @@index([userId])

  @@index([actionType])

  @@index([timestamp])
}


Repositories

[NEW]
PgJobEventRepository.js

Create isolated PostgreSQL repository.

Methods:

getById(id) → Fetch by PostgreSQL ID

getByQueueJob(queueJobId) → Fetch all events for a QueueJob

getByUser(userId) → Fetch all events for a User

createEvent(data) → Insert new event with enum validation

getByActionType(actionType) → Filter by action type

getRecentEvents(limit) → Fetch newest events ordered by timestamp descending

deleteEvent(id) → Delete event by ID

getAllEvents() → Fetch all events

Rules:

No BaseRepository

No generic CRUD inheritance

Return plain JavaScript objects

Explicit enum validation required


Scripts

[NEW]
migrateJobEvents.js

Migration script requirements:

Define:

const BATCH_SIZE = 50

Process:

Read all Mongo JobEvent documents

Resolve jobId using MigrationMap:

entityType = QUEUEJOB

If QueueJob mapping missing:

Skip record

Log failure

Resolve userId using MigrationMap:

entityType = USER

If User mapping missing:

Store userId = null

Continue migration

Check if PostgreSQL record already exists by legacyMongoId

If exists:

Skip migration

Log warning:

Skipped JobEvent Already exists

If not exists:

Insert JobEvent row

Create MigrationMap record:

entityType = JOBEVENT

mongoId = legacyMongoId

postgresId = inserted postgres id

Execute JobEvent + MigrationMap creation atomically using Prisma transaction.

Preserve exact Mongo values:

actionType

details

timestamp

Audit log file:

migration-logs/jobevent_migration.log

Log format:

SUCCESS JobEvent ${legacyMongoId}

SKIPPED JobEvent Already exists

FAILED JobEvent ${legacyMongoId} Reason: Missing QueueJob mapping


[NEW]
rollbackJobEvents.js

Rollback script.

Count:

JobEvent rows where legacyMongoId != null

MigrationMap rows where entityType = JOBEVENT

Delete atomically using:

prisma.$transaction([
  delete JobEvent rows,
  delete MigrationMap rows
])

Log:

Deleted X JobEvent rows

Deleted X JOBEVENT mappings


[NEW]
validateJobEventRepo.js

Validation test script.

Create test records using:

legacyMongoId = VALIDATION_TEST_<timestamp>

Cleanup ONLY by:

legacyMongoId startsWith VALIDATION_TEST_

Never cleanup by:

actionType

timestamp


Critical Validation Tests

1.

createEvent()

2.

getByQueueJob()

3.

getByUser()

4.

getByActionType()

5.

deleteEvent()

6.

getRecentEvents(limit)

Must verify:

orderBy timestamp DESC

7. Enum Validation

Allow:

CREATED
ASSIGNED
IN_PROGRESS
PAUSED
RESUMED
COMPLETED
REASSIGNED
MERGED
DUPLICATE_FLAGGED
JUNK_FLAGGED

Reject invalid enum values.

8. JSON Preservation

details object must store and retrieve exactly.

Example:

{
  "oldStatus": "QUEUED",
  "newStatus": "ASSIGNED",
  "reason": "manual assignment"
}

9. Missing QueueJob Mapping

If QueueJob MigrationMap entry missing:

Record must be skipped.

10. Missing User Mapping

If User MigrationMap entry missing:

Insert succeeds

userId stored as null

11. Timestamp Preservation

Mongo timestamp must match PostgreSQL exactly after migration.

12. Migration Idempotency

Second migration run must:

Skip duplicates

Never overwrite existing rows


Verification Plan

Run Prisma migration:

npx prisma migrate dev --name jobevent_v1

Generate Prisma client:

npx prisma generate

Run migration:

node scripts/migrateJobEvents.js

Run validation:

node scripts/validateJobEventRepo.js

Run rollback:

node scripts/rollbackJobEvents.js

Re-run migration:

node scripts/migrateJobEvents.js

Expected:

Duplicate records skipped

No overwrites occur

Database re-populates correctly

Production boot test:

node server.js

Expected:

MongoDB production path remains unchanged

Server boots normally