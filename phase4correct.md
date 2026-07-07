Apply the following corrections to the Phase 4 CustomerPreference migration plan.

Do not change the overall architecture.

Only apply these corrections.

========================================
CORRECTION 1 — REMOVE UPSERT LOGIC
==================================

Current plan uses:

Prisma upsert()
based on composite key:

(customerEmail, preferredStaffId)

Remove this.

Do NOT use upsert.

Reason:

If User migration changes and preferredStaffId changes later,
upsert() creates duplicate records instead of updating.

New migration logic:

1. Check if record exists by customerEmail

2. If record already exists:

Skip migration

Log warning

Example:

Skipped [hari@gmail.com](mailto:hari@gmail.com)
Reason: Existing customer preference already present

3. If record does not exist:

Create new PostgreSQL record

Rules:

* No Prisma upsert()
* Use explicit existence check + create()

========================================
CORRECTION 2 — PRESERVE ORIGINAL MONGO USER ID
==============================================

Current schema loses Mongo traceability.

Add field:

legacyPreferredStaffMongoId String?

Final schema must include:

legacyPreferredStaffMongoId

Purpose:

Store original Mongo preferredStaff ObjectId for audit/debugging.

Example:

Mongo:

preferredStaff = 6852abc

Postgres:

preferredStaffId = 7

Store:

legacyPreferredStaffMongoId = 6852abc

Rules:

* Always preserve original Mongo ObjectId
* Never discard source reference

========================================
CORRECTION 3 — ADD MIGRATION COUNT VERIFICATION
===============================================

Before migration:

Count Mongo records:

const mongoCount =
await CustomerPreference.countDocuments()

Log:

Mongo CustomerPreference count: 32

After migration:

Count PostgreSQL records:

const pgCount =
await prisma.customerPreference.count()

Log:

Postgres CustomerPreference count: 30

Compare counts.

If mismatch:

console.warn(
"WARNING: Some records skipped during migration"
)

Reason:

Records may be skipped due to missing USER mapping.

Migration success cannot be declared without count comparison.

========================================
CORRECTION 4 — TEST MISSING USER MAPPING FAILURE
================================================

Validation script currently tests repository CRUD.

This is insufficient.

Add relationship failure test.

Simulate:

CustomerPreference record contains:

preferredStaff = Mongo ObjectId

But MigrationMap has no USER mapping.

Expected behavior:

* Migration skips record
* Logs failure
* Does NOT insert PostgreSQL row

Validation must confirm:

No row inserted when USER mapping is missing.

Purpose:

This is the first dependency migration.

Must verify relationship integrity enforcement.

========================================
DO NOT CHANGE ANYTHING ELSE
===========================

Do not modify:

* Repository interface
* Production Mongo code
* MigrationMap architecture
* PostgreSQL isolation design

Only apply these 4 corrections.
