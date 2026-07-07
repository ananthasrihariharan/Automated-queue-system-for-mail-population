# Creasing noOfStock Bugfix Design

## Overview

The `noOfStock` field was absent from the `creasingPerforation` sub-document in three layers:
the MongoDB schema (`models/JobCard.js`), the TypeScript interface (`JobCardState` in
`useJobCardForm.ts`), and the initial form state in the same hook. Because the field was
missing from the type, the `CreasingSection` component in `JobCardSections.tsx` had to use
`(formData.creasingPerforation as any).noOfStock` casts as a workaround.

The fix adds `noOfStock: String` to the Mongoose schema and `noOfStock: string` / `noOfStock: ''`
to the TypeScript interface and initial state, after which the `as any` casts in
`JobCardSections.tsx` can be removed and replaced with properly typed property access.

No new UI is required — the "NO OF STOCK" input row and the `STOCK: {value}` print identifier
already exist in `JobCardSections.tsx` and will continue to work, now without the cast.

## Glossary

- **Bug_Condition (C)**: The set of inputs that expose the defect — any save/load/display
  operation that touches `creasingPerforation.noOfStock` while the field is absent from the
  schema or TypeScript type.
- **Property (P)**: The desired outcome — `noOfStock` is persisted to and retrieved from
  MongoDB correctly, the TypeScript type is clean (no `as any`), and the UI shows the value.
- **Preservation**: All other `creasingPerforation` fields (`noOfSheets`, `creasing`,
  `creasingNo`, `perforation`, `perforationNo`, `wheelPerforation`, `wheelPerforationNo`,
  `date`) and all other job-card sections must behave exactly as before.
- **`creasingPerforation`**: The Mongoose sub-document and TypeScript sub-object that holds
  creasing and perforation data for a job card.
- **`noOfSheets`**: The existing string field directly above `noOfStock` — used as the
  template pattern for this fix.
- **`isBugCondition(input)`**: A predicate that returns `true` when an operation involves
  `creasingPerforation.noOfStock` and the field is missing from the schema / type definition.

## Bug Details

### Bug Condition

The bug manifests when any operation reads or writes `creasingPerforation.noOfStock`:
- saving a job card (field silently dropped by Mongoose because it is not in the schema)
- loading a job card (field missing from the populated document)
- rendering the form (TypeScript does not know the property exists, forcing `as any`)
- rendering the print identifier (same `as any` cast required)

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input — a job-card operation (save | load | render)
  OUTPUT: boolean

  RETURN input.touches("creasingPerforation.noOfStock")
         AND "noOfStock" NOT IN JobCardSchema.creasingPerforation
         AND "noOfStock" NOT IN JobCardState.creasingPerforation
