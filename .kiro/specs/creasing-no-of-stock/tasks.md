# Implementation Plan: Creasing — No. of Stock Field (Type-Cast Cleanup)

## Overview

The `noOfStock` field is now present in both the MongoDB schema (`models/JobCard.js`) and the TypeScript interface + initial state (`useJobCardForm.ts`). The only remaining work is removing three `as any` type-cast workarounds in `CreasingSection` inside `JobCardSections.tsx` that were added before the type was properly defined.

No backend, state-shape, or database changes are required — everything is already wired up correctly.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "description": "Single self-contained cleanup: remove all as-any casts for noOfStock in CreasingSection."
    }
  ]
}
```

## Tasks

- [x] 1. Remove `as any` casts from noOfStock references in CreasingSection
  - **File**: `printing-press-frontend/src/components/JobCardSections.tsx`
  - In the `section-identifiers` block, replace the conditional render:
    ```tsx
    // BEFORE
    {(formData.creasingPerforation as any).noOfStock && (
        <span className="identifier-field only-print">STOCK: {(formData.creasingPerforation as any).noOfStock}</span>
    )}

    // AFTER
    {formData.creasingPerforation.noOfStock && (
        <span className="identifier-field only-print">STOCK: {formData.creasingPerforation.noOfStock}</span>
    )}
    ```
  - In the "NO OF STOCK" input row, replace the value prop:
    ```tsx
    // BEFORE
    value={(formData.creasingPerforation as any).noOfStock || ''}

    // AFTER
    value={formData.creasingPerforation.noOfStock}
    ```
    (The `|| ''` fallback is safe to drop because `noOfStock` is now initialised as `''` in the state and will never be `undefined`.)
  - Verify the `onChange` handler — `creasingPerforation: { ...prev.creasingPerforation, noOfStock: e.target.value }` — requires no cast change since TypeScript now resolves the property correctly via the updated interface.
  - Run `tsc --noEmit` (or the frontend type-check command) to confirm zero type errors remain in `JobCardSections.tsx` related to `noOfStock`.
  - _Requirements: B1 (type safety), B2 (state sync), B4 (cast removal)_

  **Acceptance Criteria:**
  - `JobCardSections.tsx` contains no `as any` casts anywhere in the `CreasingSection` component body.
  - The TypeScript compiler accepts `formData.creasingPerforation.noOfStock` without errors.
  - The "NO OF STOCK" input renders and updates correctly in the browser (controlled input, no uncontrolled-to-controlled warnings).
  - The `STOCK: {value}` span appears in the `section-identifiers` print area when `noOfStock` is non-empty and is absent when empty — identical behaviour to before, just without the cast.
  - The existing "SHEETS: {value}" identifier and all other `CreasingSection` behaviour are completely unchanged.

## Notes

- The DB schema change (`models/JobCard.js`) and TypeScript type change (`useJobCardForm.ts`) were completed in a prior step. Task 1 is purely a type-safety cleanup.
- The `noOfStock` field is typed as `string` (not `number`) — consistent with `noOfSheets` and all other quantity fields in the job card.
- MongoDB's schemaless nature means existing documents without a `noOfStock` field will return `undefined` for that path; the initial state default `''` handles this in `setFormData` via the existing shallow-merge pattern in `JobCard.tsx`.
