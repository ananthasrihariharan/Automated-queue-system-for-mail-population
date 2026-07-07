Job Migration (Phase 18) Implementation Plan

Implement Phase 18 PostgreSQL migration for Job. This is one of the largest production models in the despatch system. Production MongoDB code must remain completely untouched, and the PostgreSQL implementation must remain isolated with no BaseRepository inheritance, generic CRUD abstractions, or production code modifications.

User Review Required

IMPORTANT

This model has multiple foreign dependencies.

User references:
- createdBy
- printedBy
- ppsCompletedBy
- finishingCompletedBy
- paymentHandledBy
- dispatchedBy
- packedBy
- packingOverride.overriddenBy
- taskLog.staffId
- items[].printedBy

All User references must be translated using MigrationMap (entityType = USER).

If any User mapping is missing:
- store postgres field as null
- preserve original Mongo ObjectId as legacy field where applicable
- continue migration (do NOT fail the record)

Customer dependency:
- customerId references Customer
- translate using MigrationMap (entityType = CUSTOMER)

If Customer mapping is missing:
- skip entire Job record
- log failure

Parcel dependency:
- parcels embedded array remains JSON
- do NOT create foreign key to Parcel model

Complex nested structures:
The following must remain JSON and NOT be normalized into relational tables in this phase.

- items[]
- parcels[]
- taskLog[]
- packingOverride

No business logic recreation:
The Mongo pre-save hook that auto-calculates jobStatus must NOT be recreated in PostgreSQL.

We are migrating stored data only.

Duplicate prevention:
Check legacyMongoId before insert.
If already migrated:
- skip
- log warning
- never update existing rows
- never use upsert()

Proposed Changes

Database Schema

[MODIFY]
schema.prisma

Add JOB to MigrationEntity enum.

Add Prisma enums:

enum JobPackingPreference {
  SINGLE
  MULTIPLE
  MIXED
}

enum JobDeliveryType {
  COURIER
  WALK_IN
}

enum JobPaymentStatus {
  UNPAID
  PAID
  ADMIN_APPROVED
}

enum JobStatus {
  PENDING
  CREATED
  PRINTED
  PACKED
  DISPATCHED
  PARTIAL_DISPATCH
}

Add Job model.

Core scalar fields:

model Job {
  id                    Int @id @default(autoincrement())
  legacyMongoId         String? @unique

  jobId                 String @unique
  customerName          String
  totalItems            Int
  itemScreenshots       String[] @default([])

  items