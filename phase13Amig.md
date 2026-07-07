Phase 13A — QueueJob PostgreSQL Migration Implementation Plan

Implement Phase 13A of the MongoDB → PostgreSQL migration for the QueueJob model.

This is a critical core ERP migration and must follow strict architectural constraints.

Production MongoDB code must remain completely untouched. PostgreSQL implementation must remain fully isolated with no BaseRepository inheritance, no generic CRUD repositories, and no production code switching.

Critical Architectural Rules
1. No Production Changes

Do NOT modify:

Mongo models
Existing services
Controllers
Routes
UserRepository.js
Any production Mongo code path

PostgreSQL implementation remains isolated only.

2. No Self-Referential FK Yet

QueueJob has:

parentJobId → QueueJob

DO NOT create a PostgreSQL self-relation.

DO NOT create:

parentJobId Int FK

Instead store:

legacyParentJobMongoId String?

Self-reference resolution will happen in a later relational fix phase.

3. No Upsert Logic

DO NOT use:

upsert()
overwrite existing records
update existing migrated rows

Migration behavior:

If legacyMongoId already exists → skip record and log warning
4. Missing User Mappings Must NOT Skip Record

QueueJob references User in 4 fields.

If User MigrationMap lookup fails:

DO NOT skip QueueJob record
Store corresponding Postgres field as null
Continue migration
Database Schema Changes

Modify:

prisma/schema.prisma
despatch system/prisma/schema.prisma
Add MigrationEntity Enum

Add:

QUEUEJOB
Add Prisma Enums
enum QueueJobStatus {
  QUEUED
  ASSIGNED
  IN_PROGRESS
  PAUSED
  COMPLETED
  DUPLICATE
  JUNK
  ADMIN_REVIEW
}

enum QueueJobType {
  EMAIL
  WALKIN
  WHATSAPP
}

enum QueueComplexityTag {
  easy
  medium
  complex
}

enum QueueHoldBehavior {
  RETURN_TO_POOL
  STAY_HOLD
}
Add QueueJob Model
model QueueJob {
  id                       Int       @id @default(autoincrement())
  legacyMongoId           String?   @unique

  emailSubject            String?
  customerName            String?
  customerEmail           String?
  customerPhone           String?
  mailBody                String?

  folderPath              String
  relativeFolderPath      String?

  attachments             String[] @default([])

  attachmentMeta          Json?
  externalLinks           Json?

  status                  QueueJobStatus

  priorityScore           Int @default(0)
  queuePosition           Int @default(0)

  pinnedToStaffId         Int?
  isHardPinned            Boolean @default(false)

  assignedToId            Int?
  assignedAt              DateTime?
  completedAt             DateTime?

  dueBy                   DateTime?

  complexityTag           QueueComplexityTag?

  lastPausedById          Int?

  type                    QueueJobType

  handoffNotes            String?
  staffHandoffReason      String?
  adminHandoffNotes       String?

  reassignedFromId        Int?

  returnReason            String?
  pauseReason             String?

  holdUntil               DateTime?

  holdBehavior            QueueHoldBehavior @default(STAY_HOLD)

  fingerprint             String?
  threadId                String?

  version                 Int @default(1)

  isAutoAssigned          Boolean @default(false)

  continuityContext       String?

  legacyParentJobMongoId  String?

  isSuperseded            Boolean @default(false)

  auditLog               Json?

  createdAt              DateTime
  updatedAt              DateTime

  @@index([legacyMongoId])
  @@index([customerEmail])
  @@index([status])
  @@index([assignedToId])
  @@index([pinnedToStaffId])
  @@index([fingerprint])
  @@index([threadId])
}
PostgreSQL Repository

Create:

repositories/postgres/PgQueueJobRepository.js

No BaseRepository.

No generic CRUD.

Implement:

getById(id)

createJob(data)

getByStatus(status)

getByAssignedUser(userId)

getByPinnedUser(userId)

