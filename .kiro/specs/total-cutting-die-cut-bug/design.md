# Total Cutting Column Visibility Bugfix Design

## Overview

The "Total Cutting" column in the Admin Reports drill-down modal is conditionally rendered using
`selectedRole === 'FINISHING'`. Because `FINISHING_DIE_CUTTING`, `FINISHING_CREASING`, and
`FINISHING_CORNER_CUT` workers are all included under the `FINISHING` role filter, the column
incorrectly appears for workers who never perform cutting tasks.

The fix is **frontend-only** (with one minimal backend projection change to expose `roles`):
replace the `selectedRole === 'FINISHING'` gate with a check against the selected staff member's
actual `roles` array, only showing "Total Cutting" when the staff member has `FINISHING_CUTTING`
in their roles.

## Glossary

- **Bug_Condition (C)**: The selected staff member's actual sub-role is NOT `FINISHING_CUTTING`,
  yet the "Total Cutting" column is rendered because `selectedRole === 'FINISHING'` is broad.
- **Property (P)**: The desired behavior — "Total Cutting" column is visible if and only if the
  selected staff member has `FINISHING_CUTTING` in their `roles` array.
- **Preservation**: All other table columns (Job ID, Customer, Status, Date), all non-FINISHING
  role drill-downs, and the FINISHING_CUTTING worker's cutting column must remain unchanged.
- **selectedRole**: The role filter currently selected in the Admin Reports tab (e.g. `'FINISHING'`).
- **staffData**: The array returned by `GET /api/reports/staff-productivity`, containing one entry
  per staff member with `_id`, `name`, `lastLoginAt`, `jobCount` — and after the fix: `roles`.
- **selectedStaff**: The `{ _id, name }` object set when a row in the team performance table is clicked.
- **isCuttingWorker**: A derived boolean — `true` when the selected staff member's `roles` array
  includes `'FINISHING_CUTTING'`.

## Bug Details

### Bug Condition

The bug manifests when an admin clicks on a finishing worker whose sub-role is NOT
`FINISHING_CUTTING` (e.g. `FINISHING_DIE_CUTTING`, `FINISHING_CREASING`, `FINISHING_CORNER_CUT`).
The `renderDrillDownTable` logic in `AdminReports.tsx` evaluates `selectedRole === 'FINISHING'`
which is `true` for all finishing sub-role workers, causing the "Total Cutting" `<th>` and `<td>`
to render even when the worker has never performed a cutting task.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type StaffSelection {
    staffId: string,
    staffRoles: string[]   // actual roles array of the selected staff member
  }
  OUTPUT: boolean

  // Bug triggers when the column is shown for a non-cutting worker
  RETURN selectedRole = 'FINISHING'
         AND 'FINISHING_CUTTING' NOT IN staffRoles
