I have an existing production-grade Printing Press ERP / Despatch Management System.

Tech Stack:

Backend:
- Node.js
- Express.js
- Prisma ORM
- PostgreSQL

Existing system:
- MongoDB + Mongoose

The system was migrated from MongoDB to PostgreSQL, but the PostgreSQL schema still follows MongoDB document architecture and stores nested structures inside Json/Json? fields.

I need a COMPLETE DATABASE + ARCHITECTURE REFACTOR.

==================================================
NON NEGOTIABLE REQUIREMENTS
==================================================

1. Remove ALL Json / Json? fields from Prisma schema
2. No JSONB anywhere
3. No arrays stored in DB columns
4. No embedded objects inside DB columns
5. No document-style schema design
6. Every nested structure must become relational tables
7. Strict PostgreSQL normalization (1NF / 2NF / 3NF)
8. Use foreign keys everywhere
9. Preserve ALL existing business logic
10. Preserve workflow exactly
11. No shortcuts

FORBIDDEN:

- Json
- Json?
- JSON.stringify()
- Arrays inside DB columns
- Embedded objects in DB
- Document-style schema design
- Access patterns like job.items[0].field

==================================================
IMPORTANT MIGRATION CONSTRAINT
==================================================

This refactor will NOT immediately replace MongoDB.

For first 2 weeks both databases must run in parallel.

Architecture:

MongoDB + PostgreSQL

This is gradual migration.

NOT hard cutover.

Requirements:

1. Existing MongoDB production system must continue functioning

2. PostgreSQL relational schema must be built alongside MongoDB

3. For first 2 weeks all writes must happen to BOTH databases

Meaning:

API Request
   ↓
Write MongoDB
   ↓
Write PostgreSQL

4. MongoDB schema must remain untouched during transition

5. Existing API routes must continue working

6. Reads initially continue from MongoDB

7. Gradually migrate modules to PostgreSQL

8. No downtime allowed

9. MongoDB models and Prisma models must coexist during migration

10. After validation, MongoDB will be removed completely

==================================================
DUAL WRITE REQUIREMENT
==================================================

For first 2 weeks:

All create/update/delete operations must write to BOTH databases.

Example:

createJob()

Inside:

await createMongoJob()

await createPostgresJob()

Create service abstraction layer.

Examples:

createJobDualWrite()

updateJobDualWrite()

deleteJobDualWrite()

syncMongoToPostgres()

Controllers should call service layer.

Do NOT immediately replace controllers.

==================================================
SYNC FAILURE HANDLING
==================================================

If Mongo write succeeds and PostgreSQL write fails:

DO NOT rollback MongoDB.

MongoDB remains source of truth during transition.

Create sync failure tracking.

Table:

SyncFailureQueue

Fields:

- id
- entityType
- mongoRecordId
- operationType
- payload
- errorMessage
- retryCount
- createdAt

Retry failed PostgreSQL sync later.

==================================================
SYSTEM WORKFLOW
==================================================

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
- Job Card
- Prepress
- Press
- PostPress
- Billing
- Dispatch
- Attachments
- QR Parcel System
- Audit Logs
- User Roles

==================================================
REMOVE THESE FIELDS COMPLETELY
==================================================

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

==================================================
CREATE THESE TABLES
==================================================

Authentication:

- User
- Role
- UserRole

Core:

- Customer
- Job
- JobItem
- JobCard

Production:

- ItemProcess
- PrepressRecord
- PressRecord

Process Spec Tables:

- LaminationSpec
- FoilSpec
- BindingSpec
- CuttingSpec
- DieCuttingSpec
- VCBoxSpec
- CornerCuttingSpec
- CreasingSpec
- PerforationSpec
- IDCardSpec
- FusingSpec

Billing:

- Invoice
- Payment

Dispatch:

- Dispatch
- Parcel
- PackingConfiguration
- QRCode

File Management:

- Attachment
- ExternalLink

Logs:

- JobTaskLog
- AuditLog

Queue:

- QueuePinnedJob
- QueuePausedJob