END FUNCTION
```

### Examples

- **Save**: Operator enters "500" in "NO OF STOCK" → form state holds the value via `as any`
  cast → POST body includes `noOfStock: "500"` → Mongoose silently ignores the unknown field
  → document saved without `noOfStock` → **data lost**.

- **Load**: Job card loaded from DB → `creasingPerforation.noOfStock` is `undefined` because
  Mongoose never stored it → UI input shows empty even if the operator had previously typed
  a value → **data not round-tripped**.

- **TypeScript compile**: `formData.creasingPerforation.noOfStock` produces a type error
  → developer works around it with `(formData.creasingPerforation as any).noOfStock`
  → **type safety bypassed**.

- **Edge case — empty value**: Operator saves without entering a stock count → `noOfStock`
  should be stored as `""` (empty string), not `undefined`. After the fix this is the
  expected behaviour (matches `noOfSheets` empty-string pattern).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `noOfSheets` input, state updates, print identifier ("SHEETS: {value}"), and DB
  persistence must continue to work exactly as before.
- `creasing`, `creasingNo`, `perforation`, `perforationNo`, `wheelPerforation`,
  `wheelPerforationNo`, and `date` fields inside `creasingPerforation` must be unaffected.
- All other job-card sections (Binding, Corner Cutting, Die Cutting, Lamination, Cutting,
  Foil, ID Card) must be completely unaffected.
- The 500 ms auto-focus on the "NO OF SHEETS" input must continue without interference.

**Scope:**
All operations that do NOT involve `creasingPerforation.noOfStock` are out of scope and must
produce identical results before and after the fix. This includes:
- Mouse and keyboard input on any other field
- Save / load of any other section's data
- Print rendering of all other section identifiers

## Hypothesized Root Cause

1. **Missing schema field**: `noOfStock: String` was never added to the `creasingPerforation`
   sub-document in `models/JobCard.js`. Mongoose's strict mode silently drops unknown fields,
   so the value is never written to or read from the database.

2. **Missing TypeScript interface entry**: `noOfStock: string` was never added to the
   `creasingPerforation` block inside the `JobCardState` interface in `useJobCardForm.ts`,
   so TypeScript does not recognise the property and the component must use `as any`.

3. **Missing initial state entry**: `noOfStock: ''` was never added to the `creasingPerforation`
   initialiser inside `useState<JobCardState>(...)` in `useJobCardForm.ts`. Without it, the
   field starts as `undefined` rather than `''`, which can cause uncontrolled-input warnings.

4. **Downstream `as any` casts**: Because the type was wrong, `JobCardSections.tsx` applied
   `(formData.creasingPerforation as any).noOfStock` in two places (input value and print
   identifier). These are a symptom, not the root cause, and can be removed once the type
   is correct.

## Correctness Properties

Property 1: Bug Condition — noOfStock Persisted and Typed Correctly

_For any_ job-card save/load cycle where the operator has entered a value into the "NO OF
STOCK" input, the fixed system SHALL store that value in `creasingPerforation.noOfStock` in
MongoDB and retrieve it without loss, AND the TypeScript compiler SHALL accept
`formData.creasingPerforation.noOfStock` without any `as any` cast.

**Validates: Requirements 2.2, 2.3, 2.4**

Property 2: Preservation — Existing Creasing Fields Unaffected

_For any_ job-card operation where the bug condition does NOT hold (i.e., the operation does
not involve `noOfStock`), the fixed code SHALL produce exactly the same result as the original
code, preserving `noOfSheets`, all checkbox/number fields, auto-focus behaviour, and all other
job-card sections.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

**File 1: `models/JobCard.js`**

**Location**: `creasingPerforation` sub-document

**Specific Change**:
1. **Add missing schema field**: Insert `noOfStock: String,` immediately after
   `noOfSheets: String,` in the `creasingPerforation` block. This allows Mongoose to
   persist and hydrate the field.

---

**File 2: `printing-press-frontend/src/hooks/useJobCardForm.ts`**

**Location 1**: `JobCardState` interface, `creasingPerforation` block

**Specific Change**:
2. **Add interface property**: Insert `noOfStock: string;` immediately after
   `noOfSheets: string;` so TypeScript knows the field exists.

**Location 2**: `useState<JobCardState>(...)` initialiser, `creasingPerforation` block

**Specific Change**:
3. **Add initial state value**: Insert `noOfStock: '',` immediately after `noOfSheets: '',`
   so the field starts as a controlled empty string.

---

**File 3: `printing-press-frontend/src/components/JobCardSections.tsx`** *(cleanup only)*

**Specific Changes**:
4. **Remove `as any` on input value**: Replace
   `value={(formData.creasingPerforation as any).noOfStock || ''}`
   with `value={formData.creasingPerforation.noOfStock}`.

5. **Remove `as any` on print identifier**: Replace
   `{(formData.creasingPerforation as any).noOfStock && ...}`
   with `{formData.creasingPerforation.noOfStock && ...}`.

> **Note on current state**: Reading the actual files shows that Files 1 and 2 have already
> been updated (both `models/JobCard.js` and `useJobCardForm.ts` now contain `noOfStock`).
> Only the `as any` cast cleanup in File 3 remains outstanding.

## Testing Strategy

### Validation Approach

The testing strategy follows two phases: first confirm the bug on the unfixed code (or verify
the remaining cast issue), then confirm the fix is complete and regressions are absent.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the defect BEFORE applying the remaining
fix. Confirm that the `as any` cast in `JobCardSections.tsx` is the last remaining symptom
and that the schema / type changes are sufficient to eliminate it.

**Test Plan**: Inspect TypeScript compilation output on `JobCardSections.tsx` with the `as
any` casts still present. Confirm the casts are the only type errors related to `noOfStock`.
Run a round-trip save/load test to verify the field is persisted correctly now that the
schema and type are fixed.

**Test Cases**:
1. **Type-check test** (static): Remove one `as any` cast manually and run `tsc --noEmit` —
   expect NO error (proving the interface is now correct). *(Will pass on current code.)*
2. **Save round-trip test**: Submit a job card with `noOfStock: "300"` via the API; reload
   the document and assert `creasingPerforation.noOfStock === "300"`. *(Will pass on current
   code because the schema is already fixed.)*
3. **Empty-value test**: Submit with `noOfStock: ""` and verify the field is stored as `""`
   (not `undefined` or omitted).
4. **Cast removal test** (regression): Remove both `as any` casts in `JobCardSections.tsx`
   and confirm `tsc --noEmit` reports zero errors in that file.

**Expected Counterexamples** (on truly unfixed code):
- `tsc` reports `Property 'noOfStock' does not exist on type '...'` when `as any` is absent.
- Mongoose drops `noOfStock` from the saved document (not visible on current code because
  the schema is already corrected).

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed system produces
the expected correct behaviour.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := saveAndReload(input)
  ASSERT result.creasingPerforation.noOfStock === input.noOfStock
  ASSERT noAsAnyCastNeeded(JobCardSections)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed system
produces the same result as before.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT fixedSystem(input) === originalSystem(input)
END FOR
```

