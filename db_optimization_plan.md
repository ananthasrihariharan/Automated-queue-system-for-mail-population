# PostgreSQL Schema — Scalability & Performance Audit + Implementation Plan

## 1. Current Schema Inventory (37 tables)

| Table | Rows estimate | Hot | Issues |
|---|---|---|---|
| `Job` | high | yes | missing composite indexes, no partial index on isDeleted |
| `JobItem` | very high | yes | missing (jobId, activeStage) composite |
| `JobItemWorkflowStep` | very high | yes | adequate |
| `LaminationSpec` / `BindingSpec` / etc. (7 spec tables) | moderate | read-heavy | adequate |
| `JobParcel` / `JobParcelItem` | moderate | yes | adequate |
| `JobTaskLog` | very high | append-only | missing createdAt index for pruning |
| `JobItemScreenshot` | moderate | read-heavy | adequate |
| `PackingOverride` | low | - | adequate |
| `QueueJob` | high | yes | missing critical composites |
| `QueueSession` | moderate | yes | missing (staffId, isActive) composite |
| `QueueMessage` | high | yes | recipientId is String not FK; missing composite |
| `QueueRequest` | low | - | missing FK on requestedById |
| `QueueStats` | singleton | - | no time-series, anti-pattern |
| `QueueUnread` | moderate | - | adequate |
| `JobEvent` | very high | append-only | adequate |
| `JobCard` | moderate | read-heavy | flat denormalized — dual schema with JobItem specs |
| `JobCardDieCuttingRow` | low | - | adequate |
| `Customer` | moderate | yes | adequate |
| `CustomerPreference` | low | - | adequate |
| `WalkinRequest` | low | - | missing FK relations |
| `IngestionTask` | low | - | adequate |
| `User` / `UserRole` / `Role` | low | yes | adequate |
| `SystemConfig` | tiny | read-heavy | adequate |
| `Parcel` (legacy) | low | - | superseded by JobParcel — confusion risk |
| `MigrationMap` | moderate | migration-only | can archive post-migration |
| `WriteSyncLog` / `SyncFailureQueue` | moderate | migration-only | can archive post-migration |

---

## 2. Missing Indexes — Critical Gaps

### 2.1 `Job` Table

The cashier, dispatch, customer, and reports modules all hit this table heavily.

```prisma
// CRITICAL: Used in every date-range query (cashier, reports)
@@index([createdAt])

// CRITICAL: Cashier "show unpaid printed jobs today"
@@index([jobStatus, paymentStatus])

// CRITICAL: Reports groupBy with date
@@index([jobStatus, createdAt])

// HIGH: Customer dashboard active vs history split
@@index([customerId, jobStatus])

// HIGH: Dispatch history tab (dispatched on date X)
@@index([dispatchedAt])

// HIGH: Cashier searching by customerName
// Use GIN full-text in production; for now:
@@index([customerName])   // already exists — verify it's there
```

**Add to Prisma schema under `Job`:**
```prisma
@@index([createdAt])
@@index([jobStatus, paymentStatus])
@@index([jobStatus, createdAt])
@@index([customerId, jobStatus])
@@index([dispatchedAt])
```

### 2.2 `QueueJob` Table

Core of the prepress queue engine — every assignment cycle reads this table.

```prisma
// CRITICAL: Queue ordering — status + position is the primary sort
@@index([status, queuePosition])

// CRITICAL: Staff assignment lookups
@@index([status, assignedToId])

// HIGH: Queue timeline / history views
@@index([status, createdAt])

// HIGH: Filter by job type (EMAIL, WALKIN, WHATSAPP)
@@index([status, type])

// HIGH: Breach risk calculations (due soon)
@@index([dueBy])

// HIGH: Hold processing — find jobs whose hold has expired
@@index([holdUntil])
```

**Add to Prisma schema under `QueueJob`:**
```prisma
@@index([status, queuePosition])
@@index([status, assignedToId])
@@index([status, createdAt])
@@index([status, type])
@@index([dueBy])
@@index([holdUntil])
```

### 2.3 `QueueSession` Table

Every staff login and active-session lookup hits this.

```prisma
// CRITICAL: "Is this staff currently active?" check fires on every queue tick
@@index([staffId, isActive])
```

### 2.4 `QueueMessage` Table

Messaging system — every chat poll reads by recipientId ordered by timestamp.

```prisma
// HIGH: Message thread queries
@@index([recipientId, timestamp])
```

### 2.5 `JobItem` Table

