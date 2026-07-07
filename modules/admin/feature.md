# Admin Module Feature Documentation

This document describes the features, database models, API endpoints, frontend interfaces, microservices, and functionality flags of the **Admin** module.

---

## 1. Module Name & Purpose
- **Module Name**: Admin Control & Reporting Module
- **Directory**: `modules/admin`
- **Purpose**: Provides administrative control over users, queues, active sessions, system configurations, and analytical reports (productivity, production workloads, and timelines).

---

## 2. Database Models & Relations
The Admin module operates on the following PostgreSQL tables:
- **`User`**: Main staff user repository (names, phone/email, password, roles).
- **`UserRole` & `Role`**: Many-to-many user role mapping (e.g., `ADMIN`, `PREPRESS`, `CASHIER`, `DISPATCH`).
- **`QueueJob`**: Inspects and overrides queue job status, assignments, handoff notes, and priorities.
- **`QueueSession`**: Manages active staff sessions, logout overrides, and auto-assignment flags.
- **`QueueRequest`**: Resolves walk-in approval requests and job reassignment requests.
- **`JobEvent`**: Event log tracks for the Activity Journal.
- **`SystemConfig`**: System parameters (e.g., auto-assign configurations).

---

## 3. Features & Functional Workflows

### A. Backend APIs
Mapped to Express under `/api/admin` and `/api/admin/reports`:
- **General Admin (`admin.js`)**:
  - `GET /stats` — Live queue metrics.
  - `POST /auto-assign/toggle` — Toggles system-wide auto-assignment flags.
  - `POST /reassign-action` — Approves or rejects job reassignment requests.
  - `POST /walkin-action` — Approves or rejects walk-in requests.
- **User Management (`admin-users.js`)**:
  - `GET /users` — Retrieve all users.
  - `POST /users` — Create a new staff user.
  - `PUT /users/:id` — Update user details or active status.
- **Reports and Analytics (`reports.js`)**:
  - `GET /staff-productivity` — Analytical workloads and average processing times.
  - `GET /staff-jobs` — Aggregate job counts and listings.
  - `GET /activity-journal` — Event timeline log of job assignments and transitions.
  - `GET /production-workloads` — Active stage distribution metrics across press, post-press, and finishing.
  - `GET /production-journal` — Production task log entries for finished jobs.

### B. Frontend Dashboards
- **AdminDashboard (`AdminDashboard.tsx`)**: Main layout, mounts queue control, WhatsApp status, and reports modules.
- **AdminQueuePanel (`AdminQueuePanel.tsx`)**: Active session overrides, pending walk-in/reassign requests, and queue position management.
- **WhatsAppJob (`WhatsAppJob.tsx`)**: Tracks automated WhatsApp jobs and status queues.

### C. Microservice
- **File**: `modules/admin/backend/microservice.js`
- **Port**: `3001` (by default or as configured)
- **Role**: Exposes standalone administrative services or hooks.

---

## 4. Functionality Flags & Parameters
- **`process.env.DB_MODE`**: Determines whether the backend uses `postgres` or `mongo`.
- **`SystemConfig` Keys**:
  - `auto_assign_enabled` (boolean): Master switch for queue assignment.
- **Role Checks**: Router endpoints require authentication and restrict access to the `ADMIN` role.

---

## 5. IDE/Agent Reference Context
- When implementing new reports, ensure both `postgres` and `mongo` query layers are supported.
- User queries must normalization-map the legacy Mongoose `roles` array (derived from `role` and `rawRoles` in PostgreSQL).

---

## 6. Additional Features (Not Yet Implemented)

### A. Role Management UI
- `GET /roles` — List all roles from the `Role` table.
- `POST /roles` — Create a new role (e.g., `FINISHING_BINDING` sub-role).
- `DELETE /roles/:roleId` — Remove a role (guard: prevent deleting system roles like `ADMIN`).
- Frontend: Role management panel within AdminDashboard allowing drag-assign of roles to users.

### B. Shift & Session Reporting
- `GET /reports/session-summary` — Per-staff login/logout durations per date range, derived from `QueueSession.loginAt` / `logoutAt`.
- Tracks total active hours per staff per day — useful for payroll and shift planning.

### C. Queue Health Alerts & Breach Configuration
- `GET /reports/breach-risk` — Returns jobs where `QueueJob.dueBy` is within configurable thresholds (15 min / 5 min) using indexed `dueBy` column.
- `POST /system-config/breach-thresholds` — Allow admin to configure the breach warning windows stored in `SystemConfig`.
- Persists `breach_threshold_15`, `breach_threshold_5` keys in `SystemConfig`.

### D. QueueStats Time-Series History
- Currently `QueueStats` is a single-row snapshot (anti-pattern).
- After schema fix (add `snapshotAt DateTime`), expose:
  - `GET /reports/queue-history?from=&to=` — Returns queue load trend over time for charts.

### E. Bulk Admin Operations
- `POST /queue/bulk-reassign` — Reassign multiple jobs at once to a staff member.
- `POST /queue/bulk-close` — Mark multiple junk/duplicate jobs in one action.
- `POST /users/bulk-deactivate` — Deactivate selected users in one call.

### F. System Configuration Management UI
- Frontend panel to view and edit all `SystemConfig` key-value pairs.
- Supports toggling `auto_assign_enabled`, setting breach thresholds, and other system flags without a code deploy.

### G. PDF/Excel Report Export
- `GET /reports/staff-productivity/export?format=pdf|csv` — Download formatted report.
- `GET /reports/production-journal/export` — Download production log as spreadsheet.
- Uses a server-side generation library (e.g., `pdfkit` or `exceljs`).

### H. Audit Log Search & Filter
- `GET /reports/activity-journal?userId=&actionType=&from=&to=&jobId=` — Filtered event timeline.
- Currently the `JobEvent` table has good indexes; the API endpoint should expose filter parameters for all indexed columns.
- Allows admin to trace exact sequence of actions on any job.
