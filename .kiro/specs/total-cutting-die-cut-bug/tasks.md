# Implementation Plan

## Overview

Exploratory bugfix for the "Total Cutting" column incorrectly appearing in the Admin Reports drill-down for non-cutting finishing workers. Two files change: `routes/reports.js` (expose `roles` in the aggregation projection) and `AdminReports.tsx` (derive `isCuttingWorker` from staff roles and replace the 3 broad `selectedRole === 'FINISHING'` guards).

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1"] },
    { "wave": 3, "tasks": ["3.2"] },
    { "wave": 4, "tasks": ["3.3"] },
    { "wave": 5, "tasks": ["3.4"] },
    { "wave": 6, "tasks": ["3.5", "3.6"] },
    { "wave": 7, "tasks": ["4"] }
  ]
}
```

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Total Cutting Column Shown for Non-Cutting Worker
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the "Total Cutting" column renders for non-cutting finishing workers
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases — staff whose `roles` includes one of `FINISHING_DIE_CUTTING`, `FINISHING_CREASING`, `FINISHING_CORNER_CUT` (i.e. `isBugCondition(X)` is true)
  - Render the `AdminReports` drill-down table with a mocked `staffData` entry whose `roles` array is `['FINISHING_DIE_CUTTING']` (or `FINISHING_CREASING` / `FINISHING_CORNER_CUT`) and `selectedRole = 'FINISHING'`
  - Assert that the "Total Cutting" `<th>` / `<td>` is NOT present in the rendered output
  - Run test on UNFIXED code — expect FAILURE (the column will appear, proving the bug)
  - **EXPECTED OUTCOME**: Test FAILS (confirms the bug — `selectedRole === 'FINISHING'` always renders the column)
  - Document counterexample: e.g. "Staff with roles=['FINISHING_DIE_CUTTING'] → 'Total Cutting' column is visible but should be hidden"
  - Mark task complete when test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.2_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Cutting Column and Non-FINISHING Drill-Downs Unchanged
  - **IMPORTANT**: Follow observation-first methodology — run unfixed code with non-buggy inputs first, then codify the observed outputs
  - **Scoped PBT Approach**: Cover two distinct non-buggy input groups:
    - Group A — `FINISHING_CUTTING` workers: `roles` includes `'FINISHING_CUTTING'`, `selectedRole = 'FINISHING'`
    - Group B — Non-FINISHING workers: `selectedRole` ∈ `{ 'PRESS', 'POST_PRESS', 'PREPRESS', 'DISPATCH', 'CASHIER' }`
  - **Observe on unfixed code:**
    - Group A: `FINISHING_CUTTING` staff → "Total Cutting" column IS visible, `totalCutting = sum(cuttingValue) + sum(cutting2Value)` for items where cutting ≠ 'NONE'
    - Group B: any non-FINISHING role → "Total Cutting" column is NOT present; Job ID / Customer / Status / Date columns are always rendered
  - Write property-based tests asserting:
    1. For all staff selections with `roles.includes('FINISHING_CUTTING')`, the "Total Cutting" column is visible
    2. For all non-FINISHING `selectedRole` values, the "Total Cutting" column is never visible
    3. Job ID, Customer, Status, and Date columns are always rendered regardless of role
  - Run tests on UNFIXED code — all must PASS (confirms baseline behavior to preserve)
  - **EXPECTED OUTCOME**: Tests PASS (confirms the baseline is correct for these inputs)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.5_

- [ ] 3. Fix for Total Cutting column shown for non-cutting finishing workers

  - [ ] 3.1 Add `roles: 1` to `$project` in staff-productivity aggregation (`routes/reports.js`)
    - Locate the `$project` stage inside the `staff` facet of the `User.aggregate(...)` call in the `/staff-productivity` route
    - Add `roles: 1` alongside `name`, `lastLoginAt`, `isActive`, `jobCount`, `isTargetRole`
    - This exposes each staff member's roles array to the frontend without any other changes to the endpoint
    - _Bug_Condition: isBugCondition(X) where X.staffSubRole ∈ { 'FINISHING_DIE_CUTTING', 'FINISHING_CREASING', 'FINISHING_CORNER_CUT', 'FINISHING' }_
    - _Expected_Behavior: staffData entries in the API response now include a `roles: string[]` field_
    - _Preservation: `/staff-jobs` endpoint and all other projections remain unchanged (Requirement 3.6)_
    - _Requirements: 2.3, 3.6_

  - [ ] 3.2 Add `roles: string[]` to the `StaffStats` TypeScript type (`AdminReports.tsx`)
    - In the `StaffStats` type definition, add `roles: string[]`
    - This aligns the frontend type with the new backend projection
    - _Requirements: 2.3_

  - [ ] 3.3 Derive `isCuttingWorker` from the selected staff member's roles (`AdminReports.tsx`)
    - Inside the `{selectedStaff && (...)}` drill-down block, before the modal JSX, add:
      ```typescript
      const selectedStaffData = staffData.find(s => s._id === selectedStaff._id)
      const isCuttingWorker = selectedStaffData?.roles?.includes('FINISHING_CUTTING') ?? false
      ```
    - This derives the boolean using the actual staff sub-role, not the broad filter
    - _Bug_Condition: isBugCondition(X) — `selectedRole === 'FINISHING'` was the only guard, never checked individual roles_
    - _Expected_Behavior: isCuttingWorker is true ONLY when roles includes 'FINISHING_CUTTING'_
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.4 Replace the 3 occurrences of `selectedRole === 'FINISHING'` with `isCuttingWorker` (`AdminReports.tsx`)
    - Replace the `<th>` guard: `{selectedRole === 'FINISHING' && <th>Total Cutting</th>}` → `{isCuttingWorker && <th>Total Cutting</th>}`
    - Replace the `<td>` guard in the row-rendering loop (same pattern)
    - Replace the `totalCutting` calculation guard: `if (selectedRole === 'FINISHING' && job.items ...)` → `if (isCuttingWorker && job.items ...)`
    - _Preservation: FINISHING_CUTTING workers see column unchanged; all other roles unaffected (Requirements 3.1, 3.2, 3.3)_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.5_

  - [ ] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Total Cutting Column Hidden for Non-Cutting Workers
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (column must NOT appear for non-cutting workers)
    - When this test passes it confirms `isCuttingWorker = false` for die-cut / creasing / corner-cut workers
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [ ] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Cutting Column and Non-FINISHING Drill-Downs Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — cutting workers and all other roles unaffected)
    - Confirm `FINISHING_CUTTING` worker column still renders with correct `cuttingValue + cutting2Value` totals
    - Confirm non-FINISHING roles show no cutting column
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [ ] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite and confirm every test introduced in tasks 1 and 2 passes
  - Manually verify in the browser: select a `FINISHING_DIE_CUTTING` worker (e.g. Krishna) → confirm "Total Cutting" column does NOT appear
  - Manually verify: select a `FINISHING_CUTTING` worker → confirm "Total Cutting" column IS present with correct sums
  - Manually verify: select any PRESS / POST_PRESS / PREPRESS worker → confirm drill-down is unchanged
  - Ensure all tests pass; ask the user if questions arise

## Notes

- Tasks 1 and 2 are standalone property-based tests that must be written and run **before** the fix is applied.
- Task 1 is expected to **fail** on unfixed code — that failure is the proof the bug exists.
- Task 2 is expected to **pass** on unfixed code — those tests capture the baseline behavior to preserve.
- The implementation (task 3) is intentionally small: 1 backend line + 4 frontend changes across 2 files.
- No new API endpoints or data models are introduced.
