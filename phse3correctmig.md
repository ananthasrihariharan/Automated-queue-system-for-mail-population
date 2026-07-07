Apply the following corrections to the existing Phase 3 MigrationMap implementation plan.

Do not change the overall migration architecture.

Only apply these corrections.

Current schema:

mongoId String @unique

Remove global uniqueness.

Replace with composite uniqueness.

Reason:

mongoId uniqueness must be scoped to entity type.

Use:

@@unique([entityType, mongoId])

Do NOT keep:

mongoId @unique

Prevent multiple Mongo IDs mapping to same PostgreSQL ID.

Add:

@@unique([entityType, postgresId])

Reason:

Each PostgreSQL entity record must map to exactly one Mongo ID.

Example invalid case:

USER → mongoId abc123 → postgresId 5

USER → mongoId xyz789 → postgresId 5

This must be impossible.

Do NOT use raw string entity types.

Current:

entityType String

Replace with Prisma enum.

Use:

enum MigrationEntity {
USER
CUSTOMER
JOB
JOBEVENT
QUEUEJOB
QUEUEMESSAGE
QUEUEREQUEST
}

Then schema:

entityType MigrationEntity

Reason:

Avoid typo errors.

Prevent invalid entity names.

Do not use generic test entity names.

Remove:

test_entity_

Use realistic ERP entity mappings.

Validation must test:

createMapping(
"USER",
"6852abcd",
1
)

createMapping(
"CUSTOMER",
"6853xyz",
7
)

createMapping(
"JOB",
"6854pqr",
22
)

Verify:

getMappingsByEntity(USER)

returns only USER mappings.

Test duplicate constraint for:

(entityType, mongoId)

and

(entityType, postgresId)

Purpose:

Simulate real production migration relationships.

Only apply these corrections.