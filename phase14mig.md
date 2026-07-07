Parcel Migration (Phase 14) Implementation Plan

Implement Phase 14 PostgreSQL migration for Parcel. Production MongoDB code must remain untouched, and the PostgreSQL implementation must remain isolated with no BaseRepository or generic CRUD.

User Review Required

IMPORTANT

jobId is stored in MongoDB as a String (not ObjectId).

It represents the business Job identifier (job.jobId) and must NOT be translated using MigrationMap.

qrPayload is a flexible Object and must be stored as Json in PostgreSQL.

No foreign key relationships are introduced in this phase.

Migration must be idempotent — duplicates are skipped, never overwritten.


Proposed Changes

Database Schema

[MODIFY]
schema.prisma

Add PARCEL to MigrationEntity enum.

enum MigrationEntity {
  ...
  PARCEL
}

Add ParcelReceiverType enum.

enum ParcelReceiverType {
  SELF
  OTHER
}

Add Parcel model.

model Parcel {
  id            Int                @id @default(autoincrement())
  legacyMongoId String?           @unique
  parcelId      String            @unique
  jobId         String
  itemCount     Int
  receiverType  ParcelReceiverType
  receiverName  String
  receiverPhone String
  qrPayload     Json?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@index([legacyMongoId])
  @@index([parcelId])
  @@index([jobId])
}


Repositories

[NEW]
PgParcelRepository.js

Create isolated PostgreSQL repository.

Methods:

getById(id) → Fetch by PostgreSQL ID

getByParcelId(parcelId) → Fetch by unique parcelId

getByJobId(jobId) → Fetch all parcels matching jobId

createParcel(data) → Insert new parcel with enum validation

updateReceiver(id, receiverName, receiverPhone) → Update receiver details

deleteParcel(id) → Delete parcel by ID

getAllParcels() → Fetch all parcels

Rules:

No BaseRepository

No generic CRUD inheritance

Return plain JavaScript objects

Explicit enum validation required


Scripts

[NEW]
migrateParcels.js

Migration script requirements:

Define:

const BATCH_SIZE = 50

Process:

Read all Mongo Parcel documents

Check if PostgreSQL record already exists by legacyMongoId

If exists:

Skip migration

Log warning:

Skipped Parcel ${parcelId} Already exists

If not exists:

Insert Parcel row

Create MigrationMap record:

entityType = PARCEL

mongoId = legacyMongoId

postgresId = inserted postgres id

Execute Parcel + MigrationMap creation atomically in Prisma transaction.

Preserve exact Mongo values:

parcelId

jobId

itemCount

receiverType

receiverName

receiverPhone

qrPayload

createdAt

updatedAt

Audit log file:

migration-logs/parcel_migration.log

Log format:

SUCCESS Parcel ${parcelId}

SKIPPED Parcel ${parcelId} Already exists

FAILED Parcel ${parcelId} Reason: ...


[NEW]
rollbackParcels.js

Rollback script.

Count:

Parcel rows where legacyMongoId != null

MigrationMap rows where entityType = PARCEL

Delete atomically using:

prisma.$transaction([
  delete Parcel rows,
  delete MigrationMap rows
])

Log:

Deleted X Parcel rows

Deleted X PARCEL mappings


[NEW]
validateParcelRepo.js

Validation test script.

Create test records using:

legacyMongoId = VALIDATION_TEST_<timestamp>

Cleanup ONLY by:

legacyMongoId startsWith VALIDATION_TEST_

Never cleanup by:

parcelId

receiverName

receiverPhone


Critical Validation Tests

1.

createParcel()

2.

getByParcelId()

3.

getByJobId()

4.

updateReceiver()

5.

deleteParcel()

6. Enum Validation

Allow:

SELF

OTHER

Reject:

INVALID

7. JSON Preservation

Verify qrPayload stores and retrieves exactly.

Example:

{
  "qrCode": "123",
  "createdBy": "admin"
}

8. Duplicate parcelId rejection

Unique constraint must fail.

9. Migration Idempotency

Second migration run must:

Skip duplicates

Never overwrite existing rows

10. Timestamp Preservation

Mongo createdAt and updatedAt must match PostgreSQL exactly after migration.


Verification Plan

Run Prisma migration:

npx prisma migrate dev --name parcel_v1

Generate Prisma client:

npx prisma generate

Run migration:

node scripts/migrateParcels.js

Run validation:

node scripts/validateParcelRepo.js

Run rollback:

node scripts/rollbackParcels.js

Re-run migration:

node scripts/migrateParcels.js

Expected:

Duplicate records skipped

No overwrites occur

Database re-populates correctly

Production boot test:

node server.js

Expected:

MongoDB production path remains unchanged

Server boots normally