Implement Phase 4 PostgreSQL migration for CustomerPreference.

Current Mongo schema:

const CustomerPreferenceSchema = new mongoose.Schema(
{
customerEmail: {
type: String,
required: true,
index: true
},

customerName: {
type: String,
default: ''
},

preferredStaff: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User',
required: true
},

confirmedCount: {
type: Number,
default: 1
}
},
{ timestamps: true }
)

CustomerPreferenceSchema.index(
{ customerEmail: 1, preferredStaff: 1 },
{ unique: true }
)

Architecture constraints:

* Production MongoDB code remains untouched
* No RepositoryFactory
* No BaseRepository inheritance
* PostgreSQL code remains isolated
* Must use MigrationMap for User ID translation

STEP 1 — Prisma schema

Add:

model CustomerPreference {
id               Int      @id @default(autoincrement())

customerEmail    String

customerName     String?

preferredStaffId Int

confirmedCount   Int      @default(1)

createdAt        DateTime @default(now())
updatedAt        DateTime @updatedAt

@@unique([customerEmail, preferredStaffId])

@@index([customerEmail])

@@index([preferredStaffId])
}

Run:

npx prisma migrate dev --name customerpreference_v1

Then:

npx prisma generate

STEP 2 — PostgreSQL repository

Create:

repositories/postgres/PgCustomerPreferenceRepository.js

Methods:

* getByCustomerEmail(email)
* createPreference(data)
* updateConfirmedCount(id, count)
* updatePreferredStaff(id, staffId)
* deletePreference(id)
* getByPreferredStaff(staffId)

Rules:

* No BaseRepository inheritance
* No generic CRUD methods

STEP 3 — Migration script

Create:

scripts/migrateCustomerPreference.js

Logic:

Read Mongo CustomerPreference documents.

For each document:

1. Extract preferredStaff Mongo ObjectId

2. Query MigrationMap:

entityType = USER

3. Get postgres User.id

4. If mapping exists:

Insert PostgreSQL CustomerPreference

5. If mapping missing:

Skip record

Log failure

Rules:

* Never insert null preferredStaffId
* Never store Mongo ObjectId in PostgreSQL
* Use MigrationMap for translation

Create migration log:

migration-logs/customerpreference_migration.log

STEP 4 — Validation script

Create:

scripts/validateCustomerPreferenceRepo.js

Test:

* create preference
* duplicate email + staff rejection
* getByCustomerEmail
* getByPreferredStaff
* updateConfirmedCount
* updatePreferredStaff
* delete preference
* invalid lookup behavior

Cleanup test records after execution.

STEP 5 — Verification

Run:

npx prisma migrate dev --name customerpreference_v1

npx prisma generate

node scripts/migrateCustomerPreference.js

node scripts/validateCustomerPreferenceRepo.js

node server.js

Do not touch production Mongo code.

Do not migrate Customer, Queue, or Job yet.