updateStatus(id, status)

assignJob(id, userId)

completeJob(id)

deleteJob(id)

getRecentJobs(limit)

All methods return plain JS objects.

Migration Script

Create:

scripts/migrateQueueJobs.js
Batch Size

Explicitly define:

const BATCH_SIZE = 50
Read Mongo Records

Read all QueueJob documents.

User Mapping Translation

Translate using MigrationMap.

Lookup:

assignedTo
pinnedToStaff
lastPausedBy
reassignedFrom

Using:

entityType = USER

Store:

assignedToId
pinnedToStaffId
lastPausedById
reassignedFromId

If mapping missing:

store null
DO NOT skip record
Parent Job Handling

Mongo:

parentJobId

Store:

legacyParentJobMongoId

DO NOT resolve.

DO NOT create foreign key.

auditLog Transformation

Mongo format:

{
  action,
  actor,
  timestamp,
  details
}

Transform each entry.

Translate actor using USER MigrationMap.

Store transformed format:

{
  action,
  actorId: postgresUserId || null,
  legacyActorMongoId: originalMongoId || null,
  timestamp,
  details
}

Store entire array as:

auditLog Json
Preserve JSON Fields Exactly

Preserve without transformation:

attachmentMeta
externalLinks

Store directly as Json.

Preserve Arrays Exactly
attachments → String[]

Must match exactly.

Duplicate Detection

Before insert:

find by legacyMongoId

If exists:

skip record

log:
Skipped QueueJob <id> Reason: Already migrated

No overwrite.

Atomic Transaction

Single transaction:

1. Insert QueueJob
2. Insert MigrationMap

Create MigrationMap:

entityType = QUEUEJOB
mongoId = original Mongo _id
postgresId = inserted postgres ID
Preserve Original Timestamps

Preserve exact Mongo timestamps:

createdAt
updatedAt
assignedAt
completedAt

DO NOT generate new timestamps.

Audit Logging

Create log file:

migration-logs/queuejob_migration.log

Log:

success
failure
skipped
mapping warnings
Validation Script

Create:

scripts/validateQueueJobRepo.js

Use:

legacyMongoId = VALIDATION_TEST_<timestamp>

Cleanup ONLY using:

legacyMongoId startsWith VALIDATION_TEST_

Never cleanup by name/email.

Required Validation Tests

Test:

Array Preservation

Verify:

attachments

matches exactly.

JSON Preservation

Verify:

attachmentMeta
externalLinks

match exactly.

auditLog Translation

Verify:

actor translated correctly
legacyActorMongoId preserved
Missing User Mapping

Simulate missing:

assignedTo

Expected:

assignedToId = null

Record still inserts successfully.

Parent Job Preservation

Verify:

legacyParentJobMongoId

matches exact Mongo value.

Enum Validation

Reject invalid values for:

QueueJobStatus
QueueJobType
QueueComplexityTag
QueueHoldBehavior
Repository Methods

Validate:

createJob()

getById()

getByStatus()

assignJob()

updateStatus()

completeJob()

deleteJob()
Rollback Script

Create:

scripts/rollbackQueueJobs.js

Count:

QueueJob rows where legacyMongoId != null

MigrationMap rows where entityType = QUEUEJOB

Delete atomically using:

prisma.$transaction()

Delete:

QueueJob records

MigrationMap records

Log deleted counts.

Verification Commands

Run:

npx prisma migrate dev --name queuejob_v1

npx prisma generate

node scripts/migrateQueueJobs.js

node scripts/validateQueueJobRepo.js

node scripts/rollbackQueueJobs.js

node scripts/migrateQueueJobs.js

node server.js
Final Non-Negotiable Rule
DO NOT CREATE SELF FOREIGN KEY FOR parentJobId IN THIS PHASE.

Store ONLY:

legacyParentJobMongoId

QueueJob self-reference relational fix will happen in a later phase.

Implement exactly as specified. No shortcuts. No production code changes.