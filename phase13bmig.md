QueueJob Relationship Repair (Phase 13B) Implementation Plan

Implement Phase 13B PostgreSQL relationship repair for QueueJob. This phase does NOT migrate new MongoDB data. Instead, it resolves temporary raw MongoDB references stored during Phase 13A and converts them into proper PostgreSQL foreign key relationships.

Production MongoDB code must remain completely untouched. No BaseRepository, generic CRUD abstractions, or production code modifications are allowed.

User Review Required

IMPORTANT

Phase 13A intentionally stored unresolved references as raw MongoDB IDs because dependent records did not yet exist.

Now all dependent models have been migrated.

This phase repairs relational integrity.

No new MongoDB documents are read except for verification if required.

No MongoDB writes are allowed.

Primary Objective

Convert temporary QueueJob raw references into PostgreSQL relational foreign keys.

Phase 13A stored:

legacyParentJobMongoId

without creating a self-referential PostgreSQL foreign key.

Phase 13B will repair this.

Target Relationship Repair

1. QueueJob Self Reference

Current PostgreSQL structure:

parentJobId → does NOT exist

legacyParentJobMongoId → contains raw MongoDB QueueJob ObjectId

Required change:

Add parentJobId foreign key referencing QueueJob.id

Repair logic:

For each QueueJob row:

If legacyParentJobMongoId exists:

Find MigrationMap record:

entityType = QUEUEJOB

mongoId = legacyParentJobMongoId

Retrieve postgresId

Update QueueJob.parentJobId = postgresId

If mapping does not exist:

Leave parentJobId = null

Do NOT fail

Preserve legacyParentJobMongoId


Optional Secondary Repair (Recommended)

AuditLog actor cleanup.

Current auditLog structure:

[
  {
    action: "ASSIGNED",
    actorId: 15,
    legacyActorMongoId: "68abcd..."
  }
]

If legacyActorMongoId exists:

Find USER MigrationMap

Replace actorId

Set legacyActorMongoId = null

If USER mapping missing:

Leave unchanged

Do not fail


Proposed Changes

Database Schema

[MODIFY]
schema.prisma

Modify QueueJob model.

Current:

legacyParentJobMongoId String?

Change to:

model QueueJob {
  ...

  parentJobId Int?

  legacyParentJobMongoId String?

  parentJob QueueJob? @relation("QueueJobHierarchy", fields: [parentJobId], references: [id])

  childJobs QueueJob[] @relation("QueueJobHierarchy")

  ...
}

Keep legacyParentJobMongoId.

Do NOT remove it yet.

Create migration:

npx prisma migrate dev --name queuejob_relations_v1


Repositories

[MODIFY]

repositories/postgres/PgQueueJobRepository.js

Add:

getJobsWithUnresolvedParents()

Return all QueueJobs where:

legacyParentJobMongoId IS NOT NULL

AND

parentJobId IS NULL


repairParentJob(jobId, parentPostgresId)

Update:

parentJobId = parentPostgresId


Scripts

[NEW]

scripts/repairQueueJobRelations.js

Purpose:

Repair QueueJob self-referential relationships.

Logic:

Find all QueueJobs where:

legacyParentJobMongoId != null

Loop each record.

For each:

Lookup MigrationMap:

entityType = QUEUEJOB

mongoId = legacyParentJobMongoId

If mapping exists:

Update QueueJob:

parentJobId = mapping.postgresId

Count as repaired

If mapping missing:

Skip

Count as unresolved

Log warning


Pseudo logic:

const jobs = await prisma.queueJob.findMany({
  where: {
    legacyParentJobMongoId: { not: null },
    parentJobId: null
  }
})

for (const job of jobs) {

  const mapping = await prisma.migrationMap.findFirst({
    where: {
      entityType: "QUEUEJOB",
      mongoId: job.legacyParentJobMongoId
    }
  })

  if (mapping) {
    await prisma.queueJob.update({
      where: { id: job.id },
      data: {
        parentJobId: mapping.postgresId
      }
    })
  }
}


Logging

Write:

migration-logs/queuejob_relation_repair.log

Log:

Total scanned

Total repaired

Total unresolved


[NEW]

scripts/validateQueueJobRelations.js

Validation tests:

Create parent QueueJob

Create child QueueJob with legacyParentJobMongoId

Create MigrationMap for parent

Run repair logic

Verify:

child.parentJobId = parent.id

Verify childJobs relation resolves correctly

Verify missing mappings do NOT fail

Verify jobs without parent remain unchanged

Verify circular references do not crash


[NEW]

scripts/rollbackQueueJobRelations.js

Rollback only relational repair.

Do NOT delete QueueJobs.

Reset:

parentJobId = null

Only for records where:

legacyParentJobMongoId != null


Verification Plan

Run schema migration:

npx prisma migrate dev --name queuejob_relations_v1

Generate Prisma client:

npx prisma generate

Run relation repair:

node scripts/repairQueueJobRelations.js

Run validation:

node scripts/validateQueueJobRelations.js

Run rollback test:

node scripts/rollbackQueueJobRelations.js

Re-run repair:

node scripts/repairQueueJobRelations.js

Test application boot:

node server.js


Important Rules

Do NOT modify MongoDB production code

Do NOT re-run migrateQueueJobs.js

Do NOT delete QueueJob records

Do NOT remove legacyParentJobMongoId yet

Do NOT overwrite records without mappings

Do NOT fail on missing parent mappings


Expected Final State

QueueJob now has proper self-referential PostgreSQL foreign key:

parentJobId

All recoverable parent-child relationships repaired

legacyParentJobMongoId preserved temporarily

No data loss

Production MongoDB remains untouched