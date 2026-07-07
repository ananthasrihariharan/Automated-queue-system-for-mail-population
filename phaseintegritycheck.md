Phase 19 — Migration Integrity Audit Implementation Plan

Implement Phase 19 of the PostgreSQL migration project.

All database models have already been migrated successfully.

This phase does NOT migrate new data.

This phase performs a full integrity audit between MongoDB and PostgreSQL to verify:

1. Record count parity
2. MigrationMap consistency
3. Relationship integrity
4. Null fallback analysis
5. Detection of orphaned or inconsistent records

Production MongoDB code must remain completely untouched.

No BaseRepository usage.

No writes to MongoDB are allowed.

PostgreSQL writes are also NOT allowed except optional temporary validation tables (avoid unless necessary).

This phase is READ ONLY.


Primary Objective

Verify that the entire PostgreSQL replicated database matches MongoDB production data accurately.


Audit Categories


1. Record Count Verification

Compare MongoDB count and PostgreSQL count for every migrated model.

Verify exact parity.

Models to verify:

User
SystemConfig
CustomerPreference
Customer
WalkinRequest
IngestionTask
QueueSession
QueueUnread
QueueMessage
QueueRequest
QueueStats
QueueJob
Parcel
JobCard
JobEvent
Job

For each model:

Mongo Count = Postgres Count

If mismatch:

Log warning

Example output:

[OK] User → Mongo: 16 | Postgres: 16

[OK] QueueJob → Mongo: 252 | Postgres: 252

[WARNING] JobEvent → Mongo: 970 | Postgres: 968



2. MigrationMap Verification

Verify MigrationMap consistency.

Check every entity type.

Required entity types:

USER
CUSTOMER
QUEUEJOB
JOBCARD
JOBEVENT
JOB
PARCEL
WALKINREQUEST
QUEUEREQUEST
QUEUESESSION
QUEUEUNREAD
QUEUEMESSAGE
CUSTOMERPREFERENCE

Checks required:

Every PostgreSQL row with legacyMongoId must have a MigrationMap entry.

No duplicate mongoId mappings.

No duplicate postgresId mappings.

Every MigrationMap row points to an existing PostgreSQL row.

Example checks:

MigrationMap entityType = USER

mongoId unique

postgresId unique

postgresId exists in User table

Example output:

[OK] USER mappings verified

[WARNING] Missing QUEUEJOB mapping for postgresId 82



3. Relationship Integrity Verification

Verify all translated foreign keys.

Check every relational dependency.


User Relationships

Verify:

QueueSession.staffId exists in User

QueueUnread.userId exists in User

QueueRequest.requestedById exists in User

WalkinRequest.requestedById exists in User

WalkinRequest.assignedToId exists OR null

QueueJob.assignedToId exists OR null

QueueJob.pinnedToStaffId exists OR null

QueueJob.lastPausedById exists OR null

QueueJob.reassignedFromId exists OR null

Job.createdById exists OR null

Job.printedById exists OR null

Job.paymentHandledById exists OR null

Job.dispatchedById exists OR null

Job.packedById exists OR null

JobEvent.userId exists OR null


Customer Relationships

Verify:

Job.customerId exists in Customer


QueueJob Self Reference

Verify:

QueueJob.parentJobId exists in QueueJob OR null

Check for broken self references.

Example output:

[OK] QueueSession user references valid

[OK] QueueJob parent relationships valid

[WARNING] Job.customerId missing for Job id 32



4. Null Fallback Analysis

During migration some records allowed missing mappings.

Generate audit report for nullable relationships.

Count records where these are null.


QueueJob

assignedToId = null

pinnedToStaffId = null

lastPausedById = null

reassignedFromId = null


WalkinRequest

assignedToId = null


JobEvent

userId = null

queueJobId = null


Job

createdById = null

printedById = null

paymentHandledById = null


Example output:

QueueJob:

assignedToId null → 12 rows

pinnedToStaffId null → 3 rows

JobEvent:

queueJobId null → 2 rows

These are informational only.

Do NOT fail audit.



5. Orphan Detection

Detect orphaned migration artifacts.


Check:

MigrationMap rows pointing to deleted PostgreSQL records

QueueJob.parentJobId pointing to missing QueueJob

JobEvent.queueJobId null but legacyQueueJobMongoId exists

Any PostgreSQL row with legacyMongoId but missing MigrationMap


Example:

[WARNING] Orphan USER mapping found for postgresId 21

[WARNING] JobEvent id 58 has missing QueueJob relation



Files To Create


[NEW]

scripts/verifyMigrationIntegrity.js


Purpose:

Master audit script.

Runs every verification step.

Produces terminal report.

Writes full report to:

migration-logs/integrity_audit.log



Implementation Requirements


Connect to MongoDB

Connect to PostgreSQL

Read-only operations only

No writes to MongoDB

No writes to PostgreSQL

Continue audit even if one check fails

Use try/catch per section

Always disconnect safely in finally block



Output Format

Console example:

====================================

MIGRATION INTEGRITY AUDIT REPORT

====================================

RECORD COUNT CHECKS

[OK] User → 16 / 16

[OK] Customer → 8 / 8

[OK] QueueJob → 252 / 252


MIGRATIONMAP CHECKS

[OK] USER mappings valid

[OK] CUSTOMER mappings valid


RELATIONSHIP CHECKS

[OK] QueueSession user relations valid

[OK] QueueJob self references valid


NULL FALLBACK REPORT

QueueJob.assignedToId NULL → 12

QueueJob.pinnedToStaffId NULL → 3

JobEvent.queueJobId NULL → 2


ORPHAN CHECKS

[OK] No orphan mappings found


FINAL RESULT

AUDIT PASSED

====================================



Verification Plan

Run:

node scripts/verifyMigrationIntegrity.js


Expected Result

All record counts match

MigrationMap integrity verified

Relationships verified

Nullable fallback records reported

No orphaned records

Audit report saved to:

migration-logs/integrity_audit.log



Important Rules

Do NOT modify production MongoDB code

Do NOT write to MongoDB

Do NOT modify PostgreSQL records

Do NOT delete any records

Do NOT repair data automatically

This phase is READ ONLY



Expected Final State

Full database replication verified.

MongoDB and PostgreSQL confirmed consistent.

System ready for repository cutover phase.