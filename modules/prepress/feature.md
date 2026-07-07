# Prepress Module Feature Documentation

This document describes the features, database models, API endpoints, frontend interfaces, microservices, and functionality flags of the **Prepress** module.

---

## 1. Module Name & Purpose
- **Module Name**: Prepress Queue & Job Card Ingestion
- **Directory**: `modules/prepress`
- **Purpose**: Acts as the first human gateway of print jobs. Operates in two main capacities:
  1. Inbound active email/walk-in/WhatsApp queue dashboard, where designers are automatically or manually assigned queued requests to download files and verify artwork.
  2. Generating new Job Cards and customer profiles, converting incoming files into structured specifications for production stages.

---

## 2. Database Models & Relations
The Prepress module reads and writes the following tables:
- **`QueueJob`**: Core queue entity storing email text, folder paths, attachment arrays, status (`QUEUED`, `ASSIGNED`, `IN_PROGRESS`, etc.), priority scores, and design staff assignments.
- **`QueueSession`**: Sessions tracks for active design staff (auto-login/pause toggles).
- **`QueueRequest`**: Reassignment reason logs and approvals.
- **`Job` & `JobItem`**: The resulting production print job containing specifications, status, items list, and screenshots.
- **`Customer`**: Resolves or creates the billing profile for the client.

---

## 3. Features & Functional Workflows

### A. Backend APIs
Mapped under `/api/prepress` (Job card administration) and `/api/queue` (Design queue engine):
- **Job Card Routing (`prepress.js`)**:
  - `GET /jobs` — Lists jobs created by the current prepress user (or all jobs for admins).
  - `POST /jobs` — Saves a new Job Card, processes items, creates specification records (Lamination, Binding, Perforation, Foil, ID Card, Cutting), and registers new customer accounts (generating default passwords if new).
- **Active Queue Routing (`routes/queue.js`)**:
  - `POST /start-session` / `POST /end-session` — Controls staff queue modes.
  - `GET /current-job` — Retrieves active assignment and tray backups.
  - `POST /take-job` — Manually self-assigns a job from the pool.
  - `POST /complete-job/:id` — Finalizes the prepress stage and routes the job to the Press stage.

### B. Frontend Dashboards
- **PrepressDashboard (`PrepressDashBoard.tsx`)**: Lists historical jobs created by the designer.
- **CreateJob (`CreateJob.tsx`)**: High-fidelity spec form to create jobs, add items, set sizing, configure post-press details, upload screenshots, and assign delivery preferences.
- **QueueDashboard (`QueueDashboard.tsx`)**: Central design console showing live queue workloads, messaging chat, and file asset download links.

### C. Microservice
- **File**: `modules/prepress/backend/microservice.js`
- **Port**: `3002` (or points to `PREPRESS_SERVICE_URL`)
- **Role**: Dispatches and handles prepress status updates.

---

## 4. Functionality Flags & Parameters
- **`autoAssign`**: Dictates whether the queue automatically assigns the next high-priority task.
- **`JWT_SECRET`**: Decodes prepress authorization.
- **Authorization**: Restricts queue console access to users with `PREPRESS` or `ADMIN` roles.

---

## 5. Additional Features (Not Yet Implemented)

### A. Design Proof Approval Workflow
- After artwork is prepared, the designer sends a proof to the customer for sign-off before printing.
- `POST /jobs/:jobId/send-proof` — Marks the job as "awaiting approval" and triggers a WhatsApp/email message with a proof preview link.
- `POST /jobs/:jobId/approve-proof` — Customer or admin marks the proof as approved; job is released to the Press stage.
- Requires new `Job.proofStatus` enum (`NONE | SENT | APPROVED | REVISION_REQUESTED`) and `Job.proofSentAt DateTime?`.

### B. File Revision Tracking
- When a customer requests artwork revision, the current folder version should be preserved.
- Add `QueueJob.revisionCount Int @default(0)` and `QueueJob.lastRevisionAt DateTime?`.
- `POST /queue/:jobId/request-revision` — Increments revision count, resets job to `ASSIGNED`, logs a `JobEvent`.
- `GET /queue/:jobId/revisions` — Returns revision history from `JobEvent` entries with type `REASSIGNED` + revision note.

### C. Customer Preference Auto-Learning
- `CustomerPreference` table exists but its update logic (incrementing `confirmedCount`) should fire automatically when a customer confirms satisfaction with a job completed by a specific designer.
- `POST /preferences/confirm/:staffId` — Customer explicitly marks a designer as preferred (triggered from customer portal after job completion).
- Auto-suggest: when a new queue job arrives from a known customer email, the system pre-pins it to their preferred staff if available.

### D. Queue Priority Tuning Controls
- Currently `QueueJob.priorityScore` is computed but not manually adjustable via UI.
- `PATCH /queue/:jobId/priority` — Admin or senior prepress staff can manually boost a job's `priorityScore` (e.g., urgent corporate client).
- Logs the boost to `QueueJob.auditLog Json`.

### E. Template / Spec Reuse Library
- Frequent customers often repeat the same print specs.
- `GET /templates?customerEmail=` — Returns past confirmed job specs (`JobItem` specs) that can be loaded as a starting template in `CreateJob.tsx`.
- No new table needed — derived from recent `Job.jobItems` for the same customer.

### F. Queue Complexity Auto-Tagging
- `QueueJob.complexityTag` (`easy | medium | complex`) exists but may be set manually.
- Implement auto-tagging based on rules: attachment count, email body length, known customer status, spec complexity.
- `POST /queue/auto-tag` — Background job to score and tag un-tagged queue jobs.

### G. Hold & Snooze Controls
- `QueueJob.holdUntil` and `holdBehavior` fields exist but may not have a dedicated UI control.
- `PATCH /queue/:jobId/hold` — Set a hold until a specific time (`holdUntil`) with behavior (`RETURN_TO_POOL` or `STAY_HOLD`).
- `GET /queue/held` — List all currently held jobs with their hold expiry times.
- Once the new `@@index([holdUntil])` is in place, held-job queries will be fast.

### H. WhatsApp Job Deduplication via Fingerprint
- `QueueJob.fingerprint` exists to detect duplicate submissions.
- `POST /queue/check-duplicate` — Before creating a new queue job, compute a fingerprint from the email subject + sender and check if it already exists.
- Auto-mark as `DUPLICATE` if fingerprint matches an existing non-completed job within 24 hours.

### I. Ingestion Task Dashboard
- `IngestionTask` table tracks file folder ingestion but has no frontend view.
- `GET /ingestion/tasks` — Returns list of pending/processing/failed ingestion tasks with retry capability.
- `POST /ingestion/tasks/:id/retry` — Reset a `FAILED` task to `PENDING` for retry.
- Admin can view which folders are stuck and manually trigger reprocessing.
