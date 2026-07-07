

Skip to content
Using Gmail with screen readers
Enable desktop notifications for Gmail.
   OK  No thanks
Conversations
0% of 5,120 GB used
Terms · Privacy · Program Policies
Last account activity: 7 hours ago
Details
Gemini
Find information
What can Gemini do in Gmail
Gemini in Workspace can make mistakes. Learn more
# Changes Summary

## 1. Screenshot / Thumbnail — Wrong Item Image Shown on Cards

**Problem:** In multi-item jobs, dashboard cards showed the screenshot of the first item in the array regardless of which item was relevant to that dashboard's stage. For example, in Post Press, a card showed Item 1's image even though only Item 2 had a post-press task.

**Root cause:** `firstItemScreenshot()` in `WorkflowJobDetailsModal.tsx` used `Array.find(i => i.screenshot)` — no stage filter, just the first item with any screenshot.

**Fix:** Added an optional `prefer` predicate parameter to `firstItemScreenshot`. Each dashboard now passes a predicate that matches only items at the relevant workflow stage.

### Files Changed

| File | Change |
|---|---|
| `printing-press-frontend/src/components/WorkflowJobDetailsModal.tsx` | Added optional `prefer?: (i: any) => boolean` param to `firstItemScreenshot` (line 1034) |
| `printing-press-frontend/src/modules/press/PressDashboard.tsx` | Line 248: prefer items where `activeStage === 'press'` |
| `workflow-modules/press/PressDashboard.tsx` | Line 252: same — prefer items where `activeStage === 'press'` |
| `printing-press-frontend/src/modules/postpress/PostPressDashboard.tsx` | Lines 324, 436, 579, 678, 768: prefer items where `activeStage` is a post-press stage (lamination, foil, binding, fusing, holes) |
| `printing-press-frontend/src/modules/finishing/FinishingDashboard.tsx` | Lines 589, 673, 782, 877, 962: prefer items where `activeStage` is a finishing stage (cutting, creasing, dieCutting, cornerCutting, cutting2) |

### Behaviour

- Card thumbnail now shows the screenshot of the item **actually pending at that stage**, not just the first item in the array.
- Falls back to the first item with any screenshot if no item at the relevant stage has a screenshot (single-item jobs, history view).
- Modal (inside the card) was already correct — it reads `item.screenshot` directly per item. No modal changes needed.

---

## 2. Finishing Dashboard — Default Tab Changed to Active

**Problem:** When a user opened the Finishing module, it always landed on the **Incoming** tab instead of the active jobs queue.

**Fix:** Changed the initial state of `mainView` from `'incoming'` to `'active'`.

### File Changed

| File | Line | Change |
|---|---|---|
| `printing-press-frontend/src/modules/finishing/FinishingDashboard.tsx` | 243 | `useState<'incoming' \| 'active'>('incoming')` → `useState<'incoming' \| 'active'>('active')` |

---

## 3. Dispatch Dashboard — Image Column Added

**Problem:** The Dispatch table had no image column. Staff had no visual reference to identify jobs at a glance, unlike the Press, Post Press, and Finishing dashboards.

**Fix:** Added a 56×56px image thumbnail column to the dispatch table. Clicking the thumbnail opens a full-screen lightbox to preview the image. Clicking elsewhere on the row still opens the dispatch modal as before.

### Files Changed

| File | Changes |
|---|---|
| `printing-press-frontend/src/modules/despatch/DispatchDashboard.tsx` | 1. Added `firstItemScreenshot`, `jobThumbnailUrl` to import from `WorkflowJobDetailsModal` |
| | 2. Added `const [lightboxImg, setLightboxImg] = useState<string \| null>(null)` to component state |
| | 3. Added `<th style={{ width: '72px' }}>Image</th>` column header in `<thead>` |
| | 4. Added image `<td>` cell in each job row — shows 56×56 thumbnail, click opens lightbox |
| | 5. Updated empty-state `colSpan` from 8 to 9 |
| | 6. Added full-screen lightbox overlay before closing `</div>` |

### Behaviour

- Image column appears between S.No and Job ID.
- Thumbnail is `56×56px`, uses the existing `press-item-preview-box` / `press-item-preview-img` CSS classes.
- Shows `--` placeholder if no screenshot exists.
- Clicking the image opens a full-screen lightbox (dark overlay, close on click outside or × button).
- Clicking the image cell does **not** open the dispatch modal — `e.stopPropagation()` isolates the click.
- Clicking anywhere else on the row still opens the dispatch modal as before.

---

## 4. Dispatch Dashboard — Pack & Handover/Dispatch Validation Restrictions

