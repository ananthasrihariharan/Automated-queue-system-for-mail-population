Implement Phase 2 PostgreSQL migration for the SystemConfig model.

Current Mongo schema:

const SystemConfigSchema = new mongoose.Schema({
key: { type: String, required: true, unique: true },
value: { type: mongoose.Schema.Types.Mixed, required: true },
description: String,
updatedAt: { type: Date, default: Date.now }
});

Architecture constraints:

* Production MongoDB code must remain untouched
* Do NOT modify routes or services
* Do NOT introduce RepositoryFactory
* Do NOT use BaseRepository inheritance for PostgreSQL repositories
* PostgreSQL implementation must remain isolated

Step 1 — Update Prisma schema

Create SQL schema:

model SystemConfig {
id          Int       @id @default(autoincrement())

key         String    @unique

value       Json

description String?

updatedAt   DateTime  @updatedAt

@@index([key])
}

Run:

npx prisma migrate dev --name systemconfig_migration_v1

Then:

npx prisma generate

Step 2 — Create PostgreSQL repository

Create:

repositories/postgres/PgSystemConfigRepository.js

Implement methods:

* getConfigByKey(key)
* setConfig(key, value)
* updateConfig(key, value)
* deleteConfig(key)
* getAllConfigs()

Rules:

* Use Prisma client from lib/prisma.js
* No generic CRUD methods
* No BaseRepository inheritance

Step 3 — Create migration script

Create:

scripts/migrateSystemConfig.js

Requirements:

* Read Mongo SystemConfig collection
* Upsert records into PostgreSQL
* Use key as unique identifier
* Preserve value field as JSON
* Batch process with prisma.$transaction()
* Log migration success/failure to migration-logs/systemconfig_migration.log

Step 4 — Create validation script

Create:

scripts/validateSystemConfigRepo.js

Test:

* create config
* fetch config by key
* update config
* delete config
* duplicate key rejection
* null description
* nested JSON storage/retrieval
* array JSON storage/retrieval

Use temporary keys:

test_config_${Date.now()}

Cleanup all test records after validation.

Step 5 — Create rollback script

Create:

scripts/rollbackSystemConfig.js

Requirements:

* Count records before deletion
* Log deletion count
* Delete migrated records safely
* Close Prisma and Mongo connections

Verification:

Run:

npx prisma migrate dev --name systemconfig_migration_v1

npx prisma generate

node scripts/migrateSystemConfig.js

node scripts/validateSystemConfigRepo.js

node scripts/rollbackSystemConfig.js

node server.js

Do not touch any other models.

Do not migrate Customer, Queue, Job, or Dispatch yet.
