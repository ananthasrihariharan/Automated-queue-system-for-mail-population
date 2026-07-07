# Phase 20 Runtime Repair Handoff

Date: 2026-06-19

## Why Postgres Was Not Being Updated

The backend was still running in Mongo mode.

`repositories/index.js` chooses the active repository implementation using:

```js
const mode = (process.env.DB_MODE || 'mongo').trim().toLowerCase();
```

Because `.env` did not contain:

```env
DB_MODE=postgres
```

the app defaulted to Mongo repositories. That is why `POST /api/prepress/jobs` produced a Mongoose-style validation error:

```txt
Validation failed:
Path customerName is required
Path customerId is required
Path customerPhone is required
```

That error came from `models/Job.js`, meaning `MongoJobRepository` was active, not `PgJobRepository`.

That related startup issue has now been fixed: `config/db.js` skips the MongoDB/Mongoose connection when `DB_MODE=postgres` or `DB_MODE=pg`.

## Runtime Path Audited

The create-job path is:

```txt
server.js
  -> app.use("/api/prepress", require("./modules/prepress/backend/prepress"))
  -> POST /api/prepress/jobs
  -> jobRepo/customerRepo from repositories/index.js
  -> Mongo or Postgres repository based on DB_MODE
```

The prepress create route itself was already using:

```js
const { jobRepo } = require('../../../repositories')
const { customerRepo } = require('../../../repositories')
```

So the prepress create route was not directly bypassing the repository factory.

## What Was Fixed

### 1. Fixed Prepress Create Job Customer Field Loss

File:

```txt
modules/prepress/backend/prepress.js
```

Before, the job create payload read required fields directly from `customer`:

```js
customerId: customer._id || customer.id,
customerName: customer.name,
customerPhone: customer.phone,
```

If the returned customer shape was incomplete or mismatched, those required fields could become `undefined` before validation.

Now it resolves safely:

```js
const resolvedCustomerId = customer._id || customer.id
const resolvedCustomerName = customer.name || customerName
const resolvedCustomerPhone = customer.phone || customerPhone
```

Then it fails early if the customer object is unusable:

```js
if (!resolvedCustomerId || !resolvedCustomerName || !resolvedCustomerPhone) {
  return res.status(500).json({
    message: 'Customer repository returned incomplete customer data'
  })
}
```

This prevents silent `undefined` values from reaching Mongoose or Prisma validation.

### 2. Fixed Prepress Update Job Flow

File:

```txt
modules/prepress/backend/prepress.js
```

The update route was mutating `jobRepo` instead of the loaded `job`.

Examples fixed:

```js
jobRepo.totalItems = items.length
jobRepo.defaultDeliveryType = defaultDeliveryType
jobRepo.contactMe = ...
await jobRepo.save()
```

changed to:

```js
job.totalItems = items.length
job.defaultDeliveryType = defaultDeliveryType
job.contactMe = ...
await job.save()
```

### 3. Fixed Customer Auth Repository-Object Bug

File:

```txt
modules/customer/backend/customer-auth.js
```

The route was reading from `customerRepo` instead of `customer`.

Fixed:

```js
bcrypt.compare(password, customer.password)
{ customerId: customer._id || customer.id }
name: customer.name
phone: customer.phone
```

### 4. Fixed Customer Packing Repository-Object Bug

File:

```txt
modules/customer/backend/customer.js
```

The route was mutating `jobRepo` instead of the loaded `job`.

Fixed:

```js
job.packingPreference = packingPreference
job.parcels = parcels
job.customerConfirmedAt = new Date()
await job.save()
```

### 5. Fixed Admin Report Repository-Object Bugs

Files:

```txt
modules/admin/backend/admin.js
modules/admin/backend/reports.js
```

Several admin report endpoints were reading `jobRepo.customerName`, `jobRepo.jobId`, `jobRepo.createdAt`, etc. These were changed to use the actual local `job` variable.

