# Bugfix Requirements Document

## Introduction

In the Admin Reports screen, the **"Total Cutting"** column is shown in the staff job drill-down table for all workers whose selected role filter is `FINISHING`. Because `FINISHING_DIE_CUTTING`, `FINISHING_CREASING`, and `FINISHING_CORNER_CUT` are all sub-roles under the broad `FINISHING` category, the column incorrectly appears for workers like Krishna (a die cutting worker) who never perform cutting tasks. The fix is frontend-only: hide the "Total Cutting" column for any staff member whose actual sub-role is not `FINISHING_CUTTING`.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a staff member with the `FINISHING_DIE_CUTTING` sub-role is selected in the Admin Reports drill-down THEN the system shows the "Total Cutting" column (because `selectedRole === 'FINISHING'` is true for all finishing sub-roles).

1.2 WHEN the "Total Cutting" column is rendered for a `FINISHING_DIE_CUTTING` worker THEN the system attempts to sum `cuttingValue` and `cutting2Value` across job items, which always returns `--` or `0` because die cutting workers process only `dieCutting` tasks, not `cutting` tasks.

1.3 WHEN a `FINISHING_CREASING` or `FINISHING_CORNER_CUT` worker is selected THEN the system shows the "Total Cutting" column even though those workers also do not perform cutting tasks.

### Expected Behavior (Correct)

2.1 WHEN a staff member with the `FINISHING_CUTTING` sub-role is selected in the Admin Reports drill-down THEN the system SHALL show the "Total Cutting" column and correctly sum `cuttingValue + cutting2Value` across all job items for that worker.

2.2 WHEN a staff member with the `FINISHING_DIE_CUTTING`, `FINISHING_CREASING`, `FINISHING_CORNER_CUT`, or general `FINISHING` sub-role is selected THEN the system SHALL NOT show the "Total Cutting" column.

2.3 WHEN the staff productivity API response includes the selected staff member's `roles` array THEN the frontend SHALL use that roles array to determine the staff member's actual sub-role and conditionally render the "Total Cutting" column.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a `FINISHING_CUTTING` worker is selected and has jobs with cutting tasks THEN the system SHALL CONTINUE TO calculate and display the Total Cutting sum correctly using `cuttingValue + cutting2Value`.

3.2 WHEN a `PRESS` or `POST_PRESS` worker is selected THEN the system SHALL CONTINUE TO display the drill-down table without any cutting-specific columns.

3.3 WHEN a `PREPRESS`, `DISPATCH`, or `CASHIER` worker is selected THEN the system SHALL CONTINUE TO display the drill-down table without any cutting-specific columns.

3.4 WHEN the Admin Reports page loads and displays the team performance table THEN the system SHALL CONTINUE TO list all finishing sub-role staff (including `FINISHING_DIE_CUTTING` workers like Krishna) correctly with their job counts.

3.5 WHEN any staff member's drill-down modal is opened THEN the system SHALL CONTINUE TO display Job ID, Customer, Status, and Date columns regardless of the worker's role.

3.6 WHEN the backend `/staff-jobs` endpoint is called THEN the system SHALL CONTINUE TO project `items.cutting`, `items.cuttingValue`, `items.cutting2`, and `items.cutting2Value` for all `FINISHING` role queries unchanged.

---

## Bug Condition Derivation

**Bug Condition Function:**
```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type StaffSelection { staffSubRole: string }
  OUTPUT: boolean

  // Bug triggers when the selected staff member is NOT a cutting worker
  // but the Total Cutting column is still shown
  RETURN staffSubRole IN { 'FINISHING_DIE_CUTTING', 'FINISHING_CREASING', 'FINISHING_CORNER_CUT', 'FINISHING' }
END FUNCTION
```

**Property — Fix Checking:**
```pascal
// For all non-cutting workers, Total Cutting column must NOT appear
FOR ALL X WHERE isBugCondition(X) DO
  result ← renderDrillDownTable'(X)
  ASSERT columnVisible(result, 'Total Cutting') = false
END FOR
```

**Preservation Goal:**
```pascal
// For FINISHING_CUTTING workers, behavior is unchanged
FOR ALL X WHERE X.staffSubRole = 'FINISHING_CUTTING' DO
  ASSERT renderDrillDownTable(X) = renderDrillDownTable'(X)
END FOR
```
