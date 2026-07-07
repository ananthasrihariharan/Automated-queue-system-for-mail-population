I am refactoring an existing production-grade Printing Press ERP / Despatch Management System.

Tech stack:

Backend:
- Node.js
- Express.js
- Prisma ORM
- PostgreSQL

Previous architecture:
- MongoDB + Mongoose

The system was migrated from MongoDB to PostgreSQL, but the PostgreSQL schema still follows MongoDB document architecture by storing nested structures in JSON/JSONB columns.

I want a COMPLETE DATABASE REFACTOR.

NON-NEGOTIABLE REQUIREMENT:

ABSOLUTELY NO JSON OR JSONB FIELDS MUST EXIST ANYWHERE IN THE DATABASE.

Rules:

1. No Json or Json? types in Prisma schema
2. No embedded objects
3. No arrays stored inside columns
4. Every nested object must become relational tables
5. All relations must use foreign keys
6. Everything must be normalized properly
7. The system should follow proper PostgreSQL relational design
8. Prisma schema must be fully rewritten
9. Existing application business logic must be preserved
10. Existing workflows must not break

==================================================
PROJECT DOMAIN
==================================================

This is a Printing Press ERP system.

Workflow:

Customer
→ Queue Department
→ Prepress Department
→ Press Department
→ Post-Press Department
→ Billing Department
→ Dispatch Department

Modules:

- Customer Management
- Queue Management
- Job Creation
- Job Card Creation
- Prepress Workflow
- Printing Workflow
- Post Press Workflow
- Billing
- Dispatch
- File Attachments
- QR Parcel System
- Audit Logging
- User Role Management

==================================================
CURRENT DATABASE PROBLEM
==================================================

The current Prisma schema has these JSON fields.

REMOVE ALL OF THEM.

User Model:
- rawRoles Json?

Queue Session:
- pinnedJobs Json?
- pausedJobs Json?

Attachment Model:
- attachmentMeta Json?
- externalLinks Json?

Audit:
- auditLog Json?

QR System:
- qrPayload Json?

JobCard:
- processes Json?
- vcBox Json?
- binding Json?
- dieCutting Json?
- cornerCutting Json?
- cutting Json?
- lamination Json?
- creasingPerforation Json?
- foil Json?
- idCard Json?

Other:
- details Json?

Job Model:
- items Json?
- parcels Json?
- packingOverride Json?
- taskLog Json?

ABSOLUTELY REMOVE ALL OF THESE.

==================================================
TARGET DATABASE ARCHITECTURE
==================================================

Design proper relational PostgreSQL schema.

==================================================
1. USER MANAGEMENT
==================================================

Current issue:

rawRoles stored as JSON array.

Wrong:

{
  "rawRoles": ["ADMIN", "QUEUE", "PREPRESS"]
}

Replace with proper RBAC.

Create tables:

User
Role
UserRole

Schema:

User
- id
- name
- email
- password
- phone
- isActive
- createdAt
- updatedAt

Role
- id
- name

UserRole
- id
- userId FK
- roleId FK

Remove rawRoles completely.

==================================================
2. CUSTOMER MANAGEMENT
==================================================

Create:

Customer

Fields:

- id
- customerCode
- companyName
- contactPerson
- phone
- email
- gstNumber
- address
- createdAt
- updatedAt

Relations:

Customer → many Jobs

==================================================
3. JOB MANAGEMENT
==================================================

Current problem:

Job stores items as JSON.

Wrong:

{
  "items": [
     {
       "itemName":"Wedding Card",
       "qty":1000,
       "foil":"Gold",
       "foilStatus":"Pending"
     }
  ]
}

Delete items Json.

Create:

Job

Fields:

- id
- jobNumber UNIQUE
- customerId FK
- createdById FK
- deliveryDate
- priority
- paymentStatus
- productionStatus
- remarks
- createdAt
- updatedAt

Relations:

Job → many JobItems
Job → many JobTaskLogs
Job → many Dispatch records
Job → many Payments

==================================================
4. JOB ITEM TABLE
==================================================

Create separate JobItem table.

Each product becomes one row.

Example:

Job 1001

Item 1:
Wedding Card

