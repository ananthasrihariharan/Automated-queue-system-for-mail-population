# Post-Press Module Feature Documentation

This document describes the features, database models, API endpoints, frontend interfaces, microservices, and functionality flags of the **Post-Press** module.

---

## 1. Module Name & Purpose
- **Module Name**: Post-Press Production & Specification Sort
- **Directory**: `modules/postpress`
- **Purpose**: Manages the second stage of print processing. Operates on physical specifications applied to printed items, including Lamination, Binding, Folding, Creasing, Die-cutting, and Foiling.

---

## 2. Database Models & Relations
The Post-Press module interacts with the following database tables:
- **`Job`**:
  - Holds general information, active items array, and event tracking records.
- **`JobItem`**:
  - `activeStage`: Classified as `lamination`, `foil`, `binding`, `fusing`, `holes`, `creasing`, `dieCutting`, `cornerCutting`, `cutting2`, or `done`.
  - Mapped specifications: `laminationSpec`, `bindingSpec`, `foilSpec`, `idCardSpec` (fusing/holes).
  - `ppsCompletedById` & `ppsCompletedAt`: Tracks who recorded completion of the stage.
- **`JobTaskLog`** (Mongoose nested `taskLog` array):
  - Stores started/completed dates, duration, and staff name with `module: 'post_press'`.

---

## 3. Features & Functional Workflows

### A. Backend APIs
Mapped to Express under `/api/post-press`:
- **`GET /incoming`**:
  - Retrieves printed items ready for post-press finishing.
- **`GET /jobs`**:
  - Retrieves active post-press jobs (typically lamination or binding).
- **`GET /jobs/history`**:
  - Returns history of completed post-press processes.
- **`POST /jobs/:jobId/task-start`**:
  - Registers the start of a post-press sub-process in the job's `taskLog`.
- **`PATCH /jobs/:jobId/complete-task`**:
  - Records completion of a lamination/binding sub-task, registers durations, advances the stage, and emits `workflow:updated`.

### B. Frontend Dashboards
- **PostPressDashboard (`PostPressDashboard.tsx`)**:
  - Categorizes incoming orders into specs (e.g. Glossy/Matte Lamination, Center Pin/Perfect/Case/Wiro Binding).
  - Provides workflow buttons to start and complete tasks.

### C. Microservice
- **File**: `modules/postpress/backend/microservice.js`
- **Port**: `3007` (or points to `POST_PRESS_SERVICE_URL`)
- **Role**: Dispatches and tracks post-press specifications.

---

## 4. Functionality Flags & Parameters
- **`POST_PRESS_SERVICE_URL`** (env): URL of the microservice. Falls back to `PRESS_SERVICE_URL` if undefined.
- **`taskType`** query parameter: Switch between different post-press sub-processes (`lamination`, `binding`).
- **Authorization**: Protected via `auth` and requires roles containing `POST_PRESS` or `ADMIN`.

---

## 5. Additional Features (Not Yet Implemented)

### A. Rejection & Redo Workflow
- `POST /jobs/:jobId/reject-item` — Returns a post-press item to its incoming state if quality fails (e.g., lamination bubble, binding error).
- Resets `JobItem.activeStage` back to `lamination`/`binding`/`foil` as appropriate, clears the in-progress `JobItemWorkflowStep`, and logs a `JobEvent` with `actionType = 'REASSIGNED'` and a rejection reason.
- The item reappears in `GET /incoming` for the post-press operator to redo.

### B. Machine-Level Job Tracking
- Operators work on specific machines (e.g., Lamination Machine A, Binding Machine B).
- Add `machineId String?` to `JobTaskLog` records (new column) to record which machine processed each task.
- `GET /machines/utilization?from=&to=` — Groups task logs by `machineId` to show per-machine throughput and idle time.

### C. Material Usage Recording
- `POST /jobs/:jobId/materials` — Records material consumed per task (e.g., lamination film meters, binding wire spools).
- Requires a `PostPressMaterialLog` table: `{ id, jobId, itemId, task, material, quantity, unit, loggedById, loggedAt }`.

### D. Sub-Role Granularity (Foil, Fusing, Holes)
- Currently `POST_PRESS` covers all sub-tasks (lamination, binding, foil, fusing, holes).
- Add sub-roles similar to Finishing:
  - `POST_PRESS_LAMINATION` → only lamination tasks
  - `POST_PRESS_BINDING` → only binding tasks
  - `POST_PRESS_FOIL` → only foil tasks
  - `POST_PRESS_ID_CARD` → fusing, holes, and ID card tasks
- Gate `GET /jobs` to only show tasks the operator's sub-role covers.

### E. Batch Grouping by Spec Type
- `GET /jobs/grouped?taskType=lamination` — Returns all current lamination items grouped by variant (GLOSSY, MATTE, VELVET) so the operator can batch similar items in one machine run.
- Derived from `JobItem JOIN LaminationSpec WHERE activeStage = 'lamination'` using the `@@index([jobId, activeStage])`.

### F. Post-Press Operator Performance
- `GET /history?staffId=&from=&to=&task=` — Returns all completed post-press task logs for a specific operator, with average durations per task type.
- Sourced from `JobTaskLog WHERE module = 'post_press' AND staffId = :staffId`.

### G. Foil Sub-Type Tracking
- `FoilSpec.variant` currently stores a free-text variant.
- Standardize to an enum: `GOLD | SILVER | HOLOGRAPHIC | CUSTOM` to enable grouping and reporting by foil type.
