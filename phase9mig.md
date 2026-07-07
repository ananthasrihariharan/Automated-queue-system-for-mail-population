# QueueUnread Migration (Phase 9) — FINAL IMPLEMENTATION PLAN

Implement Phase 9 PostgreSQL migration for QueueUnread.

Production MongoDB code must remain untouched.

No BaseRepository.

No RepositoryFactory.

PostgreSQL implementation remains isolated.

---

## Current Mongo Schema

QueueUnread:

userId → User (required)

threadId → String

count → Number

Mongo unique constraint:

(userId, threadId)

must be unique.

---

# Architecture Constraints

Dependency:

userId → User

Required MigrationMap translation.

Lookup:

entityType = USER

If USER mapping missing:

SKIP RECORD.

---

IMPORTANT:

threadId is stored as String.

Comment in Mongo schema:

Normalized thread ID

(other user's _id or 'all')

This means threadId MAY contain Mongo ObjectId strings.

DO NOT translate threadId.

Preserve exactly as stored.

No conversion.

No foreign key.

---

# STEP 1 — Update MigrationMap Enum

Add:

QUEUEUNREAD

to MigrationEntity enum.

---

# STEP 2 — Update Prisma Schema

Add:

```prisma
model QueueUnread {

  id             Int      @id @default(autoincrement())

  legacyMongoId  String?  @unique

  userId         Int

  threadId       String

  count          Int      @default(0)

  createdAt      DateTime @default(now())

  updatedAt      DateTime @updatedAt

  @@unique([userId, threadId])

  @@index([userId])

  @@index([threadId])

  @@index([legacyMongoId])
}
```

Run:

```bash
npx prisma migrate dev --name queueunread_v1
```

Then:

```bash
npx prisma generate
```

---

# STEP 3 — Repository

Create:

repositories/postgres/PgQueueUnreadRepository.js

Methods:

```javascript
getById(id)

getUnreadByUser(userId)

getUnreadByThread(userId, threadId)

createUnread(data)

incrementCount(id)

resetCount(id)

deleteUnread(id)
```

Rules:

No BaseRepository

No generic CRUD wrapper

---

# STEP 4 — Migration Script

Create:

scripts/migrateQueueUnread.js

Create log:

migration-logs/queueunread_migration.log

Define:

```javascript
const BATCH_SIZE = 50
```

Read Mongo QueueUnread documents.

For EACH record:

Resolve:

userId → USER mapping

Lookup MigrationMap:

entityType = USER

If mapping missing:

SKIP RECORD

Log failure.

---

DO NOT translate threadId.

Store exactly as Mongo stored it.

Examples:

"all"

"685ca82ab293"

"thread_123"

All must remain unchanged.

---

Before insert:

Check existing by:

legacyMongoId

If exists:

Skip record.

Never overwrite.

No upsert.

---

Atomic transaction:

Inside SAME transaction:

1. Create QueueUnread

2. Create MigrationMap

entityType = QUEUEUNREAD

Rules:

QueueUnread + MigrationMap must be atomic.

No separate inserts.

---

# STEP 5 — Validation Script

Create:

scripts/validateQueueUnreadRepo.js

Create validation rows using:

legacyMongoId = VALIDATION_TEST_<timestamp>

Cleanup ONLY by legacyMongoId prefix.

Never delete by threadId.

---

Required tests

createUnread()

getById()

getUnreadByUser()

getUnreadByThread()

incrementCount()

resetCount()

deleteUnread()

---

CRITICAL TEST 1

Composite unique constraint.

Create:

(userId = 5, threadId = abc)

Then create again:

(userId = 5, threadId = abc)

Expected:

FAIL

Must reject duplicate composite key.

---

CRITICAL TEST 2

threadId preservation.

Insert:

threadId = 685ca82ab293

Retrieve.

Must match exactly.

No conversion.

---

CRITICAL TEST 3

incrementCount()

Start:

count = 0

After increment:

count = 1

---

CRITICAL TEST 4

resetCount()

Start:

count = 5

After reset:

count = 0

---

# STEP 6 — Rollback Script

Create:

scripts/rollbackQueueUnread.js

Delete atomically:

QueueUnread rows where legacyMongoId != null

AND

MigrationMap rows where entityType = QUEUEUNREAD

Use transaction.

---

# STEP 7 — Verification Commands

Run:

npx prisma migrate dev --name queueunread_v1

npx prisma generate

node scripts/migrateQueueUnread.js

node scripts/validateQueueUnreadRepo.js

node scripts/rollbackQueueUnread.js

node server.js

---

# HARD RULES

DO NOT:

❌ Translate threadId

❌ Create threadId foreign key

❌ Use Prisma upsert()

❌ Touch production Mongo code

❌ Use BaseRepository

❌ Use RepositoryFactory

❌ Separate QueueUnread and MigrationMap inserts

---

# Expected Final Flow

Read Mongo QueueUnread

↓

Resolve USER mapping

↓

If USER missing → Skip

↓

Preserve threadId exactly

↓

Create QueueUnread

↓

Create MigrationMap

entityType = QUEUEUNREAD

↓

Commit transaction