Press, Post-Press, and Finishing modules all filter items by stage.

```prisma
// HIGH: "Give me all items at stage X for this job"
@@index([jobId, activeStage])

// MEDIUM: Press module filtering by pressStatus
@@index([pressStatus])
```

### 2.6 `JobTaskLog` Table

Already has `@@index([staffId, module, completedAt])` — good. Add pruning support:

```prisma
// Allows efficient time-windowed cleanup of old logs
@@index([completedAt])
```

### 2.7 `JobEvent` Table

Already has `@@index([actionType, timestamp, userId])` — adequate.

---

## 3. Partial Indexes (PostgreSQL-native — use `@@index` with `map` + raw migration)

Prisma does not support partial indexes in schema syntax. Add these via a raw migration file:

```sql
-- Active jobs only (every live query filters isDeleted = false)
CREATE INDEX CONCURRENTLY idx_job_active_created
  ON "Job" ("createdAt" DESC)
  WHERE "isDeleted" = false;

CREATE INDEX CONCURRENTLY idx_job_active_status_payment
  ON "Job" ("jobStatus", "paymentStatus")
  WHERE "isDeleted" = false;

CREATE INDEX CONCURRENTLY idx_queuejob_active_status_pos
  ON "QueueJob" ("status", "queuePosition")
  WHERE "isDeleted" = false;

CREATE INDEX CONCURRENTLY idx_queuesession_active
  ON "QueueSession" ("staffId")
  WHERE "isActive" = true AND "isDeleted" = false;

CREATE INDEX CONCURRENTLY idx_customer_active_phone
  ON "Customer" ("phone")
  WHERE "isDeleted" = false;
```

Run these as a separate migration: `npx prisma migrate dev --name add_partial_indexes`
Then add the raw SQL in `prisma/migrations/<timestamp>_add_partial_indexes/migration.sql`.

---

## 4. Schema Design Issues

### 4.1 QueueMessage.recipientId — String type (HIGH RISK)

**Problem:** `recipientId String` is compared as a string in every message query, bypassing FK integrity. If the value is a stringified user ID (`"42"`) it works but is slower than integer FK lookup and can silently hold orphaned records.

**Fix:**
```prisma
model QueueMessage {
  // Change:
  recipientId   String     // current
  // To:
  recipientId   Int        // target
  recipient     User       @relation("MessageRecipient", fields: [recipientId], references: [id])
}
```
Migration requires a data transformation step: `UPDATE "QueueMessage" SET "recipientId" = CAST("recipientId" AS INTEGER)` and alter column type.

### 4.2 QueueStats — Singleton Anti-pattern (MEDIUM)

**Problem:** A single row with no timestamp cannot track trend data. Every update overwrites history. The admin reports module already does date-range queries but QueueStats has no date dimension.

**Fix:** Add a `snapshotAt DateTime @default(now())` column and write new rows instead of updating one. The latest row is the current state.

```prisma
model QueueStats {
  id              Int      @id @default(autoincrement())
  snapshotAt      DateTime @default(now())
  // ... same columns ...
  
  @@index([snapshotAt])
}
```

The stats service should `create` a snapshot every N minutes, and the live query reads the most-recent row.

### 4.3 Dual Parcel Models (MEDIUM)

**Problem:** `Parcel` (legacy flat model) and `JobParcel`/`JobParcelItem` (relational model) coexist. The `Parcel` model stores `jobId` as a String referencing the old job ID string format; `JobParcel` correctly uses integer FK `jobId Int`. This can cause confusion about which model is authoritative.

**Decision needed:** Once all active data is confirmed in `JobParcel`/`JobParcelItem`, mark `Parcel` as archived and stop writing to it.

### 4.4 Missing FK Constraints (MEDIUM)

These fields store user IDs but have no Prisma relation defined:

| Table | Field | Fix |
|---|---|---|
| `WalkinRequest` | `requestedById Int` | Add `requestedBy User @relation(...)` |
| `WalkinRequest` | `assignedToId Int?` | Add `assignedTo User? @relation(...)` |
| `QueueRequest` | `requestedById Int` | Add `requestedBy User @relation(...)` |
| `QueueJob` | `assignedToId Int?` | Add `assignedTo User? @relation(...)` |
| `QueueJob` | `pinnedToStaffId Int?` | Add `pinnedToStaff User? @relation(...)` |
| `QueueJob` | `lastPausedById Int?` | Add `lastPausedBy User? @relation(...)` |
| `QueueJob` | `reassignedFromId Int?` | Add `reassignedFrom User? @relation(...)` |
| `JobEvent` | `userId Int?` | Add `user User? @relation(...)` |

