# Bugfix Requirements Document

## Introduction

In queue mode, a prepress operator clicks the "Take Job" button to manually pick and assign a specific job from the queue pool to themselves. Due to a silent `null` return from the assignment lock guard inside the `takeJob` engine function, the HTTP route responds with a success message but delivers no job to the caller. As a result, no job is appended or assigned to the operator, the session slots are never updated, the `job:assigned` event is never emitted, and the operator's UI receives no job — even though the button press appears to succeed.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a prepress operator is in an active queue session AND clicks "Take Job" for a specific job AND a concurrent assignment lock is already held for that operator THEN the system returns a null job with a false success message instead of retrying or surfacing an error

1.2 WHEN the `takeJob` function encounters an active assignment lock for the requesting staff member THEN the system silently returns `null` without assigning the job, updating the session, or emitting the `job:assigned` event

1.3 WHEN the `/take-job` route receives a `null` result from `takeJob` THEN the system responds with HTTP 200 `{ message: 'Job successfully taken', job: null }` giving the client no usable job data and no indication of failure

1.4 WHEN no job is assigned due to the null return THEN the operator's session slots (`currentQueueJob` / `currentWalkinJob`) remain unchanged and the job retains its previous status in the database

### Expected Behavior (Correct)

2.1 WHEN a prepress operator in an active queue session clicks "Take Job" for a specific job AND an assignment lock is temporarily held THEN the system SHALL either wait briefly for the lock to clear and retry, or respond with a meaningful error so the client can retry the request

2.2 WHEN the `takeJob` function cannot proceed due to a lock conflict THEN the system SHALL throw an error or return a structured failure response rather than returning `null`

2.3 WHEN the `/take-job` route receives a non-successful result from `takeJob` THEN the system SHALL respond with an appropriate HTTP error status (e.g., 409 Conflict or 503 Service Unavailable) and a descriptive error message

2.4 WHEN the take-job operation completes successfully THEN the system SHALL assign the job to the operator, update the session slot, emit the `job:assigned` event, and return the populated job object in the HTTP response

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a prepress operator in an active queue session clicks "Take Job" for a QUEUED job AND no lock conflict exists THEN the system SHALL CONTINUE TO assign the job, flip its status to `IN_PROGRESS`, and update the session slot correctly

3.2 WHEN a prepress operator takes a PAUSED job that was previously held by another staff member THEN the system SHALL CONTINUE TO emit `job:taken-by-other`, clear the old session reference, and capture the previous owner's name for notification

3.3 WHEN `takeAll` is `true` and the taken job belongs to a customer with other waiting jobs THEN the system SHALL CONTINUE TO pin sibling QUEUED jobs and transfer sibling PAUSED jobs to the new operator

3.4 WHEN a prepress operator has no active session and calls take-job THEN the system SHALL CONTINUE TO auto-create a session via `onStaffLogin` before proceeding with the assignment

3.5 WHEN a prepress operator clicks "Take Job" with `jobId` set to `'NEXT'` THEN the system SHALL CONTINUE TO delegate to `assignNextJob` and return the next available job from the queue

3.6 WHEN a job targeted by "Take Job" is already `IN_PROGRESS` and owned by a different staff member THEN the system SHALL CONTINUE TO reject the request with an appropriate error message