END FUNCTION
```

### Examples

- **Krishna (FINISHING_DIE_CUTTING)** clicks drill-down → "Total Cutting" column appears, shows
  `--` for every job because die-cut workers have no `cutting`/`cutting2` items. **Bug.**
- **Priya (FINISHING_CREASING)** clicks drill-down → "Total Cutting" column appears with `--`.
  Creasing workers don't use `cuttingValue`. **Bug.**
- **Ravi (FINISHING_CUTTING)** clicks drill-down → "Total Cutting" column appears and correctly
  sums `cuttingValue + cutting2Value`. **Correct behavior — must be preserved.**
- **Press worker** clicks drill-down → no cutting column shown (`selectedRole !== 'FINISHING'`).
  **Correct — unaffected by fix.**

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Mouse clicks on staff rows to open the drill-down modal must continue to work exactly as before.
- The Job ID, Customer, Status, and Date columns must always render regardless of the worker's role.
- The team performance table (top-level listing all FINISHING sub-role workers with job counts)
  must continue to display all workers correctly.
- The `FINISHING_CUTTING` worker's "Total Cutting" column must continue to render and calculate
  `cuttingValue + cutting2Value` correctly.
- All non-FINISHING roles (PRESS, POST_PRESS, PREPRESS, DISPATCH, CASHIER) must display their
  drill-down tables with no cutting column, exactly as before.
- The backend `/staff-jobs` endpoint response and its cutting field projections must remain unchanged.

**Scope:**
All inputs that do NOT involve a non-cutting finishing worker being selected should be completely
unaffected by this fix. This includes:
- Selecting any PRESS or POST_PRESS worker
- Selecting any PREPRESS, DISPATCH, or CASHIER worker
- Selecting a FINISHING_CUTTING worker (behavior preserved identically)
- Any table interactions, filters, timeframe selections, or tab switches

## Hypothesized Root Cause

1. **Overly Broad Role Check**: The column visibility guard `selectedRole === 'FINISHING'` only
   checks the selected *filter role*, not the individual staff member's actual sub-role. Since
   all finishing sub-role workers are shown under the `FINISHING` filter, the check is always
   `true` for any finishing worker.

2. **Missing `roles` Projection in API Response**: The `GET /staff-productivity` aggregation's
   `$project` stage does not include the `roles` field, so the frontend has no way to inspect
   individual staff sub-roles without an extra request.

3. **No Per-Staff Role Derivation on Frontend**: `AdminReports.tsx` never derives whether the
   *selected individual* is a cutting worker — it only checks the broad role filter.

## Correctness Properties

Property 1: Bug Condition — Cutting Column Hidden for Non-Cutting Workers

_For any_ staff selection where the selected staff member's `roles` array does NOT include
`'FINISHING_CUTTING'`, the fixed `AdminReports` component SHALL NOT render the "Total Cutting"
`<th>` or `<td>` in the drill-down table, regardless of whether `selectedRole === 'FINISHING'`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Cutting Column Shown for Cutting Workers

_For any_ staff selection where the selected staff member's `roles` array DOES include
`'FINISHING_CUTTING'`, the fixed `AdminReports` component SHALL render the "Total Cutting"
column and produce exactly the same calculated totals as the original code for those workers.

**Validates: Requirements 3.1**

Property 3: Preservation — Non-FINISHING Workers Unaffected

_For any_ staff selection where `selectedRole` is NOT `'FINISHING'` (i.e. PRESS, POST_PRESS,
PREPRESS, DISPATCH, CASHIER workers), the fixed component SHALL produce exactly the same
drill-down table as the original component — no cutting column, unchanged columns.

**Validates: Requirements 3.2, 3.3, 3.5**

## Fix Implementation

### Changes Required

**File 1 (minimal backend — 1-line addition):** `routes/reports.js`

**Change**: Add `roles: 1` to the `$project` stage in the `staff-productivity` aggregation so
the frontend receives each staff member's `roles` array.

```javascript
// Before
$project: {
    name: 1,
    lastLoginAt: 1,
    isActive: { ... },
    jobCount: { ... },
    isTargetRole: { ... }
}

// After
$project: {
    name: 1,
    roles: 1,          // ← ADD THIS
    lastLoginAt: 1,
    isActive: { ... },
    jobCount: { ... },
    isTargetRole: { ... }
}
```

**File 2 (main fix):** `printing-press-frontend/src/modules/admin/AdminReports.tsx`

**Change 1 — Update `StaffStats` type** to include the `roles` field:

```typescript
type StaffStats = {
    _id: string
    name: string
    roles: string[]          // ← ADD THIS
    lastLoginAt: string | null
    jobCount: number
}
```

**Change 2 — Derive `isCuttingWorker`** inside the drill-down modal, looking up the selected
staff member from `staffData`:

```typescript
// Inside the {selectedStaff && (...)} block, before the modal JSX:
const selectedStaffData = staffData.find(s => s._id === selectedStaff._id)
const isCuttingWorker = selectedStaffData?.roles?.includes('FINISHING_CUTTING') ?? false
```

**Change 3 — Replace column gate** in both `<th>` and `<td>`:

```tsx
// Before
{selectedRole === 'FINISHING' && (
    <th ...>Total Cutting</th>
)}

