Implement Phase 5 PostgreSQL migration for Customer.

Current Mongo schema:

const CustomerSchema = new mongoose.Schema({
name: {
type: String,
required: true
},

phone: {
type: String,
required: true,
unique: true
},

alternatePhones: [String],

password: {
type: String,
required: true,
select: false
},

isCreditCustomer: {
type: Boolean,
default: false
},

isPremium: {
type: Boolean,
default: false
},

emails: [String]

}, { timestamps: true })

Architecture constraints:

* Production Mongo code remains untouched
* No BaseRepository
* No RepositoryFactory
* PostgreSQL remains isolated
* Migration must create MigrationMap entries for CUSTOMER

========================================
STEP 1 — UPDATE PRISMA SCHEMA
=============================

Create:

model Customer {
id               Int      @id @default(autoincrement())

legacyMongoId    String?  @unique

name             String

phone            String   @unique

alternatePhones  String[]

password         String

isCreditCustomer Boolean  @default(false)

isPremium        Boolean  @default(false)

emails           String[]

createdAt        DateTime @default(now())

updatedAt        DateTime @updatedAt

@@index([phone])

@@index([legacyMongoId])
}

Run:

npx prisma migrate dev --name customer_v1

Then:

npx prisma generate

========================================
STEP 2 — CREATE REPOSITORY
==========================

Create:

repositories/postgres/PgCustomerRepository.js

Methods:

* getCustomerByPhone(phone)
* getCustomerById(id)
* createCustomer(data)
* updateCustomer(id, data)
* updatePremiumStatus(id, status)
* deleteCustomer(id)

Rules:

* No BaseRepository inheritance
* No generic CRUD methods

========================================
STEP 3 — CREATE MIGRATION SCRIPT
================================

Create:

scripts/migrateCustomers.js

Logic:

Read Mongo Customer documents

For each customer:

1. Transfer password hash unchanged

2. Store alternatePhones array

3. Store emails array

4. Insert PostgreSQL Customer

5. Create MigrationMap entry

entityType = CUSTOMER

mongoId = Mongo _id

postgresId = PostgreSQL id

Rules:

* Never rehash password
* Preserve original password hash
* Use legacyMongoId as identity
* Log migration success/failure

Create:

migration-logs/customer_migration.log

========================================
STEP 4 — CREATE VALIDATION SCRIPT
=================================

Create:

scripts/validateCustomerRepo.js

Test:

* create customer
* duplicate phone rejection
* alternatePhones array storage
* emails array storage
* update premium status
* update customer fields
* delete customer
* password hash unchanged

Cleanup test records after validation.

========================================
STEP 5 — VERIFICATION
=====================

Run:

npx prisma migrate dev --name customer_v1

npx prisma generate

node scripts/migrateCustomers.js

node scripts/validateCustomerRepo.js

node server.js

Do not touch Queue, Job, or production Mongo code.