**Problem:** In the Dispatch module, users were previously able to organize, pack, and handover/dispatch parcels containing items that had not yet completed their workflow stages (e.g., Press, Post Press, or Finishing tasks were still pending). This caused queue mismatches and data inconsistency.

**Fix:** Added validation constraints both on the frontend and backend to block packing, walk-in handovers, and dispatches for any items whose `activeStage` is not `'done'`.

### Files Changed

| File | Change |
|---|---|
| `printing-press-frontend/src/modules/despatch/DispatchDashboard.tsx` | 1. **Individual Pack Button**: Disabled if `item.activeStage !== 'done'`, with tooltip indicating pending tasks.<br>2. **Bulk Pack Button**: Disabled if any item in the parcel has `activeStage !== 'done'`, with tooltip.<br>3. **Walk-in Hand Over Button**: Disabled if any item has pending tasks. |
| `routes/dispatch.js` | 1. **Pack Endpoint (`PATCH /jobs/:jobId/parcels/:parcelNo/pack`)**: Returns `400 Bad Request` if any target items have `activeStage !== 'done'`. Works for both array-based packs and legacy single rack assignment.<br>2. **Dispatch Endpoint (`PATCH /jobs/:jobId/parcels/:parcelNo/dispatch`)**: Checks if all items in the parcel have completed their tasks, returning a `400` block if not.<br>3. **Individual Item Dispatch Endpoint (`PATCH /jobs/:jobId/items/:itemIndex/dispatch`)**: Validates that the specific item's `activeStage === 'done'` and blocks dispatch if unfinished. |

---

## 5. Dynamic Lamination Types Display in Details Modal

**Problem:** When a job had multiple lamination types selected (e.g., Gloss and Matte), the workflow details modal only displayed the first one in its key-value list.

**Fix:** Updated both the frontend and shared details modals to dynamically loop over the `item.laminationTypes` array when in the `'lamination'` stage, showing each lamination type, its quantity, and side.

### Files Changed

| File | Change |
|---|---|
| `printing-press-frontend/src/components/WorkflowJobDetailsModal.tsx` | Dynamically iterates `item.laminationTypes` inside both `buildStepDetails` (lines 106–111) and the card's details table (lines 752–759) instead of hardcoding single lamination values. |
| `workflow-modules/shared/components/WorkflowJobDetailsModal.tsx` | Mirrors the identical lamination loops for `buildStepDetails` and item details mapping to ensure consistent UI across all role-specific sub-dashboards. |

---

## 6. Clickable Task Steps in Workflow Status Tracker

**Problem:** The workflow status tracker (showing Press → Cutting → Dispatch, etc.) was static and passive. Users could not easily inspect the details of past or future stages for an item.

**Fix:** Converted the status step circle elements into clickable `<button>` components. Clicking a step highlights it with a blue visual indicator and expands a dedicated, styled details panel directly below the tracker.

### Files Changed

| File | Change |
|---|---|
| `printing-press-frontend/src/components/WorkflowJobDetailsModal.tsx` | 1. Converted `div.workflow-status-step` to `<button type="button">`. Added selection state (`selectedStep`).<br>2. Added `boxShadow` indicator and scale transition on step marker selection.<br>3. Implemented a collapsible `StepDetailPanel` showing step metadata (staff, status, timing, etc.) and item values. |
| `workflow-modules/shared/components/WorkflowJobDetailsModal.tsx` | Implemented matching interactive steps and the collapsible detail panel in the shared modal. |

---

## 7. Syntax and React Element Nesting Fix in Shared Modal

**Problem:** A duplicated nested wrapper div caused syntax issues and tag mismatches in the shared details modal rendering.

**Fix:** Removed the duplicate `<div className="workflow-tracker-diagram-row">` at lines 664-666 in `workflow-modules/shared/components/WorkflowJobDetailsModal.tsx`.

---

## 8. Preserve Post-Press State on Prepress Job Edit

**Problem:** In prepress, when editing a job card to add or modify a post-press process (like creasing), it reset previously completed post-press tasks (like lamination) back to pending.

**Fix:**
- Backend: Updated the `PATCH /jobs/:jobId` handler to lookup existing items in the database by their ID and merge their progress states. Stripped parenthesis suffixes (e.g. `(SINGLE SIDE)`) in `normalizePostPressChoice` to match frontend format strings.
- Frontend: Updated the `onSaved` handler of `JobCardModal` in `CreateJob.tsx` to check and preserve existing item statuses for unchanged specification fields.
- Utility: Updated `pickLamination` to format lamination type with the side suffix (e.g. `GLOSS (SINGLE SIDE)`), aligning with the frontend.

### Files Changed

