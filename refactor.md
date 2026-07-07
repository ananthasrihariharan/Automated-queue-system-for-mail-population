I have an existing production-grade Printing Press ERP / Despatch Management System.

Tech stack:

Backend:
- Node.js
- Express.js
- Prisma ORM
- PostgreSQL

Existing production database:
- MongoDB + Mongoose

The system was migrated from MongoDB to PostgreSQL, but PostgreSQL schema still follows MongoDB document-style architecture.

I need a COMPLETE PRODUCTION-GRADE DATABASE + BACKEND ARCHITECTURE REFACTOR.

=================================================
STRICT NON NEGOTIABLE RULES
=================================================

1. Remove ALL Json / Json? fields from Prisma schema
2. No JSONB anywhere in PostgreSQL
3. No arrays stored in database columns
4. No embedded/nested objects inside DB columns
5. No document-style schema design
6. Everything must become relational tables
7. Strict normalization (1NF / 2NF / 3NF)
8. Use foreign keys everywhere
9. Preserve ALL existing business logic
10. Preserve existing workflows exactly
11. Backend must become single source of truth
12. No shortcuts

FORBIDDEN:

- Json
- Json?
- JSON.stringify() stored in DB
- Arrays inside DB columns
- Embedded objects in DB
- Access patterns like job.items[0].field

=================================================
IMPORTANT MIGRATION CONSTRAINT
=================================================

This is NOT an immediate migration.

For FIRST 2 WEEKS:

MongoDB and PostgreSQL must run in parallel.

Architecture:

MongoDB = PRIMARY SOURCE OF TRUTH

PostgreSQL = SECONDARY MIRROR DATABASE

This is gradual migration.

Requirements:

1. Existing MongoDB system must continue working normally

2. MongoDB schema must remain untouched during transition

3. PostgreSQL relational schema must be built alongside MongoDB

4. All writes during transition must go to BOTH databases

Flow:

API Request
   ↓
Write MongoDB first
   ↓
If Mongo succeeds → write PostgreSQL
   ↓
If PostgreSQL fails → DO NOT rollback MongoDB
   ↓
Log PostgreSQL sync failure

5. Existing API routes must continue working

6. Reads initially continue from MongoDB

7. Gradually move modules one by one to PostgreSQL

8. No downtime allowed

9. Mongo models and Prisma models must coexist temporarily

10. After validation, MongoDB will be removed completely

=================================================
DUAL WRITE ARCHITECTURE
=================================================

Create service layer abstraction.

Controllers must NOT directly write to DB.

Example:

createJobDualWrite()

Inside:

await createMongoJob()

await createPostgresJob()

Examples:

createCustomerDualWrite()
updateCustomerDualWrite()

createJobDualWrite()
updateJobDualWrite()

createJobCardDualWrite()

createInvoiceDualWrite()

createDispatchDualWrite()

=================================================
SYNC FAILURE HANDLING
=================================================

If MongoDB succeeds and PostgreSQL fails:

DO NOT rollback MongoDB.

MongoDB remains source of truth during transition.

Create table:

SyncFailureQueue

Fields:

- id
- entityType
- mongoRecordId
- operationType
- failedTable
- referenceId
- errorMessage
- retryCount
- status
- createdAt

status values:

- PENDING
- RETRYING
- FAILED
- COMPLETED

DO NOT store serialized payloads.

NO JSON.stringify payloads inside DB.

=================================================
WRITE TRACKING TABLE
=================================================

Create:

WriteSyncLog

Fields:

- id
- entityType
- mongoId
- postgresId
- syncStatus
- createdAt

syncStatus values:

- SUCCESS
- FAILED
- RETRY_PENDING
- SYNCED

Purpose:

Track dual write consistency.

=================================================
SYSTEM WORKFLOW
=================================================

Customer
→ Queue
→ Prepress
→ Press
→ PostPress
→ Billing
→ Dispatch

Modules:

- Customer Management
- Queue Management
- Job Creation
- Job Card Creation
- Prepress Department
- Press Department
- PostPress Department
- Billing
- Dispatch
- Attachments
- QR Parcel System
- Audit Logs
- User Roles

=================================================
REMOVE THESE EXISTING JSON FIELDS COMPLETELY
=================================================

User:
- rawRoles

Queue:
- pinnedJobs
- pausedJobs

Attachment:
- attachmentMeta
- externalLinks

