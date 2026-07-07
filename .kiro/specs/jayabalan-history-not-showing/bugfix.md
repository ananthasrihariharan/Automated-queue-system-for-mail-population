# Bugfix Requirements Document

## Introduction

User "jayabalan" holds two finishing sub-roles: FINISHING_CUTTING and FINISHING_CORNER_CUT. When they navigate to the History tab in the Finishing Dashboard, no completed jobs are shown — even though the same jobs appear correctly in the Admin's history view. The bug affects any finishing staff who have completed jobs but whose completed jobs cannot be matched by the current `taskLog.$elemMatch.staffId` filter in `getFinishingHistory`. Two root causes are identified: (1) legacy jobs that were completed before the `taskLog` array was introduced have no `taskLog` entry, so the `staffId` filter eliminates them entirely; and (2) potential ObjectId type-mismatch between the value stored in `taskLog.staffId` at task-start time versus the `req.user._id` used at query time causes the `$elemMatch` to fail for affected records.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a finishing staff user with one or more sub-roles (e.g. FINISHING_CUTTING, FINISHING_CORNER_CUT) requests their history AND the completed jobs were finished before the `taskLog` feature existed (legacy jobs) THEN the system returns an empty job list because the `taskLog.$elemMatch.staffId` filter finds no matching log entries.

1.2 WHEN a finishing staff user requests their history AND `taskLog` entries exist but `staffId` was stored as a string (or with a different ObjectId representation) at task-start time while `req.user._id` is a Mongoose ObjectId at query time THEN the system returns an empty job list because the strict `$elemMatch` equality check fails to match the staffId.

1.3 WHEN a finishing staff user with multiple finishing sub-roles (e.g. FINISHING_CUTTING + FINISHING_CORNER_CUT) requests their history THEN the system returns an empty job list even when that user has personally completed jobs for any of their allowed task types.

### Expected Behavior (Correct)

2.1 WHEN a finishing staff user requests their history AND the job has no `taskLog` entry (legacy job) but `job.finishingCompletedBy` matches the user's ID THEN the system SHALL return those legacy jobs in the history list.

2.2 WHEN a finishing staff user requests their history AND `taskLog` entries exist THEN the system SHALL use a type-safe ObjectId comparison (via `new mongoose.Types.ObjectId(userId)`) when matching `taskLog.staffId` so that string-vs-ObjectId mismatches do not cause valid entries to be excluded.

2.3 WHEN a finishing staff user with multiple finishing sub-roles requests their history THEN the system SHALL return all jobs where the user's ID appears in either `taskLog.staffId` (for any finishing module entry with a completedAt) OR in `job.finishingCompletedBy`, covering all their allowed task types.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an ADMIN user requests the finishing history THEN the system SHALL CONTINUE TO return all completed finishing jobs across all staff without filtering by userId.

3.2 WHEN a non-ADMIN finishing staff user requests active (non-history) finishing jobs THEN the system SHALL CONTINUE TO filter jobs by their allowed task types via `injectTaskFilter` without any change.

3.3 WHEN a finishing staff user with a single sub-role (e.g. only FINISHING_CUTTING) requests their history THEN the system SHALL CONTINUE TO return only jobs relevant to their allowed task types (cutting, cutting2).

3.4 WHEN a finishing staff user completes a task and the `taskLog` entry is saved correctly THEN the system SHALL CONTINUE TO record `staffId`, `staffName`, `completedAt`, and `module: 'finishing'` in the `taskLog` array without modification.

3.5 WHEN a finishing staff user requests history with search or date filters THEN the system SHALL CONTINUE TO apply those filters on top of the user-scoped results.
