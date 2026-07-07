Apply the following final corrections to Phase 5 Customer migration.

Do not change architecture.

Only apply these corrections.

========================================
CORRECTION 1 — SAFE VALIDATION CLEANUP
======================================

Current validation cleanup:

delete records where:

* phone starts with 9999
* name starts with test_
* email starts with test_

This is unsafe.

Reason:

Real production records may accidentally match.

Remove this cleanup logic.

Replace with explicit validation marker.

During validation test record creation:

Set:

legacyMongoId = VALIDATION_TEST_<timestamp>

Example:

VALIDATION_TEST_1718701234

Cleanup rule:

Delete records only where:

legacyMongoId startsWith("VALIDATION_TEST_")

Use:

deleteMany({
where: {
legacyMongoId: {
startsWith: "VALIDATION_TEST_"
}
}
})

Rules:

* Never cleanup using phone
* Never cleanup using email
* Never cleanup using name

Only cleanup using validation marker.

========================================
CORRECTION 2 — ADD ROLLBACK SCRIPT
==================================

Create:

scripts/rollbackCustomers.js

Purpose:

Rollback Customer migration safely.

Logic:

1. Count migrated Customer rows:

where legacyMongoId != null

2. Count MigrationMap rows:

where entityType = CUSTOMER

3. Execute transaction:

Delete Customer rows

Delete MigrationMap rows

Use:

await prisma.$transaction([
customerDeleteOperation,
migrationMapDeleteOperation
])

4. Log results

Example:

Deleted 28 customers

Deleted 28 migration mappings

Rules:

* Never delete only Customer records
* Always remove matching MigrationMap records
* Rollback must be atomic

========================================
OPTIONAL IMPROVEMENT
====================

Define batch size explicitly.

Use:

const BATCH_SIZE = 50

Do not leave batch processing unspecified.

========================================
DO NOT CHANGE ANYTHING ELSE
===========================

Only apply these corrections.
Apply the following corrections to the existing Phase 5 Customer migration plan.

Do not change the overall architecture.

Only apply these corrections.

========================================
CORRECTION 1 — REMOVE UPSERT LOGIC
==================================

Current plan uses:

Prisma upsert()

keyed by:

legacyMongoId

Remove this.

Do NOT use upsert.

Reason:

If a partially corrupted customer record already exists,
upsert() silently overwrites evidence of migration corruption.

New migration logic:

1. Check if Customer already exists by legacyMongoId

2. If exists:

Skip migration

Log warning

Example:

Skipped customer 9876543210
Reason: Customer already migrated

3. If not exists:

Create new Customer record

Rules:

* No Prisma upsert()
* Use explicit existence check + create()

========================================
CORRECTION 2 — CUSTOMER + MIGRATIONMAP MUST BE TRANSACTIONAL
============================================================

Current flow:

Insert Customer

Then:

Insert MigrationMap

This is unsafe.

Failure scenario:

Customer insert succeeds

MigrationMap insert fails

Result:

Customer exists

No MigrationMap entry exists

Future relationship migrations break.

Fix:

Wrap both operations in one Prisma transaction.

Use:

await prisma.$transaction([
customerCreateOperation,
migrationMapCreateOperation
])

Rules:

* Customer insert and MigrationMap insert must succeed together
* Never allow partial inserts

========================================
CORRECTION 3 — ADD ARRAY EDGE CASE VALIDATION
=============================================

Current validation tests:

alternatePhones array storage

emails array storage

This is insufficient.

Add 4 array tests.

CASE A — normal array

emails = ["[a@gmail.com](mailto:a@gmail.com)","[b@gmail.com](mailto:b@gmail.com)"]

CASE B — empty array

emails = []

alternatePhones = []

CASE C — undefined Mongo arrays

If source field is undefined

PostgreSQL must store:

[]

Never null

CASE D — single value array

emails = ["[single@gmail.com](mailto:single@gmail.com)"]

Validation must confirm retrieval integrity.

Reason:

Mongo arrays and PostgreSQL arrays behave differently.

Must verify all array edge cases.

========================================
OPTIONAL SCHEMA IMPROVEMENT
===========================

Prefer:

alternatePhones String[] @default([])

emails String[] @default([])

instead of:

alternatePhones String[]

emails String[]

Purpose:

Avoid null vs empty array ambiguity.

========================================
DO NOT CHANGE ANYTHING ELSE
===========================

Only apply these corrections.