Audit:
- auditLog

QR:
- qrPayload

JobCard:
- processes
- vcBox
- binding
- dieCutting
- cornerCutting
- cutting
- lamination
- creasingPerforation
- foil
- idCard

Job:
- items
- taskLog
- parcels
- packingOverride

Other:
- details

ZERO JSON MUST REMAIN.

=================================================
CREATE THESE CORE TABLES
=================================================

Authentication

- User
- Role
- UserRole

Customer

- Customer

Job Core

- Job
- JobItem
- JobCard

Production

- ItemProcess
- ProcessConfiguration
- PrepressRecord
- PressRecord

Billing

- Invoice
- Payment

Dispatch

- Dispatch
- Parcel
- PackingConfiguration
- QRCode

Files

- Attachment
- ExternalLink

Logs

- JobTaskLog
- AuditLog

Queue

- QueuePinnedJob
- QueuePausedJob

Migration Tracking

- SyncFailureQueue
- WriteSyncLog

Master Tables

- Machine

=================================================
CUSTOMER DESIGN CHANGE
=================================================

DO NOT create:

- CustomerPhone
- CustomerEmail

Instead use:

Customer

Fields:

- id
- companyName
- primaryPhone
- secondaryPhone
- primaryEmail
- secondaryEmail
- gstNumber
- address
- createdAt
- updatedAt

Avoid unnecessary extra tables.

=================================================
JOB TABLE
=================================================

Create:

Job

Fields:

- id
- jobNumber
- customerId
- createdById
- deliveryDate
- priority
- remarks
- createdAt
- updatedAt

REMOVE:

productionStatus

DO NOT store productionStatus in Job.

Reason:

JobItem already tracks workflow stage.

Job status must be derived dynamically from child items.

=================================================
JOB ITEM TABLE
=================================================

Each product becomes one row.

Fields:

- id
- jobId
- itemCode
- itemName
- quantity
- width
- height
- material
- currentStage
- createdAt
- updatedAt

JobItem tracks workflow stage.

=================================================
JOBCARD TABLE
=================================================

Create:

JobCard

Fields:

- id
- jobItemId
- noOfColors
- frontPrint
- backPrint
- paperType
- notes

=================================================
PROCESS ENGINE
=================================================

DO NOT create many spec tables.

DO NOT create:

- LaminationSpec
- FoilSpec
- BindingSpec
- CuttingSpec
- VCBoxSpec
- DieCuttingSpec
- CornerCuttingSpec
- PerforationSpec
- CreasingSpec
- IDCardSpec
- FusingSpec

Too many joins.

Instead create:

ItemProcess

Fields:

- id
- jobItemId
- processType
- quantity
- status
- operatorId
- startedAt
- completedAt

=================================================
PROCESS CONFIGURATION TABLE
=================================================

Instead of 13 process spec tables.

Create generic relational table.

ProcessConfiguration

Fields:

- id
- processId
- configKey
- configValue

Example rows:

processId = 12
configKey = laminationType
configValue = MATTE

processId = 12
configKey = side
configValue = DOUBLE

processId = 12
configKey = quantity
configValue = 1000

NO JSON.

=================================================
PROCESS TYPES ENUM
=================================================

FOIL
FUSING
HOLES
CUTTING
BINDING
LAMINATION
CREASE
PERFORATION
DIE_CUTTING
CORNER_CUTTING
ID_CARD
VC_BOX

=================================================
PRODUCTION TABLES
=================================================

PrepressRecord

Fields:

- id
- jobItemId
- designerId
- proofSent
- proofApproved
- completedAt

PressRecord

Fields:

- id
- jobItemId
- machineId
- printedById
- printedQuantity
- wastage
- startedAt
- completedAt

=================================================
MACHINE MASTER TABLE
=================================================

Create:

Machine

Fields:

- id
- machineName
- machineType
- serialNumber
- isActive

PressRecord references Machine.

=================================================
TASK LOG SYSTEM
=================================================

Create:

JobTaskLog

Fields:

- id
- jobId
- userId
- action
- remarks
- createdAt

=================================================
FILE SYSTEM
=================================================

Attachment

Fields:

- id
- jobId
- fileName
- filePath
- mimeType
- fileSize
- uploadedById
- createdAt

ExternalLink

Fields:

- id
- attachmentId
- url
- label

=================================================
BILLING SYSTEM
=================================================

Invoice

