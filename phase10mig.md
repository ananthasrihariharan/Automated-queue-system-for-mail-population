# QueueMessage Migration (Phase 10) — FINAL IMPLEMENTATION PLAN

Implement Phase 10 PostgreSQL migration for QueueMessage.

Production MongoDB code must remain untouched.

No BaseRepository.

No RepositoryFactory.

PostgreSQL implementation remains isolated.

---

## Current Mongo Schema

QueueMessage:

sender → User

senderName

recipientId → String (User ID OR ALL)

body

type → DIRECT | BROADCAST

jobId → QueueJob

timestamp

---

# Architecture Constraints

Dependencies:

sender → User

Requires MigrationMap translation.

Lookup:

entityType = USER

If missing:

SKIP RECORD.

---

QueueJob is NOT migrated yet.

Therefore:

DO NOT translate:

jobId

Preserve raw Mongo ID.

Store as:

legacyJobMongoId

No foreign key.

---

recipientId is String.

Can contain:

ALL

Mongo ObjectId string

Future identifiers

DO NOT translate recipientId.

Preserve exactly.

No foreign key.

---

# STEP 1 — Update MigrationMap Enum

Add:

QUEUEMESSAGE

to MigrationEntity enum.

---

# STEP 2 — Update Prisma Schema

Add enum:

```prisma
enum QueueMessageType {
  DIRECT
  BROADCAST
}
```

Add model:

```prisma
model QueueMessage {

  id                     Int      @id @default(autoincrement())

  legacyMongoId         String?  @unique

  senderId              Int

  senderName            String

  recipientId           String

  body                  String

  type                  QueueMessageType

  legacyJobMongoId      String?

  timestamp             DateTime @default(now())

  createdAt             DateTime @default(now())

  updatedAt             DateTime @updatedAt

  @@index([senderId])

  @@index([recipientId])

  @@index([timestamp])

  @@index([legacyMongoId])
}
```

Run:

```bash
npx prisma migrate dev --name queuemessage_v1
npx prisma generate
```

---

# STEP 3 — Repository

Create:

repositories/postgres/PgQueueMessageRepository.js

Methods:

```javascript
getById(id)

createMessage(data)

getMessagesBySender(senderId)

getMessagesByRecipient(recipientId)

getBroadcastMessages()

getMessagesByType(type)

deleteMessage(id)

getRecentMessages(limit)
```

Rules:

No BaseRepository.

No generic CRUD.

---

# STEP 4 — Migration Script

Create:

scripts/migrateQueueMessages.js

Log:

migration-logs/queuemessage_migration.log

Define:

```javascript
const BATCH_SIZE = 50
```

Read Mongo QueueMessage documents.

For EACH record:

Resolve:

sender → USER mapping

Lookup MigrationMap:

entityType = USER

If missing:

SKIP RECORD.

Log failure.

---

DO NOT translate:

recipientId

jobId

Preserve exactly.

Store:

recipientId

legacyJobMongoId

---

Before insert:

Check existing by:

legacyMongoId

If exists:

Skip.

Never overwrite.

No upsert.

---

Inside SAME transaction:

1 Create QueueMessage

2 Create MigrationMap

entityType = QUEUEMESSAGE

Atomic write required.

---

# STEP 5 — Validation Script

Create:

scripts/validateQueueMessageRepo.js

Create validation rows using:

legacyMongoId = VALIDATION_TEST_<timestamp>

Cleanup ONLY by validation marker.

Never cleanup by body or senderName.

---

Required tests:

createMessage()

getById()

getMessagesBySender()

getMessagesByRecipient()

getBroadcastMessages()

getMessagesByType()

deleteMessage()

getRecentMessages(limit)

---

CRITICAL TEST 1

recipientId preservation.

Insert:

recipientId = ALL

Retrieve.

Must remain ALL.

---

CRITICAL TEST 2

recipientId preservation.

Insert:

recipientId = 685ca82ab293

Retrieve.

Must match exactly.

No conversion.

---

CRITICAL TEST 3

jobId preservation.

Insert:

legacyJobMongoId = 685abc123

Retrieve.

Must match exactly.

---

CRITICAL TEST 4

Enum validation.

DIRECT → allowed

BROADCAST → allowed

TEST → reject

---

CRITICAL TEST 5

Recent sorting.

Insert 3 messages.

Different timestamps.

Run:

getRecentMessages(2)

Must return newest first.

Descending timestamp.

---

# STEP 6 — Rollback Script

Create:

scripts/rollbackQueueMessages.js

Delete atomically:

QueueMessage rows where legacyMongoId != null

AND

MigrationMap rows where entityType = QUEUEMESSAGE

Use transaction.

---

# STEP 7 — Verification Commands

Run:

npx prisma migrate dev --name queuemessage_v1

npx prisma generate

node scripts/migrateQueueMessages.js

node scripts/validateQueueMessageRepo.js

node scripts/rollbackQueueMessages.js

node server.js

---

# HARD RULES

DO NOT:

❌ Translate recipientId

❌ Translate jobId

❌ Create QueueJob foreign key

❌ Use Prisma upsert()

❌ Touch production Mongo code

❌ Use BaseRepository

❌ Use RepositoryFactory

---

Expected flow:

Read Mongo QueueMessage

↓

Resolve sender → USER mapping

↓

Preserve recipientId exactly

↓

Preserve jobId as legacyJobMongoId

↓

Create QueueMessage

↓

Create MigrationMap

entityType = QUEUEMESSAGE

↓

Commit transaction