| File | Change |
|---|---|
| `workflow-modules/prepress/prepress.js` | Updated `normalizePostPressChoice` to strip parenthesis suffixes, and updated the `PATCH /jobs/:jobId` handler to merge original statuses for unchanged specifications. |
| `printing-press-frontend/src/modules/prepress/CreateJob.tsx` | Updated `onSaved` callback of the `JobCardModal` to check and preserve existing item statuses for unchanged specifications. |
| `utils/jobCardToPostPress.js` | Updated `pickLamination` to return suffix-embedded lamination strings matching the frontend format. |
| `workflow-modules/shared/backend/utils/jobCardToPostPress.js` | Updated `pickLamination` to match format. |

---

## 9. Partial Dispatch Job Visibility in Workflow Queues

**Problem:** In multi-item jobs where some items were dispatched and others were pending press/cutting (e.g. Job `84-220626`), dispatching the first parcel set the overall job status to `DISPATCHED` (since the pre-save hook evaluated `allDispatched` to true because all existing parcels were dispatched). This excluded the job from press, post-press, and finishing active queues, leaving the remaining items stuck. Additionally, `computeItemActiveStage` incorrectly considered press complete for undispatched items if `jobStatus === 'DISPATCHED'`.

**Fix:**
- Model: Updated the pre-save hook of the `Job` model to track dispatch status at the item level. A job is marked `DISPATCHED` only if all items in the job are actually dispatched; otherwise, it is set to `PARTIAL_DISPATCH`.
- Stage Logic: Updated `computeItemActiveStage` in `jobWorkflow.js` to exclude `PARTIAL_DISPATCH` from forcing press completion, ensuring undispatched items stay at `press` if not print-confirmed.
- Queues: Updated `getPressJobs`, `getPostPressJobs`, and `getFinishingJobs` in `jobWorkflow.js` to allow `PARTIAL_DISPATCH` jobs so they remain visible in queues as long as they have pending items at those stages.

### Files Changed

| File | Change |
|---|---|
| `models/Job.js` | Updated pre-save status hook to calculate dispatch status on a per-item basis. |
| `workflow-modules/shared/backend/services/jobWorkflow.js` | 1. Excluded `PARTIAL_DISPATCH` from forcing `pressComplete` in `computeItemActiveStage`. <br>2. Allowed `PARTIAL_DISPATCH` in `getPressJobs`, `getPostPressJobs`, and `getFinishingJobs` status filters. |

---

## 10. Admin Override of Press & Dispatch Status

**Problem:** Operator errors could lead to accidentally marking a Press or Dispatch step as completed. Previously, correcting this required manual database interventions, which compromised user productivity metrics and disrupted tracking.

**Fix:**
- Added custom administrative PATCH endpoints on the backend to safely override and revert specific job items' Press and Dispatch statuses.
- Reverting the Press status back to `PENDING` deletes corresponding operator logs from `taskLog` to keep productivity metrics clean.
- Reverting the Dispatch status back to `PENDING` resets overall job dispatch properties (`dispatchedAt`, `dispatchedBy`), deletes dispatch logs, and resets parcel and item statuses back to `PACKED`.
- Added a styled `"Modify Status"` dropdown inside the workflow details modal's details panel (visible only to authenticated `ADMIN` users when inspecting the Press or Dispatch steps).
- When changes are submitted, the modal state is synchronized immediately and the background queues refresh.

### Files Changed

| File | Change |
|---|---|
| `routes/admin.js` | Added override endpoints: `PATCH /api/admin/jobs/:jobId/status` and `PATCH /api/admin/jobs/:jobId/items/:itemIndex/steps` with safety guards and log reversion logic. |
| `printing-press-frontend/src/components/WorkflowJobDetailsModal.tsx` | Integrated `"Modify Status"` selection dropdown for Press and Dispatch steps. Handled calling the API and updating state. |
| `printing-press-frontend/src/modules/admin/AdminDashboard.tsx` | Passed `onRefresh` callback to reload the dashboard state on overrides. |

---

## 11. Creasing, Perforation & Wheel Perforation Parsing Fix

**Problem:** Selecting **Wheel Perforation** or **Perforation** (either alone or with **Creasing**) on the job card did not result in records being appended to the item in dashboard views. They defaulted to `NONE`, causing the item to skip post-press/finishing stages entirely.

**Fix:**
- Updated the frontend utility mapping helper to check checkbox states and map them to correct Mongoose schema stage engine codes: `'CREASE_PERF'`, `'CREASE'`, `'WHEEL_PERF'`, or `'PERFORATION'`.
- Kept the shared modular frontend utility aligned.
- Ran a backfill repair script to synchronize and fix existing incorrect jobs in the database.

### Files Changed

