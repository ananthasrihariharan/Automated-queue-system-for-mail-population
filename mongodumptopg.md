Database Migration: MongoDB to PostgreSQL
This plan details the implementation strategy to migrate the existing MongoDB database dump (mongodb://127.0.0.1:27017/Despatch_System) into the PostgreSQL database (postgresql://postgres:ash@localhost:5432/despatch) managed via Prisma.

Since all Mongoose schemas have been removed from the application, the migration will utilize the raw MongoDB Node.js driver (mongodb) to extract documents directly from the database collections and write them to PostgreSQL via the Prisma Client (lib/prisma.js).

User Review Required
IMPORTANT

Pre-migration Wipe: The migration script will truncate all existing PostgreSQL tables to ensure a clean, duplicate-free migration. All sequences will be restarted.
Idempotency: A MigrationMap table will be populated during the migration. This records the mapping between MongoDB _id and the newly generated auto-incrementing PostgreSQL id for each entity type, allowing us to accurately resolve relational fields.
Roles Seeding: The Role table in PostgreSQL will be automatically seeded before migrating users, and UserRole relationships will be created based on each user's legacy MongoDB roles array.
Open Questions
None at this time. All necessary tables and relations have been mapped from the Prisma schema and the postgres repository files.

Proposed Changes
Database Migration Scripts
[NEW] 
migrateMongoToPg.js
This script will:

Establish connections to MongoDB and PostgreSQL (Prisma).
Clean/truncate all tables in PostgreSQL using TRUNCATE ... CASCADE to prevent relational constraint issues.
Seed the standard application roles into the Role table.
Extract, transform, and load collections in topological dependency order:
Phase 1: independent entities
SystemConfig
User (and link roles in UserRole)
Customer
IngestionTask
QueueStats
Phase 2: user & customer dependent entities
CustomerPreference (references User preferred staff ID)
QueueSession (references User staff ID)
QueueUnread (references User user ID)
QueueRequest (references User requester ID)
WalkinRequest (references User requester/assigned staff ID)
QueueJob (references User assigned/pinned/paused staff ID; self-references mapped post-pass)
JobCard (+ nested JobCardDieCuttingRow rows)
Phase 3: jobs & queues dependent entities
Job (references Customer customer ID, User creator/printer/PPS/finishing/dispatch staff IDs)
Also inserts related JobItem, specifications (Lamination, Binding, Creasing, Cutting, Die Cutting, Corner Cutting, Foil, ID Card), JobItemScreenshot, JobTaskLog, PackingOverride, JobParcel, and JobParcelItem rows.
QueueMessage (references User sender/recipient IDs, QueueJob legacy ID)
JobEvent (references User user ID, QueueJob queueJobId)
Parcel
Run a post-pass to update self-referential relations like QueueJob.parentJobId by looking up parent Mongo IDs in the MigrationMap cache.
Disconnect from both databases safely.
[NEW] 
validateMigration.js
This verification script will compare the total document count in each MongoDB collection with the corresponding row count in the PostgreSQL database tables to ensure data integrity and highlight any missing elements.

[NEW] 
rollbackMigration.js
A quick utility script to wipe out all migrated PostgreSQL records and reset the database state to a clean slate, allowing safe retries.

Verification Plan
Automated Tests
We will execute the migration, validation, and rollback scripts in sequence using the following command lines:

Run Migration:
bash

node scripts/migrateMongoToPg.js
Run Validation:
bash

node scripts/validateMigration.js
Verify App Booting:
bash

node server.js