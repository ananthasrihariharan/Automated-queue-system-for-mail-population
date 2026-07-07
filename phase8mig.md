# QueueSession Migration (Phase 8) — FINAL IMPLEMENTATION PLAN

Implement Phase 8 PostgreSQL migration for QueueSession.

This is the first Queue subsystem migration.

Production MongoDB code must remain untouched.

No BaseRepository.

No RepositoryFactory.

PostgreSQL implementation remains isolated.

---

## Current Mongo Schema

QueueSession:

staffId → User (required)

loginAt

logoutAt

isActive

isQueuePaused

currentQueueJob → QueueJob

currentWalkinJob → QueueJob

pinnedJobs → Array

pausedJobs → Array

serverVersion

lastSeenAt

Mongo constraint:

Only ONE active session per staff.

---

# Architecture Constraints

Dependencies:

```text
staffId → User
```

Required mapping.

Dependencies not yet migrated:

```text
currentQueueJob → QueueJob

currentWalkinJob → QueueJob
```

QueueJob has NOT been migrated.

Therefore:

DO NOT create SQL foreign keys for QueueJob.

Preserve raw Mongo IDs.

---

# STEP 1 — Update MigrationMap Enum

Add:

QUEUESESSION

to MigrationEntity enum.

---

# STEP 2 — Update Prisma Schema

Add:

```prisma
model QueueSession {

  id                         Int      @id @default(autoincrement())

  legacyMongoId             String?   @unique

  staffId                   Int

  loginAt                   DateTime  @default(now())

  logoutAt                  DateTime?

  isActive                  Boolean   @default(true)

  isQueuePaused            Boolean   @default(false)

  legacyCurrentQueueJobMongoId String?

  legacyCurrentWalkinJobMongoId String?

  pinnedJobs                Json?

  pausedJobs                Json?

  serverVersion             String    @default("1.0.6-trojan")

  lastSeenAt                DateTime?

  createdAt                 DateTime  @default(now())

  updatedAt                 DateTime  @updatedAt

  @@index([staffId])

  @@index([isActive])

  @@index([legacyMongoId])
}
```

Run:

```bash
npx prisma migrate dev --name queuesession_v1
```

Then:

```bash
npx prisma generate
```

---

# STEP 3 — MANUAL SQL PARTIAL UNIQUE INDEX

Mongo allows only one active session per staff.

Postgres must replicate this.

Add raw SQL migration.

Execute:

```sql
CREATE UNIQUE INDEX unique_active_staff_session

ON "QueueSession" ("staffId")

WHERE "isActive" = true;
```

This is mandatory.

Do NOT skip.

---

# STEP 4 — Repository

Create:

repositories/postgres/PgQueueSessionRepository.js

Methods:

```javascript
getById(id)

createSession(data)

getActiveSessionByStaff(staffId)

pauseQueue(id)

resumeQueue(id)

updateLastSeen(id)

logoutSession(id)

deleteSession(id)

getActiveSessions()
```

Rules:

No BaseRepository.

No generic CRUD.

---

# STEP 5 — Migration Script

Create:

scripts/migrateQueueSessions.js

Log:

migration-logs/queuesession_migration.log

Define:

```javascript
const BATCH_SIZE = 50
```

Read Mongo QueueSession.

For EACH record:

Resolve:

staffId → USER

Lookup MigrationMap:

entityType = USER

If mapping missing:

SKIP RECORD

Log failure.

---

QueueJob fields:

DO NOT translate:

currentQueueJob

currentWalkinJob

Store raw Mongo IDs:

```javascript
legacyCurrentQueueJobMongoId

legacyCurrentWalkinJobMongoId
```

---

Store arrays as JSON:

```javascript
pinnedJobs

pausedJobs
```

---

Create transaction:

Inside SAME transaction:

1. Create QueueSession

2. Create MigrationMap

entityType = QUEUESESSION

Atomic write required.

No separate inserts.

No upsert.

Before create:

Check existing by:

legacyMongoId

If exists:

Skip.

Never overwrite.

---

# STEP 6 — Validation Script

Create:

scripts/validateQueueSessionRepo.js

Create validation rows using:

legacyMongoId = VALIDATION_TEST_<timestamp>

Cleanup ONLY by legacyMongoId marker.

Never delete by staffId.

---

Required tests:

createSession()

getById()

getActiveSessionByStaff()

pauseQueue()

resumeQueue()

updateLastSeen()

logoutSession()

deleteSession()

getActiveSessions()

---

CRITICAL TEST

Create two active sessions for SAME staff.

Example:

staffId = 5

Session A → active

Session B → active

Expected:

FAIL

Because partial unique index must block it.

---

Validate JSON storage:

pinnedJobs array

pausedJobs array

Verify exact retrieval.

---

# STEP 7 — Rollback Script

Create:

scripts/rollbackQueueSessions.js

Delete atomically:

QueueSession rows where legacyMongoId != null

AND

MigrationMap rows where entityType = QUEUESESSION

Use transaction.

---

# STEP 8 — Verification Commands

Run:

npx prisma migrate dev --name queuesession_v1

npx prisma generate

node scripts/migrateQueueSessions.js

node scripts/validateQueueSessionRepo.js

node scripts/rollbackQueueSessions.js

node server.js

---

# HARD RULES

DO NOT:

❌ Create QueueJob foreign keys

❌ Translate QueueJob IDs

❌ Use Prisma upsert()

❌ Ignore partial unique index

❌ Touch production Mongo code

❌ Use BaseRepository

❌ Separate QueueSession and MigrationMap inserts

---

# Expected Final Flow

Read Mongo QueueSession

↓

Resolve USER mapping

↓

If USER missing → Skip

↓

Preserve QueueJob Mongo IDs

↓

Store pinnedJobs JSON

↓

Store pausedJobs JSON

↓

Create QueueSession

↓

Create MigrationMap

entityType = QUEUESESSION

↓

Commit transaction
