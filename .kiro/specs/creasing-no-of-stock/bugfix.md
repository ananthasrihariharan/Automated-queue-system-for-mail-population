# Bugfix Requirements Document

## Introduction

The `creasingPerforation` section of the job card form is missing a `noOfStock` (No. of Stock) field. The field does not exist in the MongoDB `JobCard` model, the frontend TypeScript type definition, the initial form state, the `CreasingSection` UI component, or the print identifier area. The `noOfSheets` (No. of Sheets) field was added in a prior spec and serves as the exact template to follow. This fix adds `noOfStock` consistently across all four layers — database, state, UI input, and print display — so that operators can record and persist a stock count alongside the sheet count.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a press operator opens the Creasing / Perf section THEN the system renders no "No. of Stock" input field, giving the operator no way to enter or view a stock count.

1.2 WHEN a job card containing creasing data is saved THEN the system does not include a `noOfStock` value in the request payload because the field does not exist in the form state.

1.3 WHEN a saved job card is loaded from the database THEN the system cannot populate a `noOfStock` value because the field is absent from the `JobCard` MongoDB schema.

1.4 WHEN the job card is printed THEN the system does not display a stock count in the `section-identifiers` print area of the Creasing / Perf section.

### Expected Behavior (Correct)

2.1 WHEN a press operator opens the Creasing / Perf section THEN the system SHALL display a visible, editable "No. of Stock" input field alongside the existing "No. of Sheets" input.

2.2 WHEN an operator types a value into the "No. of Stock" input THEN the system SHALL update `formData.creasingPerforation.noOfStock` in the form state with the entered value.

2.3 WHEN a job card is saved THEN the system SHALL include `noOfStock` in the `creasingPerforation` payload and persist it to the MongoDB `JobCard` document.

2.4 WHEN a saved job card is loaded from the database THEN the system SHALL pre-populate the "No. of Stock" input with the stored `creasingPerforation.noOfStock` value.

2.5 WHEN the job card is printed THEN the system SHALL display the stock count in the `section-identifiers` print area of the Creasing / Perf section, formatted consistently with the "SHEETS:" identifier already shown there.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an operator uses the "No. of Sheets" input in the Creasing / Perf section THEN the system SHALL CONTINUE TO update `formData.creasingPerforation.noOfSheets` and display it in the `section-identifiers` print area exactly as before.

3.2 WHEN an operator uses the CREASING, PERFORATION, or WHEEL PERFORATION checkboxes and number inputs THEN the system SHALL CONTINUE TO update `creasingPerforation.creasing`, `creasingNo`, `perforation`, `perforationNo`, `wheelPerforation`, and `wheelPerforationNo` with no change in behavior.

3.3 WHEN any other section of the job card form (Binding, Corner Cutting, Die Cutting, Lamination, Cutting, Foil, ID Card) is used THEN the system SHALL CONTINUE TO function exactly as before, with no impact from this change.

3.4 WHEN the Creasing / Perf section auto-focuses the "No. of Sheets" input on mount THEN the system SHALL CONTINUE TO apply the 500 ms auto-focus behaviour to that input without interference from the new field.

3.5 WHEN the job card is printed and `noOfSheets` is non-empty THEN the system SHALL CONTINUE TO render the "SHEETS: {value}" span in the `section-identifiers` area alongside the new "STOCK: {value}" span.
