# 🖨️ Despatch System — Full Technical Reference

> **Version:** 1.0.0 (Q2 2026 Build)  
> **Stack:** Node.js + Express + MongoDB + Socket.io + React (Vite) + PM2  
> **Process Manager:** PM2  
> **Deployment:** LAN / Local Network (Windows Server)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture & Data Flow](#2-architecture--data-flow)
3. [Environment Configuration](#3-environment-configuration)
4. [Directory Structure](#4-directory-structure)
5. [User Roles & Access Control](#5-user-roles--access-control)
6. [Frontend Modules](#6-frontend-modules)
7. [API Routes Reference](#7-api-routes-reference)
8. [Database Models](#8-database-models)
9. [Backend Services](#9-backend-services)
10. [Queue Engine Deep Dive](#10-queue-engine-deep-dive)
11. [WebSocket Events Reference](#11-websocket-events-reference)
12. [Background Subsystems & Timers](#12-background-subsystems--timers)
13. [File Storage & Attachment Handling](#13-file-storage--attachment-handling)
14. [Email Ingestion Pipeline (n8n → Queue)](#14-email-ingestion-pipeline-n8n--queue)
15. [Job Statuses & Lifecycle](#15-job-statuses--lifecycle)
16. [Staff Continuity & Sticky Routing](#16-staff-continuity--sticky-routing)
17. [Known Edge Cases & Limitations](#17-known-edge-cases--limitations)
18. [Starting & Restarting the System](#18-starting--restarting-the-system)

---

## 1. System Overview

The **Despatch System** is an internal production-floor management tool for a printing press. It manages the full lifecycle of customer jobs from email receipt through design, quality check, payment, dispatch, and archival.

### Core Functions
| Function | Description |
|----------|-------------|
| **Email Ingestion** | n8n automation monitors a Gmail inbox, downloads emails as local folders. The system ingests them into a queue. |
| **Queue Management** | FIFO queue with priority scoring, staff pinning, SLA tracking, and concurrent clash prevention. |
| **Design Assignment** | Jobs are auto-assigned to online designers. Supports sticky routing for returning customers. |
| **Walk-in Jobs** | Staff can request walk-in jobs through the dashboard; admin approves them. |
| **Payment Tracking** | Cashier module marks jobs PAID. Supports UPI / Cash tagging. |
| **Dispatch** | Despatch module tracks packing, delivery mode (courier/walk-in), and dispatched/pending states. |
| **Prepress** | Separate module for managing physical print job entries with screenshot uploads. |
| **Reporting** | Admin can view staff productivity, SLA compliance, and activity journals. |

---

## 2. Architecture & Data Flow

```
Gmail Inbox
    │
    ▼ (n8n Automation - Every 5 mins)
E:\InboundJobs\
  └── customer@email.com\
       └── 2026-04-21T10-30-00_Print_File\
            ├── email_body.txt
            └── artwork.pdf
    │
    ▼ (chokidar FileWatcher — watches E:\InboundJobs)
IngestionTask (MongoDB) → PENDING
    │
    ▼ (ProcessingWorker — polls for PENDING tasks every 2s)
QueueJob created (MongoDB)
  ├── threadId linking
  ├── fingerprint deduplication
  ├── spam/noreply filtering → JUNK / ADMIN_REVIEW
  └── staff preference lookup → pinnedToStaff
    │
    ▼ (eventBus → job:created)
eventHandlers.js
  ├── Broadcasts to admin dashboard (Socket.io → "admin:queue" room)
  ├── Pushes to staff dashboard (Socket.io → "staff:XXXID" room)
  └── Triggers auto-assignment sweep (assignIdleStaff)
    │
    ▼ (Staff Dashboard — React)
Designer works → IN_PROGRESS → COMPLETED
    │
    ▼ (onJobComplete)
Folder archived to E:\CompletedJobs\
Job status → COMPLETED
CustomerPreference updated (sticky routing learning)
    │
    ▼ (Cashier Module)
Payment recorded → paymentStatus: PAID
    │
    ▼ (Dispatch Module)
Parcel created → Dispatched
```

---

## 3. Environment Configuration

Create a `.env` file in the project root. All variables below are required in production.

| Variable | Example | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP server port |
| `MONGO_URI` | `mongodb://localhost:27017/Despatch_System` | MongoDB connection string |
| `JWT_SECRET` | `(random 64-char string)` | JWT signing secret |
| `NODE_ENV` | `production` | Set to `production` for built React SPA serving |
| `UPLOAD_PATH` | `uploads` | Relative or absolute path for prepress image uploads |
| `N8N_WATCH_PATH` | `E:\InboundJobs` | Root folder that n8n deposits emails into |
| `COMPLETED_JOBS_PATH` | `E:\CompletedJobs` | Archive destination when a job is completed |
| `VITE_BACKEND_URL` | `http://192.168.1.10:3001` | LAN IP for frontend API calls (dev only) |

> ⚠️ **Critical:** `N8N_WATCH_PATH` and `COMPLETED_JOBS_PATH` must be absolute Windows paths. If missing, the file watcher will silently disable itself.

---

## 4. Directory Structure

```
despatch-system/
├── server.js                   # Entry point. Express + Socket.io + startup sequence
├── package.json
├── .env                        # Environment variables (not committed)
├── .env.example                # Template
│
├── config/
│   └── db.js                   # Mongoose connection
│
├── middleware/
│   ├── auth.js                 # JWT Bearer token verification
│   ├── authorize.js            # Role-based access guard (authorize('ADMIN'))
│   ├── customerAuth.js         # Separate JWT auth for customer-facing routes
│   ├── activityTracker.js      # Records last-active timestamp per user
│   └── upload.js               # Multer config (disk storage, temp folder)
│
├── models/                     # Mongoose schemas (see Section 8)
│
├── routes/                     # Express routers (see Section 7)
│
├── services/
│   ├── eventBus.js             # Node.js EventEmitter singleton (internal pub/sub)
│   ├── eventHandlers.js        # Subscribes to eventBus → Socket.io + auto-assignment
│   ├── fileWatcher.js          # Chokidar watcher for n8n email folders
│   ├── processingWorker.js     # Converts IngestionTasks → QueueJobs
│   ├── queueEngine.js          # Core assignment logic (1,006 lines)
│   └── statsService.js         # Recalculates QueueStats counters
│
├── utils/
│   └── password.js             # Password generation utilities
│
├── printing-press-frontend/    # React (Vite) SPA
│   ├── dist/                   # Production build (served by Express)
│   └── src/
│       └── modules/
│           ├── admin/          # Admin dashboard, queue panel, reports
│           ├── auth/           # Login page
│           ├── cashier/        # Payment module
│           ├── customer/       # Customer-facing job tracker
│           ├── despatch/       # Dispatch module
│           └── prepress/       # Prepress job creation & listing
│
└── uploads/                    # Prepress screenshot storage (auto-created)
```

---

## 5. User Roles & Access Control

| Role | Module Access |
|------|---------------|
| `ADMIN` | Full access — queue management, staff management, reports, reassignment |
| `PREPRESS` | Prepress module only — create/edit/view jobs with screenshots |
| `QUEUE` | Designer queue dashboard — receive, work, pause, complete email/walkin jobs |
| `CASHIER` | Cashier module — mark jobs PAID, view payment history |
| `DISPATCH` | Dispatch module — manage parcels, mark as dispatched |
| `CUSTOMER` | Customer-facing portal — view own job status only |

Authentication uses `JWT Bearer` tokens stored in `localStorage`. The `auth.js` middleware verifies the token and attaches `req.user` to every protected request. The `authorize.js` middleware then checks `req.user.role`.

---

## 6. Frontend Modules

### Admin Queue Panel (`/admin/queue`) — `AdminQueuePanel.tsx`
The most complex screen in the system. ~78KB TSX file.

- **Tabs:** Waiting Pool | In Progress | Admin Review | Completed | Junk
- **Badge counts** on each tab (live-updated via Socket.io)
- **Job Cards** in each tab show: customer email, subject, attachments, SLA timer, status badges
- **Status Badges:** `⏸ ON HOLD`, `▶ IN PROGRESS`, `🔁 REASSIGN REQUEST`, `⚠️ SLA RISK`
- **Actions per job:** Pin to staff (opens staff picker), Unpin, Reassign (PARK or PUSH), Force Assign, Change Priority, Delete
- **Bulk Actions (Selection Mode):** Select multiple jobs → Bulk Delete (wipes DB + folders)
- **Online Designers Sidebar:** Shows each logged-in designer, their online status, and the customer they're currently working with
- **Search bar + Date filter + Staff filter** — all server-side
- **Real-time updates** via `queue:refresh`, `stats:update`, `state:sync` socket events

### Admin Dashboard (`/admin`) — `AdminDashboard.tsx`
- Summary KPI cards (jobs today, waiting, in-progress)
- Quick-access links to queue, reports, staff management

### Admin Reports (`/admin/reports`) — `AdminReports.tsx`
- Staff Productivity: completions per staff, avg handle time, complexity distribution
- Activity Journal: timeline of all job events for a selected date
- Filterable by role, timeframe (today/weekly/monthly/custom range)

### Employee Manager (`/admin/users`)
- Create new staff accounts with role assignment
- Edit name, username, role
- Deactivate accounts (soft-delete; `isActive: false`)

### Customer Manager (`/admin/customers`)
- Search customers by name or phone
- View all jobs linked to a customer
- Edit contact details

### Designer Queue Dashboard (`/queue`)
- Auto-receives assigned job on login
- Job details: customer email, subject, mail body, attachments (viewable inline), external links
- Action buttons: `Mark In Progress`, `Mark Complete`, `Pause`, `Request Reassignment`
- **Walk-in Request** form: describe customer, admin approves
- **Live Chat** panel: direct messages to admin and broadcasts
- **Queue Pause toggle:** temporarily blocks new auto-assignments

### Prepress Module (`/prepress`)
- Paginated job table with search (Job ID / Customer), payment filter, date filter
- **Create Job** form:
  - Job ID (auto-appended with `DDMMYY`)
  - Customer phone (auto-looks up name if existing)
  - Customer name (autocomplete dropdown from DB)
  - Total Items count
  - Screenshot upload: drag/drop, paste from clipboard, browse
  - Walk-in / Contact Me toggles
- **Edit Job:** update totalItems, delivery type, manage/replace screenshots
- **Preview Job Card:** printable A5/A6 card with job details
- **Download All:** ZIP all screenshots for a job

### Cashier Module (`/cashier`)
- Lists jobs eligible for payment
- Marks PAID (records payment mode: UPI / Cash, reference number)

### Dispatch Module (`/dispatch`)
- Lists PAID jobs ready to dispatch
- Create parcel with delivery type
- Mark as dispatched; track dispatched vs pending

### Customer Portal (`/customer`)
- Customers log in with phone/email
- View their job status and estimated completion

---

## 7. API Routes Reference

### Auth
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/login` | None | Staff login → JWT + user object |
| POST | `/api/customer-auth/login` | None | Customer login → customer JWT |

### Prepress
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/prepress/jobs` | PREPRESS | List jobs (paginated, searchable, date-filterable) |
| GET | `/api/prepress/jobs/:jobId` | PREPRESS | Fetch single job by Job ID for edit form |
| POST | `/api/prepress/jobs` | PREPRESS | Create new job + upload screenshots |
| PATCH | `/api/prepress/jobs/:jobId` | PREPRESS | Update job (items, delivery type, screenshots) |
| GET | `/api/prepress/customer/by-phone/:phone` | PREPRESS | Look up customer by phone |
| GET | `/api/prepress/customers/search?name=` | PREPRESS | Search customers by name (autocomplete) |

### Queue (Staff Dashboard)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/queue/login` | QUEUE | Creates session, auto-assigns first job |
| POST | `/api/queue/logout` | QUEUE | Ends session, returns job to pool |
| POST | `/api/queue/complete/:jobId` | QUEUE | Completes job, archives folder, assigns next |
| POST | `/api/queue/pause/:jobId` | QUEUE | Pauses job (clears session slot) |
| POST | `/api/queue/resume/:jobId` | QUEUE | Resumes a paused job |
| POST | `/api/queue/request-reassign/:jobId` | QUEUE | Sends job to ADMIN_REVIEW + frees staff |
| POST | `/api/queue/walkin-request` | QUEUE | Requests admin approval for walk-in |
| POST | `/api/queue/heartbeat` | QUEUE | Updates `lastSeenAt` to prevent session timeout |
| GET | `/api/queue/my-job` | QUEUE | Returns currently assigned job |
| GET | `/api/queue/messages` | QUEUE | Get chat message history |
| POST | `/api/queue/toggle-pause` | QUEUE | Toggle isQueuePaused on session |

### Admin Queue
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/admin/queue/jobs` | ADMIN | Full job list (all statuses, date/staff/search filters) |
| GET | `/api/admin/queue/stats` | ADMIN | Live queue statistics |
| GET | `/api/admin/queue/sessions` | ADMIN | Active staff sessions with populated job details |
| GET | `/api/admin/queue/requests` | ADMIN | Pending reassign/walkin requests |
| POST | `/api/admin/queue/pin` | ADMIN | Pin job to staff + update preference |
| POST | `/api/admin/queue/unpin` | ADMIN | Remove pin from job |
| POST | `/api/admin/queue/reorder` | ADMIN | Change priority / queue position |
| POST | `/api/admin/queue/handle-request` | ADMIN | Approve or reject a request |
| POST | `/api/admin/queue/forceAssign/:jobId` | ADMIN | Directly assign job (PUSH mode, interrupts current) |
| POST | `/api/admin/queue/reassign/:jobId` | ADMIN | Reassign between staff (PARK or PUSH mode) |
| DELETE | `/api/admin/queue/jobs/bulk-delete` | ADMIN | Delete jobs + their physical folders from disk |
| PATCH | `/api/admin/queue/jobs/:id/tag` | ADMIN | Tag job with complexity label |

### Reports & Staff Administration
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/admin/reports/staff-productivity` | ADMIN | Completions, avg time, by role/timeframe |
| GET | `/api/admin/reports/activity-journal` | ADMIN | Chronological job event log for a date |
| GET | `/api/admin/users` | ADMIN | List all staff users |
| POST | `/api/admin/users` | ADMIN | Create staff account |
| PATCH | `/api/admin/users/:id` | ADMIN | Update staff account |
| DELETE | `/api/admin/users/:id` | ADMIN | Deactivate staff account |

### Dispatch & Cashier
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/dispatch/jobs` | DISPATCH | Dispatched/pending job list |
| POST | `/api/dispatch/parcels` | DISPATCH | Create a parcel for delivery |
| PATCH | `/api/dispatch/parcels/:id/dispatch` | DISPATCH | Mark parcel as dispatched |
| GET | `/api/cashier/jobs` | CASHIER | Jobs awaiting payment |
| PATCH | `/api/cashier/jobs/:id/payment` | CASHIER | Mark job PAID |

### Utilities
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/job-files/*` | Any | Safe proxy to serve files from N8N_WATCH_PATH |
| GET | `/api/attachments/:jobId/download-all` | Any | Download all screenshots as ZIP |
| GET | `/api/job-cards/:jobId` | Any | Job card data for print preview modal |
| GET | `/uploads/*` | None | Static file server for prepress screenshots |

---

## 8. Database Models

### `User`
| Field | Type | Notes |
|-------|------|-------|
| `name` | String | Display name |
| `username` | String | Login username (unique) |
| `password` | String | bcrypt hashed |
| `role` | Enum | ADMIN / PREPRESS / QUEUE / CASHIER / DISPATCH |
| `isActive` | Boolean | Soft-delete flag |
| `lastActiveAt` | Date | Updated by activityTracker middleware |

### `QueueJob` (Central Entity)
| Field | Type | Notes |
|-------|------|-------|
| `emailSubject` | String | n8n folder name / email subject |
| `customerEmail` | String | Sender address (indexed) |
| `customerName` | String | Extracted from email prefix |
| `mailBody` | String | Parsed text/HTML body |
| `folderPath` | String | Absolute path to n8n email folder |
| `attachments` | [String] | Relative paths to files inside folder |
| `externalLinks` | [{title, url}] | Parsed Drive/WeTransfer/Dropbox links |
| `status` | Enum | QUEUED / ASSIGNED / IN_PROGRESS / PAUSED / COMPLETED / JUNK / ADMIN_REVIEW |
| `priorityScore` | Number | 0=normal, 5=follow-up, 10=urgent |
| `queuePosition` | Number | FIFO tiebreaker |
| `pinnedToStaff` | ObjectId→User | Reserved for this designer |
| `assignedTo` | ObjectId→User | Currently working designer |
| `assignedAt` | Date | When assigned |
| `completedAt` | Date | When completed |
| `dueBy` | Date | SLA deadline (default: +4h from creation) |
| `type` | Enum | EMAIL or WALKIN |
| `fingerprint` | String | MD5 hash of content for deduplication |
| `threadId` | String | Links email revisions in same thread |
| `version` | Number | v1, v2, v3... within a thread |
| `parentJobId` | ObjectId→QueueJob | Direct predecessor job |
| `isSuperseded` | Boolean | Newer revision arrived while this was QUEUED |
| `continuityContext` | String | Why this job was pinned (tooltip) |
| `handoffNotes` | String | Staff reason for requesting reassignment |
| `staffHandoffReason` | String | Preserved original staff reason |
| `adminHandoffNotes` | String | Admin notes during reassignment |
| `reassignedFrom` | ObjectId→User | Original handler before reassignment |
| `complexityTag` | Enum | easy / medium / complex (admin-tagged post-completion) |
| `auditLog` | [{action, actor, timestamp, details}] | Full change history |

### `QueueSession`
| Field | Type | Notes |
|-------|------|-------|
| `staffId` | ObjectId→User | The designer |
| `isActive` | Boolean | Currently "clocked in" |
| `currentQueueJob` | ObjectId→QueueJob | Email job being worked on |
| `currentWalkinJob` | ObjectId→QueueJob | Walk-in job being worked on |
| `lastSeenAt` | Date | Updated every 60s by heartbeat |
| `loginAt`, `logoutAt` | Date | Session boundary timestamps |
| `isQueuePaused` | Boolean | If true, auto-assignment skips this staff |

### `CustomerPreference`
| Field | Type | Notes |
|-------|------|-------|
| `customerEmail` | String | Unique per customer |
| `preferredStaff` | ObjectId→User | Last designer who completed their job |
| `confirmedCount` | Number | Reinforcement counter |
| `updatedAt` | Date | Used for 5-hour window check |

### `IngestionTask`
| Field | Type | Notes |
|-------|------|-------|
| `folderPath` | String | Absolute path to email subfolder |
| `status` | Enum | PENDING → PROCESSING → COMPLETED / FAILED |
| `attempts` | Number | Retry counter |
| `error` | String | Last failure message |

### `Job` (Prepress Physical Job)
| Field | Type | Notes |
|-------|------|-------|
| `jobId` | String | Custom ID: `PPK-9902-210426` |
| `customerName`, `customerPhone` | String | Customer identity |
| `customerId` | ObjectId→Customer | DB link |
| `totalItems` | Number | Expected screenshot count |
| `itemScreenshots` | [String] | Relative paths to uploaded images |
| `packingPreference` | Enum | SINGLE / BULK |
| `paymentStatus` | Enum | UNPAID / PAID / ADMIN_APPROVED |
| `defaultDeliveryType` | Enum | COURIER / WALK_IN |
| `contactMe` | Boolean | Call customer on completion |
| `createdBy` | ObjectId→User | Which PREPRESS staff created it |

### `QueueMessage` (Chat)
- `sender`, `senderName`, `recipientId`, `body`, `type` (DIRECT/BROADCAST)
- `jobId` — optional job reference
- Auto-purged after 12 hours

### `QueueRequest` (Walk-in & Reassign Requests)
- `type`: WALKIN or REASSIGN
- `jobId`: Target job (REASSIGN only)
- `requestedBy`: Staff who created the request
- `status`: PENDING → APPROVED / REJECTED
- `adminAction`: Admin's decision note

### `QueueStats` (Singleton)
- `totalWaiting`, `totalInProgress`, `totalCompleted`
- `breachRisk5`, `breachRisk15` — SLA alert counts
- `staleJobs` — jobs waiting > 2 hours

---

## 9. Backend Services

### `eventBus.js`
A vanilla `EventEmitter` singleton used as an internal pub/sub bus. Services communicate asynchronously by emitting events here instead of calling each other directly, keeping the architecture loosely coupled.

### `eventHandlers.js`
Subscribes to all internal `eventBus` events and:
- Translates them into **Socket.io broadcasts** to the right rooms (`admin:queue`, `staff:{id}`)
- Triggers **stats recalculation** via `statsService.recalculate()`
- Triggers **auto-assignment sweeps** via `assignIdleStaff()`
- Runs a **30-second state:sync loop** pushing full session snapshots to admin

### `fileWatcher.js`
Uses **chokidar** to watch `N8N_WATCH_PATH` for new directories at exactly depth 2.

Key behaviors:
- **Startup scan:** Ingests all existing unprocessed folders on server start
- **Real-time watch:** 3-second delay + `awaitWriteFinish: 2000ms` before processing new folders
- **Guard:** Checks `QueueJob.findOne({ folderPath })` (any status) before creating a task. If ANY job exists for that folder (including JUNK), the folder is skipped — preventing re-ingestion

### `processingWorker.js` (~420 lines)
Polls MongoDB every 2 seconds for PENDING IngestionTasks and processes them sequentially.

Pipeline per task:
1. Compute **folder fingerprint** (MD5 of attachment sizes + first 8KB samples)
2. Parse **customerEmail** (strip `(N)` suffix) and **emailSubject** from folder names
3. **Spam check** → JUNK or ADMIN_REVIEW routing
4. **Thread detection** → find parent job, set `threadId`, `version`, `parentJobId`
5. **Staff preference lookup** → 4-level cascade (see Section 16)
6. **Create QueueJob** with all metadata
7. **Patch parent's `threadId`** if it was null
8. **Supersede** older QUEUED/ADMIN_REVIEW siblings via `$or: [{ threadId }, { _id: parentJobId }]`
9. **Emit `job:created`** to eventBus

### `queueEngine.js` (~1,006 lines)
The core assignment brain. Contains 12 exported functions:

| Function | Purpose |
|----------|---------|
| `assignNextJob(staffId)` | Assign next eligible job to a specific staff member |
| `onJobComplete(staffId, jobId)` | Handle job completion + archive + next assignment |
| `onStaffLogin(staffId)` | Create session + trigger first assignment |
| `onStaffLogout(staffId, reason)` | End session + return jobs to queue |
| `pinJob(jobId, targetStaffId)` | Admin: pin job + update preference |
| `unpinJob(jobId)` | Admin: remove pin |
| `reorderQueue(jobId, priority, position)` | Admin: change sort order |
| `reassignJob(jobId, from, to, notes, opts)` | Move job between staff (PARK or PUSH) |
| `handleRequest(requestId, decision, ...)` | Approve/reject WALKIN or REASSIGN requests |
| `requestReassignment(staffId, jobId, reason)` | Staff requests admin review |
| `pauseJob(staffId, jobId)` | Pause active job |
| `resumeJob(staffId, jobId)` | Resume a paused job |
| `assignIdleStaff()` | Sweep all idle sessions with no job |
| `cleanupStaleSessions()` | Full system integrity sweep (every 2 min) |
| `toggleQueuePause(staffId, isPaused)` | Block/allow auto-assignments for staff |

### `statsService.js`
`recalculate()` recomputes all `QueueStats` counters from scratch using MongoDB aggregation. Called after any state change that affects counts.

---

## 10. Queue Engine Deep Dive

### Assignment Priority Order
```
1. pinnedToStaff jobs first (for THIS staff member)     — sort: pinnedToStaff: -1
2. Higher priorityScore first                            — sort: priorityScore: -1
3. Lower queuePosition first (FIFO)                      — sort: queuePosition: 1
4. Older createdAt first (absolute FIFO tiebreaker)      — sort: createdAt: 1
```

### Concurrency Shield
Before taking a candidate job, the engine checks:
```
Does any OTHER designer currently have a job (ASSIGNED/IN_PROGRESS/PAUSED)
from the same customerEmail?
```
If yes → skip this candidate, try next. This prevents two designers working on the same customer simultaneously.

### Two-Level Atomic Safety
1. **Per-staff in-memory lock** (`Set`): Prevents two concurrent calls to `assignNextJob(staffId)` within the same process.
2. **DB-level session claim** (`findOneAndUpdate({ currentQueueJob: null })`): Prevents cross-process double-assignment even in multi-instance PM2 deployments.

### Batch Lock After Assignment
After a designer is assigned to Customer X's job, ALL other QUEUED + unpinned jobs from Customer X are immediately pinned to the same designer. This ensures one designer handles the full customer batch.

### Job Completion Flow
```
1. Atomic COMPLETED update (findOneAndUpdate)
2. Clear session.currentQueueJob
3. Archive folder (N8N_WATCH_PATH → COMPLETED_JOBS_PATH)
4. Remove empty parent folders up to watch root
5. Update CustomerPreference (sticky routing learning)
6. Check for PAUSED jobs → resume most-recently-updated one
7. Emit job:completed → stats decrement
8. assignNextJob(staffId) → give designer new work
```

### Reassignment Modes
| Mode | Behavior |
|------|---------|
| `PARK` (default) | If target is busy → pin to them (QUEUED, waits for their slot) |
| `PUSH` | If target is busy → pause their current job, force-assign the incoming job immediately |

---

## 11. WebSocket Events Reference

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join:staff` | `staffId` | Join personal notification room |
| `join:admin` | `adminId` | Join admin queue room |
| `chat:send` | `{fromId, toId, message, jobId}` | Send persistent chat message |
| `chat:typing` | `{fromId, fromName, toId}` | Typing indicator |

### Server → Client
| Event | Who receives | Payload | Description |
|-------|-------------|---------|-------------|
| `job:assigned` | Staff (personal room) | `{job}` | New job pushed |
| `job:removed` | Staff (personal room) | `{jobId}` | Job recalled or reassigned away |
| `job:update` | Staff (personal room) | `{job}` | Job data changed |
| `queue:refresh` | Admin room | — | Re-fetch the queue list |
| `stats:update` | Admin room | `{stats}` | Live queue counts updated |
| `session:update` | Admin room | `{sessions}` | Online designers list changed |
| `state:sync` | Admin room | `{sessions}` | Full session snapshot (every 30s) |
| `reassign:alert` | Admin room | `{request}` | Staff requested reassignment |
| `walkin:alert` | Admin room | `{request}` | Staff requested walk-in approval |
| `chat:received` | Recipient + Sender | `{message}` | Incoming chat message |
| `chat:typing` | Recipient | `{fromId, fromName}` | Typing indicator |

---

## 12. Background Subsystems & Timers

| Timer | Interval | Where | What it does |
|-------|----------|-------|-------------|
| `processingWorker` poll | 2 seconds | server.js startup | Checks for PENDING IngestionTasks |
| Client heartbeat | 60 seconds | Queue frontend | Updates session `lastSeenAt` |
| `state:sync` broadcast | 30 seconds | eventHandlers.js | Full session snapshot → admin |
| `cleanupStaleSessions` | ~2 minutes | server.js startup | Full integrity sweep |

### `cleanupStaleSessions()` — 7 Steps Every ~2 Minutes:
1. **Session Timeout** — Sessions with `lastSeenAt > 90 min ago` → force logout
2. **Ghost Job Recovery** — ASSIGNED/IN_PROGRESS jobs with no matching active session → returned to QUEUED
3. **Stale Pin Release** — QUEUED jobs pinned to staff offline > 2h → pin released to general pool
4. **Ingestion Recovery** — IngestionTasks stuck PROCESSING > 10 min → reset to PENDING
5. **Ghost Folder Sweep** — QUEUED/ADMIN_REVIEW jobs whose physical folder no longer exists → deleted (only applies to EMAIL jobs with non-empty folderPath)
6. **SLA Stats Update** — Recalculates breach risk counters
7. **Chat Purge** — Deletes chat messages older than 12 hours

---

## 13. File Storage & Attachment Handling

### Prepress Uploads
```
Path:    {UPLOAD_PATH}/jobs/{DD-MM-YYYY}/{JobId}/{filename}
Example: uploads/jobs/21-04-2026/PPK-0042-210426/artwork.jpg
Served:  GET /uploads/jobs/21-04-2026/PPK-0042-210426/artwork.jpg
```
- Handles legacy path format (no date) and new date-based format
- On edit: kept screenshots sent as JSON array; new files uploaded and merged

### Email Attachments (n8n Managed)
```
Intake:   {N8N_WATCH_PATH}/{email}/{subject_folder}/{files}
Archive:  {COMPLETED_JOBS_PATH}/{email}/{subject_folder}/{files}
Served:   GET /job-files/{relative_path} (safe proxy)
```
- On completion: folder is `renameSync`'d (with EXDEV fallback for cross-volume moves)
- Empty parent folders are recursively cleaned up after archival

### ZIP Download (Prepress)
- Route: `GET /api/attachments/:jobId/download-all`
- Uses `archiver` library to create a streaming ZIP of all screenshots

---

## 14. Email Ingestion Pipeline (n8n → Queue)

### Expected Folder Structure
```
E:\InboundJobs\
└── customer@gmail.com\                              ← Parent = sender email
    └── 2026-04-21T10-30-00_Print_File\             ← Subfolder = timestamp_subject
         ├── email_body.txt                          ← Plain text body
         ├── email_body.html                         ← HTML (stripped of tags)
         └── artwork.pdf                             ← Attachment
```

### Fingerprint Calculation
Hashes: `SUBJECT:{subject}|COUNT:{n}|{filename}:{size}:{md5_of_first_8KB}|...`
Text/HTML files are **excluded** from fingerprint (only binary attachments are hashed).

### Thread Detection (4 levels)
```
1. Find active job (QUEUED/ASSIGNED/IN_PROGRESS/PAUSED/ADMIN_REVIEW)
   with matching fingerprint OR matching emailSubject
   → isFollowUp = true → threadId = parent.threadId || parent._id
   → preferredStaff = parent.assignedTo || parent.pinnedToStaff

2. If not found → check COMPLETED/JUNK jobs with same subject in last 5h
   → threadId continuity only (no preferredStaff from here)

3. Check CustomerPreference updated within last 5h
   → preferredStaff only (no threadId)

4. No match → fresh job, no thread, no preference
```

### Spam Filtering
| Category | Keywords | Result |
|----------|---------|--------|
| MARKETING | `subscribe`, `newsletter`, `unsubscribe`, `promo`, `ads`, `alerts@`, `notifications@`, `updates@` | → `JUNK` |
| NOREPLY | `noreply`, `no-reply`, `no_reply`, `do-not-reply` | → `ADMIN_REVIEW` |
| **Whitelist** (override above) | `wetransfer.com`, `we.tl`, `transferxl.com`, `sendgb.com` | → Normal processing |

> ⚠️ Whitelist check runs **before** spam check. So `noreply@wetransfer.com` is correctly whitelisted.

---

## 15. Job Statuses & Lifecycle

```
                     ┌────────────────────────────────┐
n8n Email ──────────►│           QUEUED               │◄── Returned on logout/reassign
Spam → JUNK          └──────────────┬─────────────────┘
Duplicate → ADMIN_REVIEW            │ assignNextJob()
noreply → ADMIN_REVIEW              ▼
                     ┌────────────────────────────────┐
                     │           ASSIGNED             │
                     └──────────────┬─────────────────┘
                                    │ Staff starts work
                     ┌──────────────▼─────────────────┐
                     │          IN_PROGRESS            │
                     └──────────────┬─────────────────┘
                           │        │ Staff pauses
                           │        ▼
                           │  ┌─────────────┐
                           │  │   PAUSED    │──► resume() → IN_PROGRESS
                           │  └─────────────┘
                           │ Mark complete
                     ┌─────▼───────────────────────────┐
                     │           COMPLETED              │
                     │   (folder archived)              │
                     └──────────────────────────────────┘

Special transitions:
  ASSIGNED/IN_PROGRESS + Staff request → ADMIN_REVIEW → QUEUED (rejected) or ASSIGNED (approved)
  QUEUED (new revision arrives) → JUNK (superseded)
  Admin bulk delete → physically removed from DB + disk
```

---

## 16. Staff Continuity & Sticky Routing

The system uses 4 layers of memory to route returning customers to the same designer:

| Priority | Data Source | Time Window | Staff Picked Up From |
|----------|------------|-------------|---------------------|
| 1st | `activeJob.assignedTo` | Now | Job actively being worked |
| 2nd | `activeJob.pinnedToStaff` | Now | Job pinned (QUEUED, not yet assigned) |
| 3rd | Recently completed job with same subject | Last 5 hours | `recentJob` lookup |
| 4th | `CustomerPreference.preferredStaff` | Last 5 hours | DB learning record |

**Online check:**
- Staff **strictly online** (isActive + lastSeenAt < 90 min) → pin + immediate push notification
- Staff **relatively online** (lastSeenAt < 5h) → pin but no immediate push
- Staff **fully offline > 2h** → pin released by cleanup sweep to general pool

**Learning triggers** (all update `CustomerPreference`):
- Job completed by a designer
- Admin manually pins a job to a designer
- Admin reassigns a job to a designer

---

## 17. Known Edge Cases & Limitations

| # | Scenario | Current Behavior | Risk Level |
|---|----------|-----------------|------------|
| 1 | Staff has PAUSED job; customer sends revision | Revision pinned to staff, but staff auto-resumes PAUSED (stale) first | ⚠️ Medium |
| 2 | Job pinned (QUEUED, assignedTo=null); revision arrives | `preferredStaff` reads `assignedTo` → null; continuity lost | ⚠️ Medium |
| 3 | Same customer, two jobs with identical subjects | Later revision may thread to wrong job | ⚠️ Medium |
| 4 | Large attachment (>3s write time by n8n) | FileWatcher may ingest incomplete folder | ⚠️ Medium |
| 5 | `alerts@legitimate-customer.com` email | Flagged MARKETING → silently junked | ⚠️ Medium |
| 6 | PM2 cluster mode (2+ instances) | In-memory assignment lock is per-process | 🔴 Critical — run single instance only |
| 7 | Walk-in job approved for offline staff | `folderPath: ''` — ghost sweep correctly skips it | ✅ Fixed |
| 8 | Admin deletes folder via Windows Explorer | Ghost sweep (every 2 min) auto-removes orphan DB records | ✅ Auto-healed |
| 9 | Job re-ingested after being JUNK'd | FileWatcher now checks ALL statuses (not just JUNK/COMPLETED) | ✅ Fixed |

---

## 18. Starting & Restarting the System

### First-Time Setup
```bash
# 1. Install backend dependencies
npm install

# 2. Build frontend
cd printing-press-frontend
npm install
npm run build
cd ..

# 3. Create environment file
copy .env.example .env
# Edit .env with correct values (MONGO_URI, N8N_WATCH_PATH, etc.)

# 4. Start with PM2
pm2 start server.js --name despatch-system
pm2 save
pm2 startup   # Register for Windows auto-start on boot
```

### After Backend Code Changes
```bash
pm2 restart all
```

### After Frontend Changes
```bash
cd printing-press-frontend && npm run build && cd ..
pm2 restart all
```

### Useful PM2 Commands
```bash
pm2 logs despatch-system            # Live log stream
pm2 logs despatch-system --lines 500 # Last 500 lines
pm2 status                           # All process statuses
pm2 monit                            # CPU + memory monitor
```

### Database Maintenance Scripts
Run from project root (`node <script>`):

| Script | Purpose |
|--------|---------|
| `clean_ghosts.js` | Delete DB jobs whose physical folders are missing from disk |
| `clean_zombies.js` | Delete exact duplicate jobs (same folder, keep newest) |
| `fix_folder_dupes.js` | Fix same-folder conflicts, keeping most active status |
| `diagnose_conflicts.js` | Audit for customers with jobs in both QUEUED + ADMIN_REVIEW simultaneously |
| `check_dups.js` | List all folders with 2+ jobs in any status |

---

*Full audit of edge cases: see `queue_engine_audit.md` in the project root.*  
*Last updated: April 2026, Build Q2.*