## What Was Verified

### Repository Factory Validation

Command run:

```bash
node scripts/validateRepositoryFactory.js
```

Result:

```txt
Repository factory validation passed.
```

### Direct Import Audit

Checked for:

```txt
models/Job
models/Customer
models/User
repositories/JobRepository
repositories/CustomerRepository
repositories/UserRepository
```

Runtime controllers/services did not show direct targeted repository imports.

Direct model imports remain in:

```txt
repositories/mongo/*
scripts/*
docs/*
```

That is expected for Mongo repository implementations and migration/validation scripts.

### Manual POST Test - Mongo Mode

Started this workspace server on a temporary port with a writable upload path:

```txt
PORT=3028
UPLOAD_PATH=despatch system/tmp/uploads-test
```

Manual request:

```txt
POST /api/prepress/jobs
```

Result:

```txt
POST /api/prepress/jobs 201
```

The original validation error was gone.

One earlier test returned:

```txt
EPERM: operation not permitted, mkdir 'C:\Users\anand\OneDrive\Desktop\despatch uploads\...'
```

That was an upload-folder permission problem, not the customer field validation bug.

### Manual POST Test - Postgres Mode

Added:

```env
DB_MODE=postgres
```

Updated `config/db.js` so Postgres mode skips the MongoDB/Mongoose connection.

Started this workspace server on a temporary port with a writable upload path:

```txt
PORT=3029
UPLOAD_PATH=despatch system/tmp/uploads-pg-test
DB_MODE=postgres
```

Server log confirmed:

```txt
Postgres mode active; skipping MongoDB connection
[Database] Active Mode: postgres
```

Manual request:

```txt
POST /api/prepress/jobs
```

Result:

```txt
POST /api/prepress/jobs 201
```

Created Postgres row:

```json
{
  "id": 86,
  "jobId": "PGAUDIT162038-190626",
  "customerName": "Phase20 PG Audit Customer",
  "customerPhone": "9789130762",
  "customerId": 27,
  "createdById": 24
}
```

## How Much Is Done

Completed:

- Traced `POST /api/prepress/jobs`.
- Confirmed prepress create route uses `repositories/index.js`.
- Found why the error was Mongoose-style.
- Fixed create-job customer field resolution.
- Fixed multiple repository-object/data-object mistakes.
- Verified repository factory validation passes.
- Verified manual create job returns `201` in Mongo mode with writable upload path.
- Added `DB_MODE=postgres` to `.env`.
- Fixed `config/db.js` to skip MongoDB connection in Postgres mode.
- Added Postgres compatibility for auth/login customer lookup needed by create-job.
- Added Postgres job-card lookup compatibility needed by `applyJobCardsToItems()`.
- Verified manual create job returns `201` in Postgres mode.
- Confirmed the created job row exists in Postgres.

Not completed yet:

- Fully implement/verify Mongoose-like query-chain compatibility for Postgres repositories.
- Fix non-create background subsystem repository gaps seen during Postgres startup:
  - `QueueJob.countDocuments is not a function`
  - `QueueSession.find is not a function`

## Next Steps

### Step 1. Re-run Validation After Any Repository Changes

Run:

```bash
node scripts/validateRepositoryFactory.js
```

### Step 2. Continue Query API Parity Work

`MongoJobRepository` supports Mongoose-style calls like:

```js
jobRepo.find(...).sort(...).skip(...).limit(...)
jobRepo.findOne(...).populate(...)
job.save()
```

`PgJobRepository` currently has a narrower API:

```txt
create
createJob
findOne
getById
getByJobId
getByCustomer
getByStatus
getAllJobs
updateJobStatus
deleteJob
```

So after switching to Postgres, routes that chain `.sort()`, `.populate()`, `.select()`, `.skip()`, `.limit()`, or call `.save()` on returned records may still need repository adapter work.

The create route itself is now safer, but broader Postgres runtime parity still needs a pass.