| File | Change |
|---|---|
| `printing-press-frontend/src/utils/jobCardToPostPress.ts` | Updated `pickCreasing` mapping logic to return proper schema codes based on checkbox states. |
| `workflow-modules/shared/utils/jobCardToPostPress.ts` | Aligned `pickCreasing` logic to match the frontend utility implementation. |

---

## 12. Finishing History — Unpaginated Total Cutting Count Display

**Problem:** In the Finishing module history tab, operators/admins could see jobs completed, but the overall cutting count summary banner was calculated only from the current page's paginated results. There was no unpaginated sum showing their true productivity count across all pages.

**Fix:**
- **Backend:** Updated `getFinishingJobs` in `jobWorkflow.js` to run a matching query for all unpaginated jobs for that date/search criteria, filter items where cutting/cutting2 was completed by the specific operator (or overall if viewed as admin), and sum up `cuttingValue` + `cutting2Value` into a returned `totalCutting` number.
- **Frontend:** Rendered a styled `"Total Cutting Today"` (for admins) or `"Your Total Cutting Today"` (for operators) summary banner at the top of the history tab in `FinishingDashboard.tsx`. Added a `"Cutting Total"` column to the table displaying the specific cuts contributed by the staff for each job.

### Files Changed

| File | Change |
|---|---|
| `workflow-modules/shared/backend/services/jobWorkflow.js` | Updated `getFinishingJobs` to aggregate completed cutting values unpaginated and return `totalCutting`. |
| `printing-press-frontend/src/modules/finishing/FinishingDashboard.tsx` | Displayed total cutting summary card and individual cutting counts in the history table. |

---

## 13. Lamination Roll Stock Management (Lam Stack)

**Problem:** Previously, lamination rolls were not tracked in the system. Post-press operators starting or completing a lamination task did not assign a specific physical roll, preventing the administration from auditing roll usage, tracking remaining roll stock, or reviewing lamination yield per roll.

**Fix:**
- Implemented a complete lamination product roll tracking and stock management system.
- Added administrative roll creation, soft-delete, and status toggle capabilities under a new **Lam Stock** tab on the Admin Dashboard.
- Enforced roll selection during the operator's lamination workflow before a task can be marked as complete, with automated filtering based on the expected lamination type.
- Developed a comprehensive roll usage report allowing administrators to filter and review roll usage details by Date Range, Roll Type, specific Roll Code, and Single/Double Side (SS/DS), along with sheet totals.

### Files Changed

| File | Change |
|---|---|
| `models/LaminationProduct.js` | **[NEW]** Created schema to store lamination products/rolls tracking codes, roll type (GLOSS, MATT, VELVET, OTHER), size/type, counts, availability, and soft-delete states. |
| `models/Job.js` | Added `laminationProduct` field to the job items sub-document schema. |
| `routes/admin.js` | Added admin endpoints for roll CRUD: GET, POST (generating codes like `G1210626`), PATCH availability, DELETE (soft-delete), and GET usage report (aggregates single/double side details by joining `JobCard` records). |
| `workflow-modules/postpress/post-press.js` | Added operator routes to fetch available rolls (`GET /lamination-products/available`) and record task starts (`PATCH /jobs/:jobId/task-start`). |
| `printing-press-frontend/src/services/api.ts` | Added API endpoints for lamination products stock and reports operations. |
| `printing-press-frontend/src/modules/admin/LaminationStockManager.tsx` | **[NEW]** Created admin component containing a roll addition form, active roll table with availability toggle switches, and a usage report interface. |
| `printing-press-frontend/src/modules/admin/AdminDashboard.tsx` | Registered the new `stock` tab and integrated the `<LaminationStockManager />` panel. |
| `printing-press-frontend/src/components/WorkflowJobDetailsModal.tsx` | Integrated a roll selection dropdown for lamination-stage tasks that: <br>1. Filters rolls matching the item's lamination type (with a mapping helper for `MATTE` -> `MATT` naming).<br>2. Displays expected type badges next to the selector.<br>3. Provides a "Show all types" override toggle.<br>4. Falls back to show all rolls with a warning if no matching type is available.<br>5. Disables the complete button until a roll is chosen. |

### Behaviour

- **Roll Code Generation:** Automatically generates serials (e.g. `G1210626` where `G` = Gloss, `12` = size, `1` = count, `06` = month, `26` = year).
- **Lamination Flow Restriction:** The "Complete" button is disabled and replaced with a selector validation prompt if the task is lamination and no roll has been selected.
- **Auto-Filtering:** Operators only see rolls of the matching type (Gloss items show Gloss rolls) by default, preventing human error during selection.
- **Reporting & Auditing:** The admin report dynamically calculates total sheets used per roll or roll type when filtering, showing color-coded pills for each roll code, alongside a total sheets count footer in the grid.