# QueueStats Migration (Phase 12) — FINAL IMPLEMENTATION PLAN

Implement Phase 12 PostgreSQL migration for QueueStats.

Production MongoDB code remains untouched.

No BaseRepository.

No RepositoryFactory.

PostgreSQL implementation isolated.

---

Mongo Schema

QueueStats stores dashboard counters.

Fields:

queued

assigned

paused

completedToday

adminReview

junk

totalInProgress

activeSessions

breachRisk15

breachRisk5

staleJobs

lastUpdated

---

Architecture Constraints

QueueStats has:

NO ObjectId references

NO foreign keys

NO relationships

NO dependencies

---

DO NOT:

Create MigrationMap entries

Create legacyMongoId field

Use MigrationEntity enum

Use batch migration logic

Use Prisma upsert()

---

STEP 1 — Prisma Schema

Add model:

```prisma
model QueueStats {

  id              Int      @id @default(autoincrement())

  queued          Int      @default(0)

  assigned        Int      @default(0)

  paused          Int      @default(0)

  completedToday  Int      @default(0)

  adminReview     Int      @default(0)

  junk            Int      @default(0)

  totalInProgress Int      @default(0)

  activeSessions  Int      @default(0)

  breachRisk15    Int      @default(0)

  breachRisk5     Int      @default(0)

  staleJobs       Int      @default(0)

  lastUpdated     DateTime @default(now())
}
```

Run:

```bash
npx prisma migrate dev --name queuestats_v1

npx prisma generate
```

---

STEP 2 — Repository

Create:

repositories/postgres/PgQueueStatsRepository.js

Methods:

```javascript
getStats()

createStats(data)

updateStats(id, data)

resetStats(id)

deleteStats(id)
```

Rules:

No BaseRepository

No generic CRUD

---

getStats()

MUST use:

findFirst()

NOT findMany()

Return single object.

O(1) retrieval.

---

resetStats()

Must atomically set ALL numeric fields to 0.

Update lastUpdated = new Date()

Single update query.

---

STEP 3 — Migration Script

Create:

scripts/migrateQueueStats.js

NO batch logic.

Read Mongo:

QueueStats.findOne()

If no document:

Exit cleanly.

---

Check Postgres:

queueStats.findFirst()

If exists:

SKIP migration.

No overwrite.

No upsert.

---

Preserve exact Mongo timestamp:

lastUpdated

Do NOT generate new timestamp.

---

STEP 4 — Validation Script

Create:

scripts/validateQueueStatsRepo.js

Tests:

createStats()

getStats()

updateStats()

resetStats()

deleteStats()

---

CRITICAL TEST 1

getStats()

Must return single object.

Not array.

Use findFirst().

---

CRITICAL TEST 2

resetStats()

Before:

queued = 10

assigned = 5

After:

All numeric fields = 0

lastUpdated changed.

---

CRITICAL TEST 3

Timestamp preservation.

Mongo lastUpdated date must match migrated PostgreSQL date exactly.

---

CRITICAL TEST 4

Numeric integrity.

Store:

breachRisk15 = 999

breachRisk5 = 123

Retrieve exact values.

---

STEP 5 — Rollback

Create:

scripts/rollbackQueueStats.js

Delete all QueueStats rows.

No MigrationMap.

No transaction needed.

Example:

deleteMany({})

---

STEP 6 — Verification

Run:

npx prisma migrate dev --name queuestats_v1

npx prisma generate

node scripts/migrateQueueStats.js

node scripts/validateQueueStatsRepo.js

node scripts/rollbackQueueStats.js

node server.js

---

HARD RULES

DO NOT:

❌ Use MigrationMap

❌ Add legacyMongoId

❌ Use batch size

❌ Use upsert()

❌ Touch production Mongo code

❌ Use BaseRepository

❌ Use RepositoryFactory

---

Expected flow

Read single Mongo QueueStats document

↓

Check if Postgres row exists

↓

If exists → skip

↓

Else create QueueStats row

↓

Preserve exact lastUpdated timestamp

↓

Done
