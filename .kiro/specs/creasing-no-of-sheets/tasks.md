# Implementation Plan: Creasing — No. of Sheets Field

## Overview

Three small, self-contained UI changes to `CreasingSection` in `JobCardSections.tsx`:

1. Unhide the existing NO OF SHEETS input row.
2. Add auto-focus behaviour (ref + useEffect) matching the pattern in `CornerCuttingSection` and `DieCuttingSection`.
3. Render the sheet count in the section-identifiers header area for print visibility.

No backend, state-shape, or database changes are required — `creasingPerforation.noOfSheets` already exists in state and is persisted to MongoDB.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "3"],
      "description": "Task 1 unhides the input row; Task 3 adds the print-area span — both are independent of each other."
    },
    {
      "wave": 2,
      "tasks": ["2"],
      "description": "Task 2 attaches the ref and auto-focus effect to the input made visible in Task 1."
    }
  ]
}
```

## Tasks

- [x] 1. Remove hidden style from No. of Sheets input row
  - In `CreasingSection`, remove `style={{ display: 'none' }}` from the `<div className="field-row no-print">` wrapper that wraps the NO OF SHEETS label and input
  - Change the div's `className` from `"field-row no-print"` to `"field-row no-print-row no-print"`, matching the pattern used in `CornerCuttingSection`
  - The `<input>` inside the row and its `onChange` handler remain unchanged
  - _Requirements: R1, R5_

  **Acceptance Criteria:**
  - The NO OF SHEETS input is visible in the browser (no `display: none` override)
  - The input row carries `no-print` and `no-print-row` classes so it is hidden when printing
  - No other markup in `CreasingSection` is altered by this task

- [x] 2. Add auto-focus ref and effect to CreasingSection
  - Declare `const noOfSheetsRef = React.useRef<HTMLInputElement>(null)` at the top of the `CreasingSection` function body (before the `return`)
  - Add a `React.useEffect` that fires on mount only (`[]` dependency array), schedules a 500 ms `setTimeout` that calls `noOfSheetsRef.current?.focus()` and `noOfSheetsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })`, and returns a `clearTimeout` cleanup — identical in structure to the effects in `CornerCuttingSection` and `DieCuttingSection`
  - Attach `ref={noOfSheetsRef}` to the existing `<input>` for `noOfSheets` (the one inside the row made visible in Task 1)
  - _Requirements: R3_

  **Acceptance Criteria:**
  - After the Creasing section mounts, the NO OF SHEETS input receives focus within ~500 ms without any click
  - The timer is cleaned up if the component unmounts before the 500 ms elapses (no stale-focus errors)
  - The `ref` is attached to the correct input (the `noOfSheets` text input, not the creasing/perforation grid inputs)

- [x] 3. Display noOfSheets value in section-identifiers header area
  - Inside the `section-identifiers` > `identifier-fields-stack` div, add a conditionally-rendered `<span>` immediately after the existing C.NAME span:
    ```tsx
    {formData.creasingPerforation.noOfSheets && (
        <span className="identifier-field only-print">SHEETS: {formData.creasingPerforation.noOfSheets}</span>
    )}
    ```
  - The span uses `only-print` so it is visible when printing but hidden on screen (consistent with how `noOfCards` is surfaced in `CornerCuttingSection`)
  - No changes to the JOB ID, JOB BY, or C.NAME spans; no changes to the QR div
  - _Requirements: R2, R5_

  **Acceptance Criteria:**
  - When `formData.creasingPerforation.noOfSheets` is non-empty, a `SHEETS: {value}` span appears in the `identifier-fields-stack`
  - When `formData.creasingPerforation.noOfSheets` is empty or falsy, the span is not rendered (no blank "SHEETS:" label)
  - The span carries `only-print` and is therefore not visible during normal screen use
  - The printed job card includes the sheet count in the Creasing section header area

## Notes

- All three tasks touch only `CreasingSection` in `printing-press-frontend/src/components/JobCardSections.tsx`.
- The auto-focus pattern (Task 2) is a direct copy of the `CornerCuttingSection` and `DieCuttingSection` implementations already in the same file — match them exactly.
- R4 (state sync and backend persistence) is already satisfied by the existing `onChange` handler on the `noOfSheets` input; no new code is needed for it.