Item 2:
Invitation Cover

Schema:

JobItem

- id
- jobId FK
- itemCode
- itemName
- quantity
- width
- height
- material
- currentStage
- createdAt
- updatedAt

Relations:

JobItem → one JobCard
JobItem → many Processes
JobItem → one PressRecord
JobItem → one PrepressRecord

REMOVE items JSON entirely.

==================================================
5. JOBCARD REFACTOR
==================================================

Current issue:

JobCard stores all configuration in JSON.

Wrong:

processes Json
binding Json
lamination Json
foil Json
cutting Json
vcBox Json
dieCutting Json
cornerCutting Json
creasingPerforation Json
idCard Json

Delete ALL.

Create:

JobCard

Fields:

- id
- jobItemId FK UNIQUE
- noOfColors
- frontPrint BOOLEAN
- backPrint BOOLEAN
- paperType
- notes
- createdAt
- updatedAt

No JSON allowed.

==================================================
6. PROCESS ENGINE
==================================================

Currently post press operations are stored inside item JSON.

Wrong:

{
  foil:"Gold",
  foilQty:1000,
  foilStatus:"Pending",
  cutting:"Trim",
  cuttingStatus:"Completed"
}

Delete everything.

Create process engine.

Table:

ItemProcess

Fields:

- id
- jobItemId FK
- processType ENUM
- quantity
- status ENUM
- operatorId FK
- startedAt
- completedAt

Enum:

ProcessType

- FOIL
- FUSING
- HOLES
- CUTTING
- BINDING
- LAMINATION
- CREASING
- PERFORATION
- DIE_CUTTING
- CORNER_CUTTING
- ID_CARD
- VC_BOX

Status enum:

ProcessStatus

- PENDING
- IN_PROGRESS
- COMPLETED
- CANCELLED

Relations:

JobItem → many ItemProcess

NO JSON.

==================================================
7. PROCESS SPECIFICATION TABLES
==================================================

Each process must have its own spec table.

Create:

LaminationSpec
FoilSpec
BindingSpec
CuttingSpec
DieCuttingSpec
VCBoxSpec
CornerCuttingSpec
CreasingSpec
PerforationSpec
IDCardSpec
FusingSpec

==================================================
LAMINATION SPEC
==================================================

Fields:

- id
- processId FK UNIQUE
- laminationType ENUM
- side ENUM
- quantity

Enums:

LaminationType

- GLOSS
- MATTE
- VELVET
- OTHER

LaminationSide

- SINGLE
- DOUBLE

==================================================
FOIL SPEC
==================================================

Fields:

- id
- processId FK UNIQUE
- foilType
- quantity
- side

==================================================
BINDING SPEC
==================================================

Fields:

- id
- processId FK UNIQUE
- bindingType ENUM
- quantity

==================================================
8. PREPRESS TRACKING
==================================================

Create:

PrepressRecord

Fields:

- id
- jobItemId FK
- designerId FK
- proofSent BOOLEAN
- proofApproved BOOLEAN
- completedAt

No JSON.

==================================================
9. PRESS TRACKING
==================================================

Create:

PressRecord

Fields:

- id
- jobItemId FK
- machineId FK nullable
- printedById FK
- printedQuantity
- wastage
- startedAt
- completedAt

==================================================
10. TASK LOG SYSTEM
==================================================

Current issue:

taskLog stored as JSON array.

Delete.

Wrong:

[
 {
   staffId:123,
   action:"Completed Foiling"
 }
]

Create:

JobTaskLog

Fields:

- id
- jobId FK
- userId FK
- action
- remarks
- createdAt

Remove taskLog JSON entirely.

==================================================
11. ATTACHMENT SYSTEM
==================================================

Current issue:

attachmentMeta Json
externalLinks Json

Delete both.

Create:

Attachment

Fields:

- id
- jobId FK
- fileName
- filePath
- mimeType
- fileSize
- uploadedById FK
- createdAt

Create:

ExternalLink

Fields:

- id
- attachmentId FK
- url
- label

==================================================
12. BILLING SYSTEM
==================================================

Create:

Invoice

Fields:

- id
- jobId FK
- invoiceNumber UNIQUE
- subtotal
- gst
- total
- paymentStatus
- createdAt