**Impact:** Without FK constraints, orphaned references can accumulate silently. PostgreSQL won't enforce referential integrity.

### 4.5 Job.paymentMode — String instead of Enum (LOW)

**Problem:** `paymentMode String?` accepts any value. The code uses `'CASH' | 'UPI' | 'CARD' | 'ONLINE' | 'CREDIT'` but nothing enforces this.

**Fix:**
```prisma
enum PaymentMode {
  CASH
  UPI
  CARD
  ONLINE
  CREDIT
}

model Job {
  paymentMode PaymentMode?
}
```

### 4.6 JobCard — Flat Denormalized vs JobItem Normalized Specs (LOW)

**Problem:** `JobCard` stores post-press specs as flat booleans/strings (`hasLamination`, `lamGlossy`, etc.) while `JobItem` uses proper relational spec tables (`LaminationSpec`, `BindingSpec`, etc.). These two representations must be kept in sync manually.

**Long-term fix:** Generate `JobItem` specs from `JobCard` on creation (already done in `applyJobCardsToItems.js`). Deprecate direct writing to `JobCard` spec columns once all lookups go through `JobItem` specs.

---

## 5. Performance Anti-patterns in Code

### 5.1 N+1 Writes in Job Creation (HIGH)

**File:** `repositories/postgres/PgJobRepository.js:writeJobRelations`

**Problem:** Items, specs, parcels, and parcel items are all created in individual `await tx.X.create()` loops inside a transaction. For a job with 10 items each having 3 specs = 40+ round trips inside one transaction.

**Fix:** Use `createMany` where supported:
```js
// Instead of:
for (const item of items) {
  await tx.jobItem.create({ data: item });
}

// Use:
await tx.jobItem.createMany({ data: items.map(...) });
```
Note: Spec tables that use `@id` as FK (like `LaminationSpec`) can also use `createMany`. `DieCuttingRow` can batch. This reduces transaction RTT from O(n*specs) to O(specs_types) = ~8 queries regardless of item count.

### 5.2 getAllJobs() Has No Pagination (HIGH)

**File:** `repositories/postgres/PgJobRepository.js:getAllJobs`

**Problem:** Loads every job with all relations — unbounded. At 10k jobs with relations this causes OOM.

**Fix:** Always require `take` + `skip`:
```js
async getAllJobs(skip = 0, take = 50) {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
    skip,
    take,
    include: includeRelations
  });
}
```

### 5.3 Reports N+1 per User (MEDIUM)

**File:** `modules/admin/backend/reports.js:staff-productivity`

**Problem:** Loops over all filtered users and fires a separate `prisma.job.count()` per user. With 50 staff = 50 sequential queries.

**Fix:** Use a single `groupBy` query:
```js
const jobCounts = await prisma.job.groupBy({
  by: [matchField],
  where: {
    [matchField]: { in: filteredUserIds },
    createdAt: { gte: startDate, lte: endDate }
  },
  _count: { id: true }
});
const countMap = Object.fromEntries(jobCounts.map(r => [r[matchField], r._count.id]));
```

### 5.4 QueueJob.aggregate() Loads All Completed Jobs (MEDIUM)

**File:** `repositories/postgres/PgQueueJobRepository.js:aggregate`

**Problem:** Loads all completed jobs into JS memory to calculate average duration.

**Fix:** Use Prisma's `_avg` aggregate or a raw SQL average:
```js
const result = await prisma.$queryRaw`
  SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "assignedAt")) * 1000) as avg
  FROM "QueueJob"
  WHERE status = 'COMPLETED'
    AND "assignedAt" IS NOT NULL
    AND "completedAt" IS NOT NULL
`;
```

### 5.5 updateJob Full Reconciliation on Every Save (MEDIUM)

**File:** `repositories/postgres/PgJobRepository.js:updateJob`

**Problem:** Every `.save()` call on a job object reconciles ALL child relations even when only one field changed (e.g., updating `paymentStatus` reconciles all items, parcels, specs, screenshots, and task logs).

**Fix:** Implement targeted update methods:
```js
async updatePaymentStatus(jobId, paymentStatus, paymentHandledById, paymentMode) { ... }
async updateJobStatus(jobId, jobStatus) { ... }  // already exists
async updateRackLocation(jobId, rackLocation) { ... }
async updatePackingPreference(jobId, preference) { ... }
```
Use these targeted methods in module backends instead of the full `save()` path.