**Testing Approach**: Property-based testing is appropriate for preservation because:
- It generates many `creasingPerforation` objects automatically, covering `noOfSheets`,
  all booleans, and all number strings.
- It catches edge cases (empty strings, long values, special characters) automatically.
- It provides strong assurance that the two-line schema/type addition has no side-effects.

**Test Cases**:
1. **noOfSheets Preservation**: Generate random non-empty `noOfSheets` values; verify save
   and load round-trips produce identical results before and after the fix.
2. **Checkbox Preservation**: Toggle `creasing`, `perforation`, and `wheelPerforation` in
   random combinations; verify DB round-trip is unchanged.
3. **Other Section Preservation**: Save job cards with populated Binding, Cutting, and
   Lamination sections alongside `creasingPerforation`; verify those sections are unaffected.
4. **Auto-focus Preservation**: Render `CreasingSection` and assert that the `noOfSheetsRef`
   input receives focus after 500 ms with no interference from the `noOfStock` input.

### Unit Tests

- Verify `JobCardState` interface includes `noOfStock: string` (TypeScript compile check).
- Verify initial `formData.creasingPerforation.noOfStock` is `''` (not `undefined`).
- Verify Mongoose schema includes `noOfStock: String` in `creasingPerforation`.
- Verify `onChange` on the "NO OF STOCK" input updates `formData.creasingPerforation.noOfStock`
  correctly.
- Verify the print identifier span renders "STOCK: 300" when `noOfStock` is `"300"` and is
  absent when `noOfStock` is `""`.

### Property-Based Tests

- Generate random `noOfStock` string values (including empty, numeric strings, long strings)
  and verify each round-trips through save → load without loss.
- Generate random `creasingPerforation` objects (all fields populated randomly) and verify
  that `noOfSheets` and all other fields are unchanged by the fix.
- Generate random job-card objects (all sections) and verify that sections other than
  `creasingPerforation` are completely unaffected.

### Integration Tests

- Submit a full job-card form with `noOfStock` set via the UI; reload the page and assert
  the "NO OF STOCK" input is pre-populated with the saved value.
- Verify the "STOCK: {value}" span appears in the print view when `noOfStock` is non-empty
  and is absent when empty, without affecting the "SHEETS: {value}" span.
- Verify TypeScript compilation of the entire frontend with zero `as any` casts related to
  `noOfStock` after all fix changes are applied.