Create:

Payment

Fields:

- id
- invoiceId FK
- amount
- paymentMethod
- paidAt

==================================================
13. DISPATCH SYSTEM
==================================================

Current issue:

parcels stored as JSON.

Delete parcels JSON.

Create:

Dispatch

Fields:

- id
- jobId FK
- dispatchDate
- delivered BOOLEAN
- deliveredAt
- createdAt

Relations:

Dispatch → many Parcel

Create:

Parcel

Fields:

- id
- dispatchId FK
- parcelNumber
- weight
- qrCode
- status ENUM

Enum:

ParcelStatus

- CREATED
- PACKED
- SHIPPED
- DELIVERED

==================================================
14. PACKING OVERRIDE
==================================================

Current issue:

packingOverride stored as JSON.

Delete.

Create:

PackingConfiguration

Fields:

- id
- jobId FK
- packingType
- packageCount
- notes

==================================================
15. QR SYSTEM
==================================================

Current issue:

qrPayload stored as JSON.

Delete.

Create:

QRCode

Fields:

- id
- parcelId FK
- qrCodeText
- qrImagePath
- generatedAt

==================================================
16. QUEUE SESSION REFACTOR
==================================================

Current issue:

pinnedJobs Json
pausedJobs Json

Delete both.

Create:

QueuePinnedJob

Fields:

- id
- queueUserId FK
- jobId FK

Create:

QueuePausedJob

Fields:

- id
- queueUserId FK
- jobId FK
- pausedReason
- pausedAt

==================================================
17. AUDIT SYSTEM
==================================================

Current issue:

auditLog Json

Delete.

Create:

AuditLog

Fields:

- id
- tableName
- recordId
- fieldName
- oldValue
- newValue
- changedBy FK
- createdAt

No JSON allowed.

Store values as text columns.

==================================================
18. ENUMS REQUIRED
==================================================

Create enums for:

PaymentStatus
- PENDING
- PARTIAL
- PAID

JobPriority
- LOW
- MEDIUM
- HIGH
- URGENT

ProductionStatus
- QUEUE
- PREPRESS
- PRESS
- POST_PRESS
- BILLING
- DISPATCH
- COMPLETED

WorkflowStage
- QUEUE
- PREPRESS
- PRESS
- POST_PRESS
- BILLING
- DISPATCH

ProcessStatus
- PENDING
- IN_PROGRESS
- COMPLETED
- CANCELLED

ParcelStatus
- CREATED
- PACKED
- SHIPPED
- DELIVERED

==================================================
19. CODE REFACTOR REQUIREMENTS
==================================================

Update backend code.

Rewrite all files using JSON fields.

Must update:

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
- dispatch pages
- billing pages
- all utilities

==================================================
20. MIGRATION REQUIREMENTS
==================================================

Create migration scripts.

Files:

scripts/migrateUsers.js
scripts/migrateCustomers.js
scripts/migrateJobs.js
scripts/migrateJobItems.js
scripts/migrateProcesses.js
scripts/migrateDispatch.js
scripts/migrateBilling.js

Migration order:

1. Role
2. User
3. Customer
4. Job
5. JobItem
6. JobCard
7. ItemProcess
8. ProcessSpec tables
9. PrepressRecord
10. PressRecord
11. Attachment
12. Invoice
13. Payment
14. Dispatch
15. Parcel
16. AuditLog

==================================================
21. FORBIDDEN PATTERNS
==================================================

Never use:

Json
Json?

Never use:

JSON.stringify()

Never store arrays inside DB columns

Never store nested objects inside DB columns

Never use document-style schema design

==================================================
22. FINAL OUTPUT REQUIRED
==================================================

Generate:

1. Complete new schema.prisma
2. Full relational schema
3. Remove ALL Json fields
4. Preserve existing business logic
5. Keep workflows intact
6. Give migration scripts
7. Update all controllers/services
8. Explain what code files must change
9. Ensure database is 100% normalized PostgreSQL design
10. No missing tables
11. No shortcuts
12. No JSON anywhere

Treat this as production-grade ERP architecture for a commercial printing press company.

Do NOT skip any schema or relationship.