// After
{isCuttingWorker && (
    <th ...>Total Cutting</th>
)}
```

```tsx
// Before (in row rendering)
{selectedRole === 'FINISHING' && (
    <td ...>...</td>
)}

// After
{isCuttingWorker && (
    <td ...>...</td>
)}
```

**Change 4 — Guard the totalCutting calculation** to only run when `isCuttingWorker` is true:

```typescript
// Before
if (selectedRole === 'FINISHING' && job.items && job.items.length > 0) { ... }

// After
if (isCuttingWorker && job.items && job.items.length > 0) { ... }
```

## Testing Strategy

### Validation Approach

Two-phase approach: first verify the column incorrectly appears on unfixed code for non-cutting
workers (exploratory), then verify the fix hides it correctly while preserving the cutting
worker's column.

### Exploratory Bug Condition Checking

**Goal**: Surface the bug by selecting a `FINISHING_DIE_CUTTING` worker (e.g. Krishna) and
observing the "Total Cutting" column appears with all `--` values.

**Test Plan**: Open Admin Reports → select FINISHING filter → click Krishna's row → confirm
"Total Cutting" column is visible and shows `--` for all jobs. This demonstrates the bug.

**Test Cases**:
1. **Die-Cut Worker Test**: Select a `FINISHING_DIE_CUTTING` worker → drill-down shows "Total
   Cutting" column with all `--` (will demonstrate bug on unfixed code)
2. **Creasing Worker Test**: Select a `FINISHING_CREASING` worker → drill-down shows "Total
   Cutting" column with all `--` (will demonstrate bug on unfixed code)
3. **Corner-Cut Worker Test**: Select a `FINISHING_CORNER_CUT` worker → same issue
4. **Cutting Worker Test**: Select a `FINISHING_CUTTING` worker → column shows numeric values
   (this is currently correct and must remain so after the fix)

**Expected Counterexamples**:
- The "Total Cutting" column appears for non-cutting workers
- All values in the column are `--` because those workers have no `cutting`/`cutting2` items

### Fix Checking

**Goal**: After the fix, verify non-cutting workers do NOT see the column.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO  // non-cutting finishing workers
  result := renderDrillDownTable_fixed(X)
  ASSERT columnVisible(result, 'Total Cutting') = false
END FOR
```

### Preservation Checking

**Goal**: Verify the FINISHING_CUTTING worker's column is unchanged, and all other roles'
drill-downs are unaffected.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO  // cutting workers + non-finishing workers
  ASSERT renderDrillDownTable_original(X) = renderDrillDownTable_fixed(X)
END FOR
```

**Test Plan**: After fix, verify:
1. FINISHING_CUTTING worker → column still appears with correct sums
2. PRESS worker → drill-down has no cutting column (unchanged)
3. PREPRESS worker → drill-down has no cutting column (unchanged)

### Unit Tests

- Test that `isCuttingWorker` is `false` when staff roles include `FINISHING_DIE_CUTTING`
- Test that `isCuttingWorker` is `true` when staff roles include `FINISHING_CUTTING`
- Test that `isCuttingWorker` is `false` when staff roles array is empty or undefined
- Test column rendering — `<th>Total Cutting</th>` absent when `isCuttingWorker = false`
- Test column rendering — `<th>Total Cutting</th>` present when `isCuttingWorker = true`

### Property-Based Tests

- Generate random finishing worker role configurations and verify the column is shown if and
  only if `FINISHING_CUTTING` is in the `roles` array
- Generate random job lists for a FINISHING_CUTTING worker and verify `totalCutting` calculation
  matches `sum(cuttingValue) + sum(cutting2Value)` for items where `cutting !== 'NONE'`
- Generate random non-FINISHING role selections and verify no cutting column ever appears

### Integration Tests

- Full flow: Admin Reports → FINISHING filter → select Krishna (die-cut) → no "Total Cutting"
  column in drill-down
- Full flow: Admin Reports → FINISHING filter → select cutting worker → "Total Cutting" column
  present with correct values
- Full flow: Admin Reports → PRESS filter → select any press worker → no "Total Cutting" column
- Verify team performance table still lists all finishing workers with correct job counts after fix
