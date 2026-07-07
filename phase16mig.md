JobCard Migration (Phase 15) Implementation Plan

Implement Phase 15 PostgreSQL migration for JobCard. Production MongoDB code must remain untouched, and the PostgreSQL implementation must remain isolated with no BaseRepository or generic CRUD.

User Review Required

IMPORTANT

jobId is stored as a business identifier String and must NOT be translated using MigrationMap.

JobCard contains multiple deeply nested process configuration objects (binding, dieCutting, cornerCutting, cutting, lamination, creasingPerforation, foil, idCard).

These nested structures must NOT be flattened into separate SQL tables.

All nested objects and arrays must be preserved as Json fields.

No foreign key relationships are introduced in this phase.

Migration must be idempotent — duplicates are skipped, never overwritten.


Proposed Changes

Database Schema

[MODIFY]
schema.prisma

Add JOBCARD to MigrationEntity enum.

enum MigrationEntity {
  ...
  JOBCARD
}

Add JobCard model.

model JobCard {
  id                    Int       @id @default(autoincrement())

  legacyMongoId         String?   @unique

  jobId                 String    @unique

  customerName          String

  totalItems            Int

  attBy                 String?

  date                  DateTime?

  processes             Json?

  vcBox                 Json?

  binding               Json?

  dieCutting            Json?

  cornerCutting         Json?

  cutting               Json?

  lamination            Json?

  creasingPerforation   Json?

  foil                  Json?

  idCard                Json?

  createdAt             DateTime  @default(now())

  updatedAt             DateTime  @updatedAt

  @@index([legacyMongoId])

  @@index([jobId])
}


Repositories

[NEW]
PgJobCardRepository.js

Create isolated PostgreSQL repository.

Methods:

getById(id) → Fetch by PostgreSQL ID

getByJobId(jobId) → Fetch by unique jobId

createJobCard(data) → Insert new JobCard

updateProcesses(id, processes) → Update process flags JSON

updateSection(id, sectionName, sectionData) → Update one nested JSON section

deleteJobCard(id) → Delete JobCard by ID

getAllJobCards() → Fetch all job cards

Rules:

No BaseRepository

No generic CRUD inheritance

Return plain JavaScript objects only


Scripts

[NEW]
migrateJobCards.js

Migration script requirements:

Define:

const BATCH_SIZE = 50

Process:

Read all Mongo JobCard documents

Check if PostgreSQL record already exists by legacyMongoId

If exists:

Skip migration

Log warning:

Skipped JobCard ${jobId} Already exists

If not exists:

Insert JobCard row

Create MigrationMap record:

entityType = JOBCARD

mongoId = legacyMongoId

postgresId = inserted postgres id

Execute JobCard + MigrationMap creation atomically using Prisma transaction.

Preserve exact Mongo values:

jobId

customerName

totalItems

attBy

date

processes

vcBox

binding

dieCutting

cornerCutting

cutting

lamination

creasingPerforation

foil

idCard

createdAt

updatedAt

Audit log file:

migration-logs/jobcard_migration.log

Log format:

SUCCESS JobCard ${jobId}

SKIPPED JobCard ${jobId} Already exists

FAILED JobCard ${jobId} Reason: ...


[NEW]
rollbackJobCards.js

Rollback script.

Count:

JobCard rows where legacyMongoId != null

MigrationMap rows where entityType = JOBCARD

Delete atomically using:

prisma.$transaction([
  delete JobCard rows,
  delete MigrationMap rows
])

Log:

Deleted X JobCard rows

Deleted X JOBCARD mappings


[NEW]
validateJobCardRepo.js

Validation test script.

Create test records using:

legacyMongoId = VALIDATION_TEST_<timestamp>

Cleanup ONLY by:

legacyMongoId startsWith VALIDATION_TEST_

Never cleanup by:

jobId

customerName


Critical Validation Tests

1.

createJobCard()

2.

getByJobId()

3.

updateProcesses()

4.

updateSection()

5.

deleteJobCard()

6. JSON Preservation

Verify all nested sections store and retrieve exactly:

processes

binding

dieCutting.rows[]

cornerCutting.corners

cutting.sizes[]

lamination

creasingPerforation

foil

idCard

7. Deep Nested Array Preservation

Verify arrays remain exact.

Example:

dieCutting.rows = [
  {
    sheets: "100",
    halfCut: "yes",
    throughCut: "no",
    timing: "10:00"
  }
]

Must retrieve identically.

8. Duplicate jobId rejection

Unique constraint must fail.

9. Migration Idempotency

Second migration run must:

Skip duplicates

Never overwrite existing rows

10. Timestamp Preservation

Mongo createdAt and updatedAt must match PostgreSQL exactly after migration.


Verification Plan

Run Prisma migration:

npx prisma migrate dev --name jobcard_v1

Generate Prisma client:

npx prisma generate

Run migration:

node scripts/migrateJobCards.js

Run validation:

node scripts/validateJobCardRepo.js

Run rollback:

node scripts/rollbackJobCards.js

Re-run migration:

node scripts/migrateJobCards.js

Expected:

Duplicate records skipped

No overwrites occur

Database re-populates correctly

Production boot test:

node server.js

Expected:

MongoDB production path remains unchanged

Server boots normally