# Finishing Module Feature Documentation

This document describes the features, database models, API endpoints, frontend interfaces, microservices, and functionality flags of the **Finishing** module.

---

## 1. Module Name & Purpose
- **Module Name**: Finishing Quality Control & Packaging
- **Directory**: `modules/finishing`
- **Purpose**: Handles the third and final stage of production tasks (such as Cutting, Die-Cutting, Creasing, and Corner-Cutting) before transferring finished items to the dispatch rack.

---

## 2. Database Models & Relations
The Finishing module operates on the following data structures:
- **`Job`**:
  - Contains overall order status, item checklists, and task log history.
- **`JobItem`**:
  - `activeStage`: Classified as `cutting`, `creasing`, `dieCutting`, `cornerCutting`, `cutting2`, or `done`.
  - Mapped relational specifications: `cuttingSpec`, `dieCuttingSpec`, `creasingSpec`, `cornerCuttingSpec`.
  - `finishingCompletedById` & `finishingCompletedAt`: Logs who finished the QA block.
- **`JobTaskLog`** (Mongoose nested `taskLog` array):
  - Records started/completed timestamps, durations, and processor names for analytics.

---

## 3. Features & Functional Workflows

### A. Backend APIs
Mapped to Express under `/api/finishing`:
- **`GET /jobs/incoming`**:
  - Retrieves print jobs that have completed the prior stages (Press/Post-Press) and are queued for finishing.
- **`GET /jobs`**:
  - Retrieves active finishing tasks. For sub-role processors, filters jobs based on their active task capability mapping.
- **`GET /jobs/history`**:
  - Lists historical finishing tasks completed by the logged-in staff member (or all entries for admins).
- **`POST /jobs/:jobId/task-start`**:
  - Creates a new entry in `taskLog` marking the start timestamp, staff details, and finishing sub-task type.
- **`PATCH /jobs/:jobId/complete-task`**:
  - Marks the finishing sub-task as finished, records the `completedAt` timestamp in `taskLog`, and updates the stage to `done`. Emits socket event `workflow:updated`.

### B. Frontend Dashboards
- **FinishingDashboard (`FinishingDashboard.tsx`)**:
  - Displays work cards representing pending finishing stages.
  - Allows staff to start/complete tasks, view detailed item specifications, check workflow states, and review completed work history.

### C. Microservice
- **File**: `modules/finishing/backend/microservice.js`
- **Port**: `3008` (or points to `FINISHING_SERVICE_URL`)
- **Role**: Validates finishing operations and updates stages.

---

## 4. Functionality Flags & Parameters
- **Finishing Sub-roles**:
  - `FINISHING_CUTTING` -> Allows `'cutting'` and `'cutting2'` tasks.
  - `FINISHING_DIE_CUTTING` -> Allows `'dieCutting'` tasks.
  - `FINISHING_CREASING` -> Allows `'creasing'` tasks.
  - `FINISHING_CORNER_CUT` -> Allows `'cornerCutting'` tasks.
  - `FINISHING` / `ADMIN` -> Allows all tasks.
- **`FINISHING_SERVICE_URL`** (env): URL of the microservice. Falls back to `PRESS_SERVICE_URL` if undefined.

---

## 5. Additional Features (Not Yet Implemented)

### A. QA Rejection Workflow (Send Back to Press/Post-Press)
- `POST /jobs/:jobId/reject-item` — Marks a `JobItem` as rejected, resets its `activeStage` back to the previous stage (`press` or the relevant post-press step), and emits `workflow:updated`.
- Requires a `rejectionReason String?` on `JobItem` (new column) and a `JobEvent` entry with `actionType = 'REASSIGNED'` noting the rejection.
- The press or post-press dashboard then picks the item up again in their incoming view.

### B. Batch Task Grouping
- `GET /jobs/by-task/:taskType` — Returns all items currently at a specific finishing stage (e.g., all `dieCutting` items grouped), allowing one operator to process a batch of similar tasks at once.
- Reduces machine setup overhead when many items share the same finishing process.
- Derived from `JobItem WHERE activeStage = taskType` using the new `@@index([jobId, activeStage])`.

### C. Material Consumption Tracking
- `POST /jobs/:jobId/materials` — Records consumables used during finishing (e.g., lamination roll meters, die-cut sheets used).
- Requires a new `FinishingMaterialLog` table: `{ id, jobId, itemId, material, quantityUsed, unit, loggedById, loggedAt }`.
- Feeds into a future materials inventory module.

### D. Completion Time Estimation
- `GET /jobs/eta` — Returns estimated completion times for jobs currently in finishing, based on historical `JobTaskLog` durations for the same task type.
- Uses `AVG(durationMs)` from `JobTaskLog WHERE module = 'finishing' AND task = :taskType`.

### E. Per-Item QA Checklist
- Attach a checklist to each finishing stage: operator must tick off sub-steps (e.g., "Corners trimmed", "No lamination bubbles", "Sheet count verified") before marking complete.
- Store as `JobItemWorkflowStep.checklist Json?` (new nullable column) or a separate `QACheck` table.

### F. Finishing Operator Stats
- `GET /history?staffId=&from=&to=` — Finishing history filtered by operator and date.
- Currently history is staff-aware but the endpoint docs don't specify `staffId` filter param — expose it explicitly.
- Shows total items finished, average duration per task type, and rejection rate per operator.