Migration:

- SyncFailureQueue

==================================================
RELATIONS
==================================================

Customer
→ many Jobs

Job
→ belongs to Customer
→ many JobItems
→ many JobTaskLogs
→ many Payments
→ many Dispatches

JobItem
→ belongs to Job
→ one JobCard
→ many ItemProcesses
→ one PrepressRecord
→ one PressRecord

ItemProcess
→ belongs to JobItem
→ one process specification table depending on process type

==================================================
PROCESS TYPES ENUM
==================================================

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

==================================================
STATUS ENUMS
==================================================

ProcessStatus

- PENDING
- IN_PROGRESS
- COMPLETED
- CANCELLED

WorkflowStage

- QUEUE
- PREPRESS
- PRESS
- POST_PRESS
- BILLING
- DISPATCH

PaymentStatus

- PENDING
- PARTIAL
- PAID

ParcelStatus

- CREATED
- PACKED
- SHIPPED
- DELIVERED

==================================================
PROCESS SPEC REQUIREMENTS
==================================================

LaminationSpec

- processId
- laminationType
- side (SINGLE/DOUBLE)
- quantity

FoilSpec

- processId
- foilType
- quantity
- side

BindingSpec

- processId
- bindingType
- quantity

Repeat same structure for:

- Cutting
- DieCutting
- VCBox
- CornerCutting
- Creasing
- Perforation
- IDCard
- Fusing

==================================================
SPECIAL TABLE REQUIREMENTS
==================================================

Attachment

- fileName
- filePath
- mimeType
- fileSize
- uploadedById

ExternalLink

- attachmentId
- url
- label

AuditLog

- tableName
- recordId
- fieldName
- oldValue
- newValue
- changedBy
- createdAt

Parcel

- dispatchId
- parcelNumber
- qrCode
- weight
- status

QRCode

- parcelId
- qrCodeText
- qrImagePath
- generatedAt

QueuePausedJob

- queueUserId
- jobId
- pausedReason
- pausedAt

==================================================
MIGRATION REQUIREMENTS
==================================================

Preserve Mongo migration mappings.

Example:

Mongo:

printedBy: ObjectId(...)

Postgres:

printedById → PostgreSQL FK

Preserve legacy Mongo IDs temporarily if needed for traceability.

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
8 Spec Tables
9 PrepressRecord
10 PressRecord
11 Attachments
12 Invoice
13 Payment
14 Dispatch
15 Parcel
16 AuditLog

==================================================
MODULE CUTOVER ORDER
==================================================

Week 1

MongoDB = Primary

Postgres = Mirror

Migrate:

- User
- Role
- Customer
- Job
- JobItem

Week 2

MongoDB still primary

Migrate:

- JobCard
- ItemProcess
- Billing
- Dispatch
- Attachments

Reads continue from MongoDB initially.

After validation:

Switch reads to PostgreSQL.

Then remove MongoDB completely.

==================================================
CODE REFACTOR REQUIRED
==================================================

Rewrite backend files using old JSON patterns.

Backend:

- controllers/*
- services/*
- modules/queue/*
- modules/prepress/*
- modules/postpress/*
- modules/dispatch/*
- modules/billing/*
- utils/jobCardToPostPress.js
- middleware/auth.js
- middleware/roleCheck.js

Frontend:

- job card forms
- queue dashboard
- billing pages
- dispatch pages
- frontend transformation utilities

Remove duplicated business logic between frontend and backend.

Backend must become single source of truth.

==================================================
FINAL OUTPUT REQUIRED
==================================================

Generate:

1. Complete new schema.prisma
2. Fully relational PostgreSQL design
3. Remove every JSON field
4. Convert all Mongo nested structures into relational tables
5. Add all FK relations
6. Preserve existing business logic
7. Implement dual database architecture for first 2 weeks
8. Implement dual write services
9. Create migration scripts
10. Identify all backend/frontend files needing refactor
11. Ensure production-safe ERP architecture
12. Do not leave ANY document-style schema design anywhere