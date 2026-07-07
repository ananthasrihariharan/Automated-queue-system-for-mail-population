-- Partial Indexes — run once manually against the live DB.
-- CONCURRENTLY means no table lock; the server stays up during creation.
-- Must be run OUTSIDE a transaction block (psql: \i partial_indexes.sql).
-- Safe to re-run — IF NOT EXISTS prevents duplicates.

-- Job: active-only variants cover every cashier/dispatch/report query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_active_created
  ON "Job" ("createdAt" DESC)
  WHERE "isDeleted" = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_active_status_payment
  ON "Job" ("jobStatus", "paymentStatus")
  WHERE "isDeleted" = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_active_customer_status
  ON "Job" ("customerId", "jobStatus")
  WHERE "isDeleted" = false;

-- QueueJob: QUEUED is the hottest subset — the assignment engine reads it on every cycle
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queuejob_queued_pos
  ON "QueueJob" ("queuePosition" ASC, "priorityScore" DESC)
  WHERE status = 'QUEUED' AND "isDeleted" = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queuejob_active_status_pos
  ON "QueueJob" ("status", "queuePosition")
  WHERE "isDeleted" = false;

-- QueueJob: clash-shield subquery — finds emails/phones held by OTHER staff
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queuejob_clash_email
  ON "QueueJob" ("customerEmail", "assignedToId")
  WHERE status IN ('ASSIGNED','IN_PROGRESS','PAUSED')
    AND "customerEmail" IS NOT NULL
    AND "isDeleted" = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queuejob_clash_phone
  ON "QueueJob" ("customerPhone", "assignedToId")
  WHERE status IN ('ASSIGNED','IN_PROGRESS','PAUSED')
    AND "customerPhone" IS NOT NULL
    AND "isDeleted" = false;

-- QueueSession: active-only is the only filter the assignment engine ever uses
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queuesession_active
  ON "QueueSession" ("staffId")
  WHERE "isActive" = true AND "isDeleted" = false;

-- Customer: active-only phone lookup (login, search)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_active_phone
  ON "Customer" ("phone")
  WHERE "isDeleted" = false;

-- QueueJob: hold-expiry sweep only touches rows with a holdUntil set
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queuejob_hold_expiry
  ON "QueueJob" ("holdUntil")
  WHERE status = 'PAUSED' AND "holdUntil" IS NOT NULL AND "isDeleted" = false;

-- QueueJob: workload sync — bulk fetch of pinned/paused by staff
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queuejob_pinned_staff
  ON "QueueJob" ("pinnedToStaffId", "createdAt")
  WHERE status = 'QUEUED' AND "pinnedToStaffId" IS NOT NULL AND "isDeleted" = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queuejob_paused_staff
  ON "QueueJob" ("assignedToId", "updatedAt")
  WHERE status = 'PAUSED' AND "isDeleted" = false;

-- Customer: admin list sorted by newest first; login phone lookup (active only)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_created_desc
  ON "Customer" ("createdAt" DESC)
  WHERE "isDeleted" = false;