Fields:

- id
- jobId
- invoiceNumber
- subtotal
- gst
- total
- paymentStatus
- createdAt

MUST relate properly to Job.

Payment

Fields:

- id
- jobId
- invoiceId
- amount
- paymentMethod
- paidAt

=================================================
DISPATCH SYSTEM
=================================================

Dispatch

Fields:

- id
- jobId
- dispatchDate
- delivered
- deliveredAt

Parcel

Fields:

- id
- dispatchId
- parcelNumber
- qrCode
- weight
- status

PackingConfiguration

Fields:

- id
- jobId
- packingType
- packageCount
- notes

QRCode

Fields:

- id
- parcelId
- qrCodeText
- qrImagePath
- generatedAt

=================================================
QUEUE TABLES
=================================================

QueuePinnedJob

Fields:

- queueUserId
- jobId

QueuePausedJob

Fields:

- queueUserId
- jobId
- pausedReason
- pausedAt

=================================================
AUDIT SYSTEM
=================================================

AuditLog

Fields:

- id
- tableName
- recordId
- fieldName
- oldValue
- newValue
- changedBy
- createdAt

=================================================
SOFT DELETE REQUIRED
=================================================

Add to:

- User
- Customer
- Job
- Invoice
- Attachment
- Dispatch
- Parcel

Fields:

- isDeleted
- deletedAt

Never hard delete ERP records.

=================================================
INDEX REQUIREMENTS
=================================================

Add indexes.

Job:

- jobNumber
- customerId
- createdAt
- deliveryDate

JobItem:

- jobId
- currentStage

ItemProcess:

- jobItemId
- operatorId
- status
- processType

Invoice:

- jobId

Dispatch:

- jobId

AuditLog:

- tableName
- recordId
- createdAt

=================================================
CODE REFACTOR RULE
=================================================

Move ALL business logic to backend.

Remove transformation logic from frontend.

Delete logic from frontend utilities like:

jobCardToPostPress.ts

Frontend must ONLY send raw form data.

Backend performs transformation.

Backend becomes single source of truth.

=================================================
MODULE CUTOVER PLAN
=================================================

Week 1

Mongo = Primary
Postgres = Mirror

Migrate:

- User
- Role
- Customer
- Job
- JobItem

Week 2

Mongo still primary

Migrate:

- JobCard
- ItemProcess
- Billing
- Dispatch
- Attachments

Reads still from MongoDB initially.

After validation:

Switch reads to PostgreSQL.

Then remove MongoDB completely.

=================================================
MIGRATION REQUIREMENTS
=================================================

Preserve Mongo ObjectId mapping.

Example:

Mongo:

printedBy: ObjectId(...)

Postgres:

printedById FK

Temporarily preserve legacy Mongo IDs if required.

Create migration scripts.

- migrateRoles.js
- migrateUsers.js
- migrateCustomers.js
- migrateJobs.js
- migrateJobItems.js
- migrateProcesses.js
- migrateBilling.js
- migrateDispatch.js

Migration order:

1 Role
2 User
3 Customer
4 Job
5 JobItem
6 JobCard
7 ItemProcess
8 PrepressRecord
9 PressRecord
10 Attachments
11 Invoice
12 Payment
13 Dispatch
14 Parcel
15 AuditLog

=================================================
FILES TO REFACTOR
=================================================

Backend:

- controllers/*
- services/*
- modules/queue/*
- modules/prepress/*
- modules/postpress/*
- modules/dispatch/*
- modules/billing/*
- middleware/auth.js
- middleware/roleCheck.js

Create:

services/dualWrite/

Inside:

- UserDualWrite.js
- CustomerDualWrite.js
- JobDualWrite.js
- BillingDualWrite.js
- DispatchDualWrite.js
- SyncFailureWorker.js

Frontend:

- job card forms
- queue dashboard
- billing pages
- dispatch pages

=================================================
FINAL OUTPUT REQUIRED
=================================================

Generate:

1. Complete new schema.prisma
2. Fully relational PostgreSQL schema
3. Remove ALL JSON fields
4. Convert all Mongo nested structures into relational tables
5. Add all foreign keys
6. Preserve existing workflows
7. Implement dual write architecture
8. Implement retry worker
9. Create migration scripts
10. Identify all backend/frontend files needing rewrite
11. Production-safe ERP architecture
12. Do not leave ANY document-style schema design anywhere