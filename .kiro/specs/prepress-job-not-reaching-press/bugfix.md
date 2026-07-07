# Bugfix Requirements Document

## Introduction

Jobs created by Prepress are not appearing in the Press dashboard's active queue or its "incoming" view. After a Prepress operator submits a job, Press operators see an empty queue for the current date even though the job was just created. The bug has two root causes:

1. **Primary — Date filter timezone mismatch**: The Press dashboard constructs a date string using `new Date().toISOString().split('T')[0]`, which is the current **UTC date**. The server's `applyDateFilter` builds a local-time range using `new Date(y, m-1, d, 0,0,0,0)`. In timezones ahead of UTC (e.g. IST UTC+5:30), the client sends the UTC date (which may be yesterday's date from the server's perspective), so the date range built server-side misses jobs that were actually created today in local time — causing the entire day's jobs to be invisible to Press.

2. **Secondary — `normalizePostPressItems` double-call drops `activeStage`**: In `prepress.js`'s job creation route, `normalizePostPressItems` is called a second time after `applyJobCardsToItems`. That second call invokes `computeItemActiveStage(item)` **without passing a `job` argument**, which is intentional for new items. However, if any item enters the second normalization pass with `pressStatus` or `printConfirmed` already set to a completed state by a job card, `activeStage` could be advanced past `'press'`, making `getPressJobs`'s `'items.activeStage': 'press'` filter miss those items.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a Prepress operator creates a job and the server's local date differs from the UTC date sent by the Press dashboard's date filter THEN the system returns zero jobs for that date, making the newly created job invisible in the Press queue

1.2 WHEN the Press dashboard sends today's date as a UTC ISO date string (e.g. `"2025-01-14"` at 23:00 UTC in IST timezone where local date is `"2025-01-15"`) THEN the system applies a local-time date range for `2025-01-14`, excluding all jobs created on local date `2025-01-15`

1.3 WHEN `normalizePostPressItems` is called a second time on items that already have a completed `pressStatus` (set via a job card) THEN the system computes `activeStage` as a post-press stage instead of `'press'`, preventing those items from matching the `'items.activeStage': 'press'` query used by `getPressJobs`

### Expected Behavior (Correct)

2.1 WHEN a Prepress operator creates a job today (in the server's local timezone) and a Press operator views the active queue filtered by today's date THEN the system SHALL return that job in the Press queue regardless of any UTC/local-time offset between the client and server

2.2 WHEN the Press dashboard sends a date string of `"YYYY-MM-DD"` THEN the system SHALL interpret that date using UTC boundaries (`$gte: start-of-day UTC`, `$lte: end-of-day UTC`) so the date range is consistent with the ISO date string the client produces

2.3 WHEN `normalizePostPressItems` is called during job creation THEN the system SHALL call `computeItemActiveStage` only once (after all item fields including job-card data are fully resolved), ensuring `activeStage` is set correctly and not overwritten with a stale value from a re-normalization pass

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a Press operator applies a specific historical date filter THEN the system SHALL CONTINUE TO return only jobs created on that exact date (filtered correctly)

3.2 WHEN a Prepress operator creates a job with post-press tasks configured via job cards THEN the system SHALL CONTINUE TO persist those job-card post-press fields (lamination, binding, cutting, etc.) on the items correctly

3.3 WHEN a job has all items with `activeStage: 'press'` and none excluded by `jobStatus` THEN the system SHALL CONTINUE TO return that job in `getPressJobs` results

3.4 WHEN the Press dashboard is used without a date filter (empty string) THEN the system SHALL CONTINUE TO return all qualifying press jobs regardless of date

3.5 WHEN `applyDateFilter` is called with no date argument THEN the system SHALL CONTINUE TO return the filter unchanged (no date restriction applied)
