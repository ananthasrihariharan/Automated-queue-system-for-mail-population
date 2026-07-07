# Press Module Feature Documentation

This document describes the features, database models, API endpoints, frontend interfaces, microservices, and functionality flags of the **Press** module.

---

## 1. Module Name & Purpose
- **Module Name**: Press Plate Verification & Print Production
- **Directory**: `modules/press`
- **Purpose**: Manages the first physical production stage of the printing queue, tracking paper loading, plate verification, and print confirmations.

---

## 2. Database Models & Relations
The Press module reads and writes the following tables:
- **`Job`**: Reads the overall order structure.
- **`JobItem`**:
  - `pressStatus`: Enums `PENDING` | `IN_PROGRESS` | `COMPLETED`.
  - `printedById` (mapped from `printedBy`): Stores the ID of the press operator.
  - `activeStage`: Represents the active step (usually advancing from `press` to the relevant post-press lamination/binding specification).
- **`JobTaskLog`** (Mongoose nested `taskLog` array):
  - Stores started/completed times for plate loading, machine print runs, and staff mappings with `module: 'press'`.

---

## 3. Features & Functional Workflows

### A. Backend APIs
Mapped to Express under `/api/press`:
- **`GET /jobs`**:
  - Retrieves print jobs queued for printing (e.g. jobs that completed prepress approval and have pending press items).
- **`GET /jobs/history`**:
  - Lists completed print runs.
- **`PATCH /jobs/:jobId/confirm-item`**:
  - Marks an individual item index inside the job as printed, records operator ID, updates `pressStatus` to `COMPLETED`, and emits socket `workflow:updated`.
- **`PATCH /jobs/:jobId/finish`**:
  - Finalizes the printing stage for all items in the job, transitions them to their next respective post-press stage, and emits `workflow:updated`.

### B. Frontend Dashboards
- **PressDashboard (`PressDashboard.tsx`)**:
  - Consolidates incoming jobs into layout tables grouped by media types.
  - Provides quick action checkmarks to confirm plate layout matches, record sheet completions, and trigger stage completions.

### C. Microservice
- **File**: `modules/press/backend/microservice.js`
- **Port**: `3006` (or points to `PRESS_SERVICE_URL`)
- **Role**: Validates printing stage actions.

---

## 4. Functionality Flags & Parameters
- **`PRESS_SERVICE_URL`** (env): URL of the microservice. Mapped for remote stage communications.
- **`item_index`**: Identifies specific print items within a batch job.
- **Authorization**: Protected via auth and restricts modifications to users with roles `PRESS` or `ADMIN`.

---

## 5. Additional Features (Not Yet Implemented)

### A. Machine / Printer Assignment
- `PATCH /jobs/:jobId/items/:itemIndex/assign-machine` — Record which physical printing machine printed a specific item (e.g., "HP Indigo 12000", "Konica Minolta C1070").
- Requires `JobItem.machineId String?` (new column) or a lookup into a `PrintMachine` reference table.
- Enables per-machine throughput and downtime reporting.

### B. Sheet / Impression Count Recording
- `PATCH /jobs/:jobId/items/:itemIndex/record-sheets` — Log actual sheets/impressions consumed during printing.
- Stores to `JobItem.actualSheets Int?` (new column) vs the estimated `JobItem.sheets` from the job card spec.
- Variance between estimated and actual is a key KPI for print accuracy.

### C. Paper / Media Stock Deduction
- When a print run is confirmed via `PATCH /confirm-item`, deduct media stock from an inventory table.
- Requires a `MediaStock` table: `{ id, mediaType, size, remainingReams, reorderLevel, updatedAt }`.
- `JobItem.media` already records the media type — map it to the stock record and decrement on confirm.

### D. Plate Management
- `PATCH /jobs/:jobId/items/:itemIndex/assign-plate` — Associate a plate ID with a print item for reuse tracking.
- Requires `PlateRecord` table: `{ id, plateCode, mediaType, jobId, itemIndex, createdAt, lastUsedAt, useCount }`.
- Allows detecting when a plate is reused vs new — cost tracking and maintenance scheduling.

### E. Press Operator Performance Dashboard
- `GET /history?staffId=&from=&to=` — Press history filtered by operator, with count of items printed and average print time.
- Sourced from `JobTaskLog WHERE module = 'press' AND staffId = :staffId AND completedAt BETWEEN :from AND :to`.
- Uses existing `@@index([staffId, module, completedAt])`.

### F. Rejection at Press Stage
- `POST /jobs/:jobId/items/:itemIndex/reject` — Marks an item as rejected at press (e.g., color mismatch, misprint).
- Resets `JobItem.pressStatus` back to `PENDING`, logs `JobEvent` with rejection reason.
- Item reappears in `GET /jobs` (incoming queue) for reprint.
- Rejection count tracked in `JobItem.rejectionCount Int @default(0)` (new column).

### G. Print Job Grouping by Media Type
- `GET /jobs/grouped` — Returns current press queue grouped by `JobItem.media` type so operators can batch all A4-Glossy items into one machine run.
- Reduces setup overhead; derived from `JobItem WHERE pressStatus = 'PENDING' GROUP BY media`.
- Fastest when combined with the `@@index([pressStatus])` added in Phase 1.

### H. Reprint Request from Post-Press/Finishing
- When post-press or finishing rejects an item (see their feature sections), press must receive a reprint notification.
- Subscribe to `workflow:updated` socket events where `activeStage` resets to `press`.
- Press dashboard badge should highlight reprint items differently (e.g., amber color, "REPRINT" label).
