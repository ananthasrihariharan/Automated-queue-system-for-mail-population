# Requirements: Creasing — No. of Sheets Field

## Introduction

The Creasing section of the job card form has a `noOfSheets` field that already exists in state and the database but is currently hidden from the UI. This feature makes the field visible, displays its value prominently in the section header area, and auto-focuses the input when the section opens — mirroring the pattern used by the Corner Cutting and Die Cutting sections.

## Requirements

### Requirement 1: Visible "No. of Sheets" Input in the Creasing Section

**User Story:** As a press operator, I want to see and fill in a "No. of Sheets" input field inside the Creasing section, so that I can record the sheet count directly on the job card without the field being hidden.

**Acceptance Criteria:**
1. GIVEN the Creasing section is open, WHEN the operator views the section body, THEN a labelled "No. of Sheets" input field is visible and editable.
2. GIVEN the Creasing section is rendered, WHEN the page loads in screen mode, THEN the input field is not hidden (i.e., it does not carry a `hidden` attribute or a `no-print`-only visibility class that suppresses it on screen).
3. GIVEN the operator clears the input, WHEN the field is empty, THEN it accepts a fresh numeric entry without error.

---

### Requirement 2: Sheet Count Displayed in the Section-Identifiers (Header) Area

**User Story:** As a production supervisor, I want the number of sheets to appear in the top identifier bar of the Creasing container, so that the value is visible at a glance and is included on the printed job card.

**Acceptance Criteria:**
1. GIVEN a `noOfSheets` value has been entered, WHEN the Creasing section is displayed, THEN the value is rendered inside the `section-identifiers` element at the top of the Creasing container, formatted consistently with how `noOfCards` is shown in the Corner Cutting section.
2. GIVEN the `noOfSheets` value is empty or zero, WHEN the section-identifiers area is rendered, THEN no stale or placeholder value is shown (the display element is blank or omitted).
3. GIVEN the job card is printed, WHEN the browser print stylesheet is applied, THEN the value in the `section-identifiers` area is included in the print output.

---

### Requirement 3: Auto-Focus the Input When the Creasing Section Opens

**User Story:** As a press operator, I want the "No. of Sheets" input to receive focus automatically when I open the Creasing section, so that I can start typing immediately without clicking into the field.

**Acceptance Criteria:**
1. GIVEN the Creasing section is collapsed, WHEN the operator expands/opens the section, THEN the "No. of Sheets" input receives focus automatically.
2. GIVEN the section is already open on page load, WHEN the component mounts, THEN the input is auto-focused on mount.
3. GIVEN focus is moved to the input automatically, WHEN the operator starts typing a number, THEN the keystrokes are captured by the input field without requiring an additional click.

---

### Requirement 4: Input Value Syncs with State and Persists to the Backend

**User Story:** As a system, I need the "No. of Sheets" value to stay in sync with `creasingPerforation.noOfSheets` in form state and be saved to the database, so that the data is not lost between sessions or page reloads.

**Acceptance Criteria:**
1. GIVEN the operator types a value into the "No. of Sheets" input, WHEN the input's `onChange` event fires, THEN the `creasingPerforation.noOfSheets` field in `useJobCardForm` state is updated with the new value.
2. GIVEN the form is submitted, WHEN the job card save request is sent to the backend, THEN the `creasingPerforation.noOfSheets` value is included in the request payload and stored in the MongoDB `JobCard` document.
3. GIVEN a job card is loaded from the database, WHEN the Creasing section renders, THEN the "No. of Sheets" input is pre-populated with the persisted `creasingPerforation.noOfSheets` value.
4. GIVEN no backend schema changes are required, WHEN the feature is deployed, THEN the existing `noOfSheets` field in the `JobCard` model handles persistence without migration.

---

### Requirement 5: Input Hidden from Print, Value Display Shown on Print

**User Story:** As a production supervisor, I want the raw input control to be hidden when the job card is printed while the formatted value in the header area remains visible, so that the printed card is clean and uncluttered.

**Acceptance Criteria:**
1. GIVEN the browser print stylesheet is active, WHEN the job card is printed, THEN the "No. of Sheets" `<input>` element is not rendered in the printed output (e.g., it carries a `no-print` or equivalent print-hiding class).
2. GIVEN the browser print stylesheet is active, WHEN the job card is printed, THEN the `noOfSheets` value shown in the `section-identifiers` area IS rendered in the printed output.
3. GIVEN the operator is viewing the job card on screen, WHEN no print action is triggered, THEN both the input field and the section-identifiers value display are visible simultaneously.
