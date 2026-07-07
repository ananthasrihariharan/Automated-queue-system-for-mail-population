Implement Phase 3 PostgreSQL infrastructure migration by creating a MigrationMap table for MongoDB ObjectId to PostgreSQL ID translation.

Goal:

Create infrastructure required for future relationship migrations between MongoDB and PostgreSQL.

Current problem:

MongoDB uses ObjectId references.

Example:

User._id = 6852abc

PostgreSQL uses integer primary keys.

Example:

User.id = 1

Future migrations (Customer, Job, QueueJob) require mapping between Mongo ObjectId and PostgreSQL integer IDs.

Step 1 — Update Prisma schema

Add:

model MigrationMap {
id          Int      @id @default(autoincrement())

entityType  String

mongoId     String   @unique

postgresId  Int

createdAt   DateTime @default(now())

@@index([mongoId])
@@index([entityType])
}

Run:

npx prisma migrate dev --name migrationmap_v1

Then:

npx prisma generate

Step 2 — Create PostgreSQL repository

Create:

repositories/postgres/PgMigrationMapRepository.js

Implement methods:

* createMapping(entityType, mongoId, postgresId)
* getPostgresId(entityType, mongoId)
* getMongoId(entityType, postgresId)
* deleteMapping(entityType, mongoId)
* getMappingsByEntity(entityType)

Rules:

* No BaseRepository inheritance
* No generic CRUD methods
* Use Prisma client from lib/prisma.js

Step 3 — Create validation script

Create:

scripts/validateMigrationMap.js

Test:

* create mapping
* duplicate mongoId rejection
* lookup postgresId
* lookup mongoId
* delete mapping
* invalid lookup behavior

Use temporary test records.

Cleanup test records after execution.

Verification:

Run:

npx prisma migrate dev --name migrationmap_v1

npx prisma generate

node scripts/validateMigrationMap.js

node server.js

Do not touch production Mongo code.

Do not migrate Customer, Queue, or Job yet.
