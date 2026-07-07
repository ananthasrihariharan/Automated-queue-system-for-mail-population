# QueueRequest Migration (Phase 11) — FINAL IMPLEMENTATION PLAN

Implement Phase 11 PostgreSQL migration for QueueRequest.

Production MongoDB code must remain untouched.

No BaseRepository.

No RepositoryFactory.

PostgreSQL implementation remains isolated.

---

Current Mongo Schema:

QueueRequest

type → WALKIN | REASSIGN

description

requestedBy → User

jobId → QueueJob

status → PENDING | APPROVED | REJECTED

adminAction

resultJobId → QueueJob

---

Architecture Constraints

requestedBy → User

Requires MigrationMap lookup.

entityType = USER

If mapping missing:

SKIP RECORD.

---

QueueJob NOT migrated.

DO NOT translate:

jobId

resultJobId

Preserve raw Mongo IDs.

Store as:

legacyJobMongoId

legacyResultJobMongoId

No foreign keys.

---

DO NOT enforce business logic constraints.

Even if:

WALKIN + resultJobId null

REASSIGN + jobId null

Store exactly as Mongo allows.

No SQL restrictions.

Preserve existing behavior.

---

STEP 1 — MigrationMap enum

Add:

QUEUEREQUEST

---

STEP 2 — Prisma Schema

Add:

```prisma id="c2x3qp"
enum QueueRequestType {
  WALKIN
  REASSIGN
}

enum QueueRequestStatus {
  PENDING
  APPROVED
  REJECTED
}
```

Add model:

```prisma id="y2t0zy"
model QueueRequest {

  id                       Int      @id @default(autoincrement())

  legacyMongoId           String?  @unique

  type                    QueueRequestType

  description             String

  requestedById           Int

  legacyJobMongoId        String?

  status                  QueueRequestStatus @default(PENDING)

  adminAction             String?

  legacyResultJobMongoId String?

  createdAt               DateTime @default(now())

  updatedAt               DateTime @updatedAt

  @@index([requestedById])

  @@index([status])

  @@index([legacyMongoId])
}
```

Run:

```bash id="a5r7vk"
npx prisma migrate dev --name queuerequest_v1

npx prisma generate
```

---

STEP 3 — Repository

Create:

repositories/postgres/PgQueueRequestRepository.js

Methods:

```javascript id="ealw6r"
getById(id)

createRequest(data)

getRequestsByUser(userId)

getPendingRequests()

approveRequest(id, adminAction)

rejectRequest(id, adminAction)

deleteRequest(id)

getRequestsByType(type)
```

Rules:

No BaseRepository

No generic CRUD

---

approveRequest()

Must atomically update:

status = APPROVED

adminAction = value

Single update query.

---

rejectRequest()

Must atomically update:

status = REJECTED

adminAction = value

Single update query.

---

STEP 4 — Migration Script

Create:

scripts/migrateQueueRequests.js

Create log:

migration-logs/queuerequest_migration.log

Define:

```javascript id="0zjlwm"
const BATCH_SIZE = 50
```

Read Mongo QueueRequest documents.

Resolve:

requestedBy → USER mapping

Lookup:

MigrationMap(USER)

If missing:

SKIP RECORD

Log failure.

---

Preserve raw:

jobId

resultJobId

Store as:

legacyJobMongoId

legacyResultJobMongoId

No translation.

---

Check existing by:

legacyMongoId

If exists:

Skip.

No overwrite.

No upsert.

---

Inside SAME transaction:

1 Create QueueRequest

2 Create MigrationMap

entityType = QUEUEREQUEST

Atomic write required.

---

STEP 5 — Validation Script

Create:

scripts/validateQueueRequestRepo.js

Validation rows:

legacyMongoId = VALIDATION_TEST_<timestamp>

Cleanup ONLY by validation marker.

Never delete by description.

---

Required tests

createRequest()

getById()

getRequestsByUser()

getPendingRequests()

approveRequest()

rejectRequest()

deleteRequest()

getRequestsByType()

---

CRITICAL TEST 1

Type enum validation

WALKIN → allowed

REASSIGN → allowed

TEST → reject

---

CRITICAL TEST 2

Status enum validation

PENDING → allowed

APPROVED → allowed

REJECTED → allowed

DONE → reject

---

CRITICAL TEST 3

approveRequest()

Before:

status = PENDING

adminAction = ""

After:

status = APPROVED

adminAction populated

Single atomic update.

---

CRITICAL TEST 4

rejectRequest()

Before:

status = PENDING

After:

status = REJECTED

adminAction populated

Single atomic update.

---

CRITICAL TEST 5

QueueJob id preservation.

Insert:

legacyJobMongoId = 685abc

legacyResultJobMongoId = 123xyz

Retrieve.

Must match exactly.

No conversion.

---

STEP 6 — Rollback Script

Create:

scripts/rollbackQueueRequests.js

Delete atomically:

QueueRequest rows where legacyMongoId != null

AND

MigrationMap rows where entityType = QUEUEREQUEST

Use transaction.

---

STEP 7 — Verification

Run:

npx prisma migrate dev --name queuerequest_v1

npx prisma generate

node scripts/migrateQueueRequests.js

node scripts/validateQueueRequestRepo.js

node scripts/rollbackQueueRequests.js

node server.js

---

HARD RULES

DO NOT:

❌ Translate jobId

❌ Translate resultJobId

❌ Create QueueJob foreign key

❌ Use Prisma upsert()

❌ Touch production Mongo code

❌ Use BaseRepository

❌ Use RepositoryFactory

---

Expected flow:

Read Mongo QueueRequest

↓

Resolve requestedBy → USER

↓

Preserve jobId

↓

Preserve resultJobId

↓

Create QueueRequest

↓

Create MigrationMap

entityType = QUEUEREQUEST

↓

Commit transaction