---

## 6. Legacy Migration Cleanup Plan (Post Go-Live)

Once the system is fully on PostgreSQL and MongoDB is retired:

1. **Drop `MigrationMap`** — no longer needed for ID mapping
2. **Drop `WriteSyncLog`** — sync tracking no longer needed
3. **Drop `SyncFailureQueue`** — sync failures no longer apply
4. **Drop all `legacyMongoId` columns** — across User, Customer, Job, QueueJob, QueueSession, JobCard, JobEvent, etc.
5. **Drop all `legacyXxxMongoId` FK bridging columns** on Job (e.g., `legacyCreatedByMongoId`, `legacyPrintedByMongoId`, etc.)
6. **Drop `Parcel` (legacy model)** — superseded by `JobParcel`/`JobParcelItem`
7. **Clean up `QueueMessage.legacyJobMongoId`** → replace with proper `Int?` FK to `QueueJob.id`

---

## 7. Phased Implementation Plan

### Phase 1 — Immediate Index Additions (1–2 days, zero downtime with CONCURRENTLY)

1. Add to `prisma/schema.prisma` under each model:
   - `Job`: `[createdAt]`, `[jobStatus, paymentStatus]`, `[jobStatus, createdAt]`, `[customerId, jobStatus]`, `[dispatchedAt]`
   - `QueueJob`: `[status, queuePosition]`, `[status, assignedToId]`, `[status, createdAt]`, `[status, type]`, `[dueBy]`, `[holdUntil]`
   - `QueueSession`: `[staffId, isActive]`
   - `QueueMessage`: `[recipientId, timestamp]`
   - `JobItem`: `[jobId, activeStage]`, `[pressStatus]`
   - `JobTaskLog`: `[completedAt]`

2. Run: `npx prisma migrate dev --name phase1_perf_indexes`

3. Create manual partial indexes migration file with `CONCURRENTLY` SQL (section 3 above)

**Expected impact:** 5–20× speedup on cashier date queries, queue fetch, and report aggregations.

### Phase 2 — Targeted Update Methods (3–5 days, code change)

1. Add `updatePaymentStatus`, `updateRackLocation`, `updatePackingPreference`, `addTaskLog`, `updateItemStage` methods to `PgJobRepository`
2. Update cashier backend to use `updatePaymentStatus`
3. Update dispatch backend to use `updateRackLocation` and `updateJobStatus`
4. Update press backend to use `updateItemStage`
5. Add pagination to `getAllJobs`

**Expected impact:** Eliminates full-reconcile transactions for simple field updates.

### Phase 3 — Schema Fixes (1 week, requires migration)

1. Fix `QueueMessage.recipientId` → `Int` with FK (requires data migration)
2. Add `PaymentMode` enum, alter `Job.paymentMode`
3. Add missing FK relations (WalkinRequest, QueueRequest, QueueJob FK fields, JobEvent)
4. Add `QueueStats.snapshotAt` and convert to time-series writes
5. Deprecate `Parcel` (legacy) — stop writes, add `@deprecated` comment

### Phase 4 — Query Optimization (3–5 days)

1. Fix reports N+1 with `groupBy` approach
2. Fix `QueueJob.aggregate()` with raw SQL AVG
3. Replace `createMany` for item/spec batch inserts in `writeJobRelations`

### Phase 5 — Legacy Cleanup (post go-live, 1–2 days)

Run after MongoDB is fully decommissioned and all legacy columns are confirmed unused in code.

---

## 8. Quick Reference: Schema Changes Summary

Add these index declarations to `prisma/schema.prisma`:

```prisma
// Job model — add:
@@index([createdAt])
@@index([jobStatus, paymentStatus])
@@index([jobStatus, createdAt])
@@index([customerId, jobStatus])
@@index([dispatchedAt])

// QueueJob model — add:
@@index([status, queuePosition])
@@index([status, assignedToId])
@@index([status, createdAt])
@@index([status, type])
@@index([dueBy])
@@index([holdUntil])

// QueueSession model — add:
@@index([staffId, isActive])

// QueueMessage model — add:
@@index([recipientId, timestamp])

// JobItem model — add:
@@index([jobId, activeStage])
@@index([pressStatus])

// JobTaskLog model — add:
@@index([completedAt])
```

Total new indexes: **16 regular + 5 partial** = significant query performance gains with minimal storage overhead (indexes on filtered columns in a print ERP are typically small).
