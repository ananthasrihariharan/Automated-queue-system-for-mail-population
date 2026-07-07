# Bugfix Requirements Document

## Introduction

After a staff member clicks TAKE on a queued or walk-in job in the QueueDashboard, the job does not appear in the UI despite the `POST /api/queue/take-job` endpoint returning HTTP 200. The failure spans four distinct areas:

1. The `startWalkinJobMutation.onSuccess` handler in `QueueDashboard.tsx` does not unwrap the job from the response shape `{ job, previousOwnerName }` and does not apply an optimistic cache update, so the UI stays empty until the next `refetchInterval` fires.
2. The `onJobAssigned` handler in `useQueueListeners.ts` passes `prev` unchanged when it is `null` (no prior cache entry), so a fresh socket `job:assigned` event after a TAKE produces no visible update.
3. The backend routes `POST /api/queue/take-job`, `POST /api/queue/jobs/:id/take`, and `POST /api/queue/walkin/:id/start` each return the job inside a nested `{ job }` wrapper (from `queueEngine.takeJob` which returns `{ job, previousOwnerName }`), yet the frontend mutation's `onSuccess` treats `data` as the job object directly, causing a shape mismatch.
4. The "TAKE NEW JOB" suggestion button in `QueueDashboard.tsx` calls `startWalkinJobMutation.mutate({ jobId: 'NEXT' })`, passing the literal string `'NEXT'` as a job ID instead of invoking a real assign-next endpoint, so clicking it silently sends a bad request.
5. The `refetchInterval` for the `current-queue-job` query is set to 60 000 ms, meaning that when both the optimistic update and the socket path fail, recovery is delayed by up to 60 seconds.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a staff member clicks TAKE on any job (queued, walk-in, or pool job) and `POST /api/queue/take-job` returns HTTP 200 with body `{ message, job: { job, previousOwnerName } }` THEN the system does not update the `current-queue-job` React Query cache and the job card does not appear on the left panel.

1.2 WHEN the `job:assigned` socket event fires immediately after a successful TAKE and the `current-queue-job` cache entry is `null` (e.g. first load before any prior fetch) THEN the system returns `prev` unchanged inside `onJobAssigned`, so the cache remains `null` and nothing renders.

1.3 WHEN `startWalkinJobMutation.onSuccess` receives `data` from `queueApi.takeJob` THEN the system reads `data` as the job object directly, but the actual shape is `{ message, job: { job, previousOwnerName } }`, so `data?.job` is `{ job, previousOwnerName }` and `data?.job?.job` is needed to reach the actual job document — this mismatch means the cache write either stores the wrong object or stores `undefined`.

1.4 WHEN a staff member clicks the "TAKE NEW JOB" button on the resume-suggestion card THEN the system calls `startWalkinJobMutation.mutate({ jobId: 'NEXT' })` which POSTs `{ jobId: 'NEXT' }` to `/api/queue/take-job`, causing the backend to look up a job with ID `'NEXT'`, find nothing, and return an error — the staff member either sees a toast error or silent empty state.

1.5 WHEN both the optimistic cache update and the `job:assigned` socket event fail to update the UI after a successful TAKE THEN the system does not refetch `current-queue-job` until 60 seconds have elapsed, leaving the staff member staring at an empty panel.

---

### Expected Behavior (Correct)

2.1 WHEN `POST /api/queue/take-job` returns HTTP 200 THEN the system SHALL unwrap the job using `data?.job?.job ?? data?.job` from the response and immediately write it to the `current-queue-job` query cache via `queryClient.setQueryData`, causing the job card to appear on the left panel without waiting for a background refetch.

2.2 WHEN the `job:assigned` socket event fires and the `current-queue-job` cache entry is `null` THEN the system SHALL initialise a new cache entry `{ active: true, queueJob: null, walkinJob: null, activeBatch: [], pausedJobs: [], pendingPinnedJobs: [], pendingTray: [] }` before applying the job to the correct slot, so the job card renders immediately.

2.3 WHEN `startWalkinJobMutation.onSuccess` executes THEN the system SHALL correctly extract the job document from `data?.job?.job ?? data?.job`, store it in the `current-queue-job` cache under the appropriate slot key (`queueJob` or `walkinJob` based on `job.type`), and display the job card immediately.

2.4 WHEN a staff member clicks the "TAKE NEW JOB" button THEN the system SHALL call a dedicated `POST /api/queue/assign-next` endpoint (or `queueEngine.assignNextJob` via an existing mechanism), which assigns the highest-priority available queued job to the staff member, and SHALL update the UI cache on success.

2.5 WHEN both the optimistic update path and the socket path are used, and as a safety net THEN the system SHALL trigger `queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })` after a successful TAKE so that any cache inconsistency is resolved within the next background fetch cycle (not capped at 60 s for the immediate post-TAKE window).

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a staff member completes a job and `POST /api/queue/complete-job/:id` returns a `nextJob` THEN the system SHALL CONTINUE TO update the `current-queue-job` cache with the next job and show the celebration overlay exactly as before.

3.2 WHEN the socket delivers a `job:assigned` event for a staff member who already has a valid `current-queue-job` cache entry THEN the system SHALL CONTINUE TO merge the new job into the correct slot (`queueJob` or `walkinJob`) without discarding existing `activeBatch`, `pausedJobs`, or `pendingTray` data.

3.3 WHEN a staff member pauses a job via the HOLD button THEN the system SHALL CONTINUE TO call `POST /api/queue/jobs/:id/pause`, invalidate the `current-queue-job` and `my-jobs-today` queries, and display the hold toast exactly as before.

3.4 WHEN the staff member's session is inactive (not in queue mode) THEN the system SHALL CONTINUE TO show the "Start Receiving Jobs" screen and SHALL NOT attempt to load `current-queue-job`.

3.5 WHEN a staff member reassigns a job via the reassign modal THEN the system SHALL CONTINUE TO optimistically clear `queueJob` from the cache, send the reassign request, and then invalidate queries to load the next job.

3.6 WHEN the socket is disconnected at the time of a TAKE THEN the system SHALL CONTINUE TO function via the HTTP response path (optimistic update + query invalidation) and SHALL NOT require a socket event to show the taken job.

3.7 WHEN `POST /api/queue/take-job` returns a 4xx or 5xx error THEN the system SHALL CONTINUE TO show an error toast and leave the UI state unchanged.

3.8 WHEN two staff members rapidly click TAKE on the same job THEN the system SHALL CONTINUE TO have the backend `assignmentLocks` guard return `null` for the second request, and the second staff member SHALL receive a clear error toast rather than a silent empty state.
