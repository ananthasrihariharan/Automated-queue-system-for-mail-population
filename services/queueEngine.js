/**
 * Queue Engine â€” Core blind assignment logic
 * 
 * Handles FIFO job assignment with priority sorting,
 * pin-aware skipping, and parallel walk-in slots.
 */

const fs = require('fs')
const path = require('path')
const { QueueJob } = require('../repositories')
const { QueueSession } = require('../repositories')
const { CustomerPreference } = require('../repositories')
const { QueueRequest } = require('../repositories')
const { SystemConfig } = require('../repositories')
const { JobEvent } = require('../repositories')
const { IngestionTask } = require('../repositories')
const { QueueStats } = require('../repositories')
const { QueueMessage } = require('../repositories')
const eventBus = require('./eventBus')
const statsService = require('./statsService')
const prisma = require('../lib/prisma')

/**
 * Per-staff in-memory lock — prevents concurrent in-process calls for the
 * SAME staff member from racing. Cross-process safety is handled at the DB
 * level via FOR UPDATE SKIP LOCKED inside atomicClaimQueueJob / atomicClaimWalkin.
 */
const assignmentLocks = new Set()

/**
 * Atomically claim the best QUEUED non-walkin job for a staff member.
 * The entire candidate selection (priority sort, pin filter, Clash Shield) and
 * status flip happen inside one UPDATE statement — there is no window for a
 * race between finding a candidate and claiming it.
 *
 * FOR UPDATE SKIP LOCKED: if two processes evaluate simultaneously, each will
 * grab a different row rather than both targeting the same one.
 *
 * Returns the claimed job row, or null if no suitable job exists.
 */
async function atomicClaimQueueJob(staffId) {
  const id = Number(staffId);
  const rows = await prisma.$queryRaw`
    UPDATE "QueueJob"
    SET
      status        = 'ASSIGNED',
      "assignedToId" = ${id},
      "assignedAt"  = NOW(),
      "updatedAt"   = NOW()
    WHERE id = (
      SELECT id FROM "QueueJob"
      WHERE status = 'QUEUED'
        AND type   != 'WALKIN'
        AND (
          "pinnedToStaffId" = ${id}
          OR (
            "pinnedToStaffId" IS NULL
            AND ("reassignedFromId" IS NULL OR "reassignedFromId" != ${id})
          )
        )
        -- Clash Shield: skip jobs whose customer is already handled by someone else
        AND (
          "customerEmail" IS NULL OR "customerEmail" = ''
          OR "customerEmail" NOT IN (
            SELECT DISTINCT c."customerEmail"
            FROM   "QueueJob" c
            WHERE  c.status IN ('ASSIGNED','IN_PROGRESS','PAUSED')
              AND  c."assignedToId" != ${id}
              AND  c."customerEmail" IS NOT NULL
              AND  c."customerEmail" != ''
          )
        )
        AND (
          "customerPhone" IS NULL OR "customerPhone" = ''
          OR "customerPhone" NOT IN (
            SELECT DISTINCT p."customerPhone"
            FROM   "QueueJob" p
            WHERE  p.status IN ('ASSIGNED','IN_PROGRESS','PAUSED')
              AND  p."assignedToId" != ${id}
              AND  p."customerPhone" IS NOT NULL
              AND  p."customerPhone" != ''
          )
        )
      ORDER BY
        CASE WHEN "pinnedToStaffId" = ${id} THEN 0 ELSE 1 END,
        "priorityScore" DESC,
        "queuePosition" ASC,
        "createdAt"     ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `;
  return rows.length > 0 ? Number(rows[0].id) : null;
}

/**
 * Atomically claim the best QUEUED walkin job for a staff member's secondary slot.
 */
async function atomicClaimWalkin(staffId) {
  const id = Number(staffId);
  const rows = await prisma.$queryRaw`
    UPDATE "QueueJob"
    SET
      status        = 'ASSIGNED',
      "assignedToId" = ${id},
      "assignedAt"  = NOW(),
      "updatedAt"   = NOW()
    WHERE id = (
      SELECT id FROM "QueueJob"
      WHERE status = 'QUEUED'
        AND type   = 'WALKIN'
        AND ("pinnedToStaffId" = ${id} OR "pinnedToStaffId" IS NULL)
      ORDER BY
        CASE WHEN "pinnedToStaffId" = ${id} THEN 0 ELSE 1 END,
        "priorityScore" DESC,
        "createdAt"     ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `;
  return rows.length > 0 ? Number(rows[0].id) : null;
}

/**
 * Helper: Silently pause any active job for a staff member.
 * Used when they start/resume a new job to ensure fluid workspace transitions.
 */
async function parkActiveJobs(staffId, session = null) {
  if (!session) {
    session = await QueueSession.findOne({ staffId, isActive: true })
  }
  if (!session) return

  const slots = ['currentQueueJob', 'currentWalkinJob'];
  let sessionModified = false;

  for (const slot of slots) {
    const jobId = session[slot];
    if (jobId) {
      const job = await QueueJob.findById(jobId);
      if (job && ['ASSIGNED', 'IN_PROGRESS'].includes(job.status)) {
        job.status = 'PAUSED';
        job.returnReason = 'Auto-paused to start another job';
        await job.save();
        
        session[slot] = null;
        sessionModified = true;
        eventBus.emit('job:paused', { job, staffId });
      } else {
        // If it's already paused or gone but still in the slot, just clear it
        session[slot] = null;
        sessionModified = true;
      }
    }
  }

  if (sessionModified) {
    await session.save();
  }
}

async function assignNextJob(staffId, existingSession = null, options = {}) {
  const lockKey = String(staffId)

  // Per-staff in-process lock — prevents duplicate in-flight calls for the same staff.
  // Cross-process / cross-instance race safety comes from FOR UPDATE SKIP LOCKED in the DB.
  if (assignmentLocks.has(lockKey)) {
    console.log(`[Engine] Lock: assignNextJob already in-flight for staff ${lockKey}, skipping.`)
    return null
  }
  assignmentLocks.add(lockKey)

  try {
    const session = existingSession || await QueueSession.findOne({ staffId, isActive: true })
    if (!session) return null
    if (session.isQueuePaused) return null

    // Auto-Pause Guardian: park any active job before taking a new one
    if (session.currentQueueJob || session.currentWalkinJob) {
      await parkActiveJobs(staffId, session)
    }

    // Single atomic SQL: candidate selection (priority, pin, Clash Shield) + claim in one statement.
    // No window exists between finding a candidate and owning it.
    const claimedId = await atomicClaimQueueJob(staffId)
    if (!claimedId) return null

    const job = await QueueJob.findById(claimedId)
    if (!job) return null

    // 1.4 BATCH LOCK: Immediately claim all other queued jobs from this customer
    const batchFilter = { status: 'QUEUED', pinnedToStaff: null };
    if (job.customerEmail) {
      batchFilter.customerEmail = job.customerEmail;
    } else if (job.customerPhone) {
      batchFilter.customerPhone = job.customerPhone;
    } else {
      // No identity to batch
      return job;
    }

    await QueueJob.updateMany(
      batchFilter,
      {
        $set: {
          pinnedToStaff: staffId,
          continuityContext: (job.continuityContext || '') + ` [Auto-reserved: Sequential Batching with Job #${String(job._id).slice(-6).toUpperCase()}]`
        }
      }
    )
    
    eventBus.emit('job:batch-reserved', { 
      customerEmail: job.customerEmail, 
      customerPhone: job.customerPhone,
      staffId 
    })

    // 1.5 Update Session â€” ATOMIC DB-level claim
    // We allow the claim if currentQueueJob is null. 
    // The busy-check at the start of the function already handles the Walk-in clash.
    const claimedSession = await QueueSession.findOneAndUpdate(
      { _id: session._id, currentQueueJob: null },
      { $set: { currentQueueJob: job._id } },
      { new: true }
    )

    if (!claimedSession) {
      // Rollback
      await QueueJob.findByIdAndUpdate(job._id, { status: 'QUEUED', assignedTo: null, assignedAt: null });
      return null;
    }

    // 2. Notify
    eventBus.emit('job:assigned', { job, staffId, details: { isTransactional: false } })
    return job

  } catch (err) {
    console.error('[Engine] Assign Failure:', err)
    return null
  } finally {
    assignmentLocks.delete(lockKey)
  }
}

/**
 * Dedicated Walk-in Assignment Logic.
 * Unlike the standard queue, walk-ins are almost always pinned to a specific staff member.
 * This function finds the best Walk-in candidate for a staff member's secondary slot.
 */
async function assignNextWalkin(staffId, existingSession = null) {
  const lockKey = `walkin:${String(staffId)}`;
  if (assignmentLocks.has(lockKey)) return null;
  assignmentLocks.add(lockKey);

  try {
    const session = existingSession || await QueueSession.findOne({ staffId, isActive: true });
    if (!session || session.currentWalkinJob) return null;

    // Single atomic SQL: select best walkin + claim with FOR UPDATE SKIP LOCKED
    const claimedId = await atomicClaimWalkin(staffId);
    if (!claimedId) return null;

    const job = await QueueJob.findById(claimedId);
    if (!job) return null;

    // Update Session â€” ATOMIC DB-level claim
    const claimedSession = await QueueSession.findOneAndUpdate(
      { _id: session._id, currentWalkinJob: null },
      { $set: { currentWalkinJob: job._id } },
      { new: true }
    );

    if (!claimedSession) {
      // Rollback
      await QueueJob.findByIdAndUpdate(job._id, { status: 'QUEUED', assignedTo: null, assignedAt: null });
      return null;
    }

    eventBus.emit('job:assigned', { job, staffId, details: { slot: 'walkin' } });
    return job;

  } catch (err) {
    console.error('[Engine] Walkin Assign Failure:', err);
    return null;
  } finally {
    assignmentLocks.delete(lockKey);
  }
}

/**
 * Staff picks a specific job manually from the Pool or their Pinned tray.
 * Logic strictly respects the "One Job at a Time" rule by auto-pausing current work.
 */


/**
 * Mark a job as complete and assign the next one.
 */
async function onJobComplete(staffId, jobId) {
  // 1. Atomic Completion
  const job = await QueueJob.findOneAndUpdate(
    {
      _id: jobId,
      $or: [
        { assignedTo: staffId, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
        { pinnedToStaff: staffId, status: 'QUEUED' }
      ]
    },
    { $set: { status: 'COMPLETED', completedAt: new Date(), assignedTo: staffId } },
    { new: true }
  )
  if (!job) throw new Error('Job not found, not assigned to you, or already completed')

  // 2. Clear Session Slots & Update Fairness Timer
  const [session] = await Promise.all([
    QueueSession.findOne({ staffId, isActive: true }),
    require('../repositories').UserRepository.findByIdAndUpdate(staffId, { lastJobCompletedAt: new Date() })
  ]);

  if (session) {
    if (String(session.currentQueueJob) === String(jobId)) session.currentQueueJob = null
    if (String(session.currentWalkinJob) === String(jobId)) session.currentWalkinJob = null
    await session.save()
  }

  // 3. Move folder (Non-blocking internal try-catch)
  if (job.type === 'EMAIL' && job.folderPath) {
    try {
      const archiveRoot = process.env.COMPLETED_JOBS_PATH;

      if (archiveRoot && fs.existsSync(job.folderPath)) {
        const watchRoot = process.env.N8N_WATCH_PATH;
        const oldFolderPath = job.folderPath;
        const oldParentPath = path.dirname(oldFolderPath);

        const relativePath = path.relative(watchRoot, oldFolderPath);
        const targetPath = path.join(archiveRoot, relativePath);
        if (!fs.existsSync(path.dirname(targetPath))) fs.mkdirSync(path.dirname(targetPath), { recursive: true });

        try {
          // Cross-volume safe move
          fs.renameSync(oldFolderPath, targetPath);
        } catch (renameErr) {
          if (renameErr.code === 'EXDEV') {
            // Fallback if renaming fails across devices/partitions
            const copyDir = (src, dest) => {
              fs.mkdirSync(dest, { recursive: true });
              const entries = fs.readdirSync(src, { withFileTypes: true });
              for (let entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) copyDir(srcPath, destPath);
                else fs.copyFileSync(srcPath, destPath);
              }
            };
            copyDir(oldFolderPath, targetPath);
            fs.rmSync(oldFolderPath, { recursive: true, force: true });
          } else {
            throw renameErr;
          }
        }

        // Cautious Recursive Cleanup: Remove parent folders if they are now empty (up to watchRoot)
        if (watchRoot && oldParentPath !== watchRoot && oldParentPath.includes(watchRoot)) {
          removeEmptyParentsRecursive(oldParentPath, watchRoot);
        }

        job.folderPath = targetPath;
        if (watchRoot) {
          job.relativeFolderPath = path.relative(path.dirname(watchRoot), targetPath).replace(/\\/g, '/');
        }
        await job.save();
      }
    } catch (err) {
      console.error(`[Archive Error] Job ${jobId}:`, err.message);
    }

    // 3.5 Learning: Record sticky routing preference for returning customers
    if (job.type === 'EMAIL' && job.customerEmail) {
      try {
        await CustomerPreference.findOneAndUpdate(
          { customerEmail: job.customerEmail },
          {
            customerName: job.customerName,
            preferredStaff: staffId,
            $inc: { confirmedCount: 1 }
          },
          { upsert: true, new: true }
        );
      } catch (prefErr) {
        console.error(`[Learning Error] Job ${jobId}:`, prefErr.message);
      }
    }
  }

  // 4. Emit completed (Moved up to avoid early return during Batch Promotion)
  eventBus.emit('job:completed', { jobId: job.id || job._id, staffId })
  await new Promise(resolve => setImmediate(resolve))

  // 5. Batch Promotion: Prioritize next job for SAME customer before global queue
  let nextJob = null
  
  // Is there another job for this customer already pinned to me?
  let nextInBatch = null
  const batchFilter = { pinnedToStaff: staffId, status: 'QUEUED' };
  
  if (job.customerEmail) {
    batchFilter.customerEmail = job.customerEmail;
  } else if (job.customerPhone) {
    batchFilter.customerPhone = job.customerPhone;
  } else {
    // No identity to batch match, force null
    nextInBatch = null;
  }

  if (Object.keys(batchFilter).length > 2) {
    nextInBatch = await QueueJob.findOne(batchFilter).sort({ createdAt: 1 })
  }

  if (nextInBatch && session) {
    const isNextWalkin = nextInBatch.type === 'WALKIN';
    const currentSlot = isNextWalkin ? session.currentWalkinJob : session.currentQueueJob;

    if (!currentSlot) {
      console.log(`[Engine] Promoting batch ${nextInBatch.type} job ${nextInBatch._id} to slot for staff ${staffId}`)
      nextInBatch.status = 'IN_PROGRESS'
      nextInBatch.assignedTo = staffId
      nextInBatch.assignedAt = new Date()
      await nextInBatch.save()
      
      if (isNextWalkin) {
        session.currentWalkinJob = nextInBatch._id
      } else {
        session.currentQueueJob = nextInBatch._id
      }
      await session.save()
      
      eventBus.emit('job:assigned', { 
        job: nextInBatch, 
        staffId, 
        details: { isTransactional: true, slot: isNextWalkin ? 'walkin' : 'queue' } 
      })
      return nextInBatch
    }
  }

  // 5. Check for Paused Jobs (but do NOT auto-resume)
  const pausedJobCount = await QueueJob.countDocuments({ assignedTo: staffId, status: 'PAUSED' });
  
  // 7. Auto-Assign logic: Only if NO jobs are on hold
  if (pausedJobCount === 0 && !session.isQueuePaused && !session.currentQueueJob) {
    return await assignNextJob(staffId, session)
  }

  // Return null so frontend knows to stay idle / check Tray
  return null;
}

/**
 * Handle staff login to queue system.
 */
async function onStaffLogin(staffId, options = {}) {
  const oldSessions = await QueueSession.find({ staffId, isActive: true })
  for (const os of oldSessions) {
    await onStaffLogout(staffId, 'Session Terminated by New Login (Refresh)')
  }
  const [session] = await Promise.all([
    QueueSession.create({
      staffId,
      loginAt: new Date(),
      isActive: true
    }),
    require('../repositories').UserRepository.findByIdAndUpdate(staffId, { lastJobCompletedAt: new Date() })
  ]);

  let job = null
  if (options.autoAssign !== false && options.autoAssign !== 'false') {
    job = await assignNextJob(staffId, null, { force: true })
  }
  eventBus.emit('session:started', { staffId, sessionId: session.id || session._id })

  return { session, job }
}

/**
 * Handle staff logout from queue system.
 */
async function onStaffLogout(staffId, reason) {
  const session = await QueueSession.findOne({ staffId, isActive: true })
  if (!session) return null

  const isManualLogout = reason === 'Manual Logout';

  if (session.currentQueueJob) {
    const job = await QueueJob.findById(session.currentQueueJob)
    if (job && ['ASSIGNED', 'PAUSED', 'IN_PROGRESS'].includes(job.status)) {
      job.status = 'QUEUED'
      job.assignedTo = null
      job.assignedAt = null
      // Clear pin on manual logout so others can take it; preserve on refresh/inactivity
      const shouldKeepPin = !isManualLogout || job.isHardPinned;
      job.pinnedToStaff = shouldKeepPin ? staffId : null
      if (reason) job.returnReason = reason
      await job.save()
    }
  }

  const pausedJobs = await QueueJob.find({ assignedTo: staffId, status: 'PAUSED' })
  for (const pJob of pausedJobs) {
    pJob.status = 'QUEUED'
    pJob.lastPausedBy = staffId
    pJob.assignedTo = null
    pJob.assignedAt = null
    // Clear pin on manual logout so others can take it; preserve on refresh/inactivity
    const shouldKeepPin = !isManualLogout || pJob.isHardPinned;
    pJob.pinnedToStaff = shouldKeepPin ? staffId : null 
    if (reason) pJob.returnReason = reason
    await pJob.save()
  }

  if (session.currentWalkinJob) {
    const walkinJob = await QueueJob.findById(session.currentWalkinJob)
    if (walkinJob && ['ASSIGNED', 'IN_PROGRESS'].includes(walkinJob.status)) {
      walkinJob.status = 'QUEUED'
      walkinJob.assignedTo = null
      walkinJob.assignedAt = null
      walkinJob.pinnedToStaff = (isManualLogout && !walkinJob.isHardPinned) ? null : (walkinJob.pinnedToStaff || staffId)
      if (reason) walkinJob.returnReason = reason
      await walkinJob.save()
    }
  }

  // —————————————————————————————————— Stray ASSIGNED/IN_PROGRESS sweep ——————————————————————————————————
  // Catches jobs flipped to ASSIGNED by the batch-continuity path in takeJob
  // (those sibling jobs that appear in the frontend "pendingTray") but are NOT
  // tracked in session.currentQueueJob / session.currentWalkinJob.
  // Without this they stay ASSIGNED to a logged-out staff member for up to
  // 90 minutes until the ghost-job cleanup cron fires.
  const trackedSlotIds = [session.currentQueueJob, session.currentWalkinJob].filter(Boolean)
  if (isManualLogout) {
    // Non-hard-pinned stray: clear pin so others can pick up immediately
    await QueueJob.updateMany(
      { assignedTo: staffId, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }, isHardPinned: { $ne: true }, _id: { $nin: trackedSlotIds } },
      { $set: { status: 'QUEUED', assignedTo: null, assignedAt: null, pinnedToStaff: null, returnReason: reason || 'Returned: staff logged out' } }
    )
    // Hard-pinned stray: return to pool but keep pin so it comes back on re-login
    await QueueJob.updateMany(
      { assignedTo: staffId, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }, isHardPinned: true, _id: { $nin: trackedSlotIds } },
      { $set: { status: 'QUEUED', assignedTo: null, assignedAt: null, returnReason: reason || 'Returned: staff logged out (pinned)' } }
    )
    // —————————————————— Release soft-pinned QUEUED batch jobs on manual logout ———————————————————
    // assignNextJob and takeJob batch-reserve sibling QUEUED jobs by setting
    // pinnedToStaff = staffId. Without this sweep they remain locked to this
    // staff member for up to 2 hours (stale-pin cleanup), blocking other
    // designers from picking them up. Hard-pinned jobs are kept so they
    // return to the same staff member on next login.
    await QueueJob.updateMany(
      { pinnedToStaff: staffId, status: 'QUEUED', isHardPinned: { $ne: true } },
      { $set: { pinnedToStaff: null, returnReason: 'Released: staff logged out' } }
    )
  } else {
    // Non-manual logout (session refresh / inactivity timeout):
    // Keep jobs pinned to this staff member so they resume where they left off.
    await QueueJob.updateMany(
      { assignedTo: staffId, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }, _id: { $nin: trackedSlotIds } },
      { $set: { status: 'QUEUED', assignedTo: null, assignedAt: null, pinnedToStaff: staffId, returnReason: reason || 'Session ended (preserve pin)' } }
    )
  }

  session.isActive = false
  session.logoutAt = new Date()
  session.currentQueueJob = null
  session.currentWalkinJob = null
  await session.save()

  eventBus.emit('session:ended', { staffId, sessionId: session.id || session._id, reason })

  return session
}

/**
 * Admin: Reorder a job's priority.
 */
async function reorderQueue(jobId, newPriority, newPosition) {
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')
  if (job.status !== 'QUEUED') throw new Error('Can only reorder queued jobs')

  job.priorityScore = newPriority
  if (newPosition !== undefined) job.queuePosition = newPosition
  await job.save()

  eventBus.emit('queue:reordered', { jobId })

  return job
}

/**
 * Admin: Pin a job to a specific staff member.
 */
async function pinJob(jobId, targetStaffId) {
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')

  // NOTE: isActive check removed to allow pre-planning for offline staff
  const wasReview = job.status === 'ADMIN_REVIEW'
  if (job.status === 'ADMIN_REVIEW') {
    const maxPos = await QueueJob.countDocuments({ status: 'QUEUED' })
    job.status = 'QUEUED'
    job.assignedTo = null
    job.assignedAt = null
    job.queuePosition = maxPos + 1
    job.returnReason = 'Routed from review by admin'
  }

  job.pinnedToStaff = targetStaffId
  await job.save()

  // LEARNING: Update long-term preference when admin manually pins
  if (job.customerEmail) {
    await CustomerPreference.findOneAndUpdate(
      { customerEmail: job.customerEmail },
      {
        customerName: job.customerName,
        preferredStaff: targetStaffId,
        $inc: { confirmedCount: 1 }
      },
      { upsert: true }
    ).catch(err => console.error('[Pin-Learning] Failed:', err.message))
  }

  eventBus.emit('job:pinned', { jobId, staffId: targetStaffId })
  if (wasReview) {
    statsService.schedule()
    assignIdleStaff().catch(() => { })
  }

  return job
}

/**
 * Admin: Unpin a job.
 */
async function unpinJob(jobId) {
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')

  job.pinnedToStaff = null
  await job.save()

  eventBus.emit('job:unpinned', { jobId })

  return job
}

/**
 * Admin: Reassign a job between staff members.
 */
async function reassignJob(jobId, fromStaffId, toStaffId, notes, options = {}) {
  const { forceMode = 'PARK', batchMode = false } = options
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')

  const originalStatus = job.status
  const customerEmail = job.customerEmail

  // 1. Cleanup From-Staff
  if (fromStaffId) {
    const oldSession = await QueueSession.findOne({ staffId: fromStaffId, isActive: true })
    if (oldSession) {
      if (String(oldSession.currentQueueJob) === String(jobId)) oldSession.currentQueueJob = null
      if (String(oldSession.currentWalkinJob) === String(jobId)) oldSession.currentWalkinJob = null
      await oldSession.save()
    }
  }

  // 2. Handle Target Staff - Decision logic for PARK vs PUSH
  let newSession = null
  if (toStaffId) {
    newSession = await QueueSession.findOne({ staffId: toStaffId, isActive: true })

    // Logic Gate A: Target Offline -> Always PARK (Pin)
    if (!newSession) {
      job.status = 'QUEUED'
      job.assignedTo = null
      job.assignedAt = null
      job.pinnedToStaff = toStaffId
      job.reassignedFrom = fromStaffId
      job.handoffNotes = notes || ''
    }
    // Logic Gate B: Target Busy AND behavior is PARK -> Always PARK
    else if ((newSession.currentQueueJob || newSession.currentWalkinJob) && forceMode === 'PARK') {
      job.status = 'QUEUED'
      job.assignedTo = null
      job.assignedAt = null
      job.pinnedToStaff = toStaffId
      job.reassignedFrom = fromStaffId
      job.handoffNotes = notes || ''
    }
    // Logic Gate C: PUSH Mode OR Target Available -> Move to Active slot
    else {
      // If Target is busy and we are PUSHING, we must pause their current job
      if ((newSession.currentQueueJob || newSession.currentWalkinJob) && forceMode === 'PUSH') {
        const currentJobId = newSession.currentQueueJob
        const oldActiveJob = await QueueJob.findById(currentJobId)
        if (oldActiveJob && oldActiveJob.status === 'ASSIGNED') {
          oldActiveJob.status = 'PAUSED'
          oldActiveJob.returnReason = `Interrupted by forced admin handoff (#${String(job._id).slice(-6)})`
          await oldActiveJob.save()
          eventBus.emit('job:paused', { job: oldActiveJob, staffId: toStaffId, details: { isInterruption: true } })
        }
      }

      // Preserve staff reason if this job came from a request
      if (job.status === 'ADMIN_REVIEW' && job.handoffNotes) {
        job.staffHandoffReason = job.handoffNotes
      }
      job.adminHandoffNotes = notes || ''

      job.assignedTo = toStaffId
      job.reassignedFrom = fromStaffId
      job.handoffNotes = notes || ''
      job.status = 'ASSIGNED'
      job.assignedAt = new Date()
      newSession.currentQueueJob = job._id
      await newSession.save()
    }
  } else {
    // 2.5 Logic Guardian: Return to general pool if no owner is assigned
    job.status = 'QUEUED'
    job.assignedTo = null
    job.assignedAt = null
    job.pinnedToStaff = null
  }

  job.isHardPinned = false; // Always clear hard pin on admin reassignment
  await job.save()

  // 3. Batch Mode: Move all other pinned jobs for this customer
  if (batchMode && customerEmail) {
    const batchUpdate = {
      pinnedToStaff: toStaffId || null,
      handoffNotes: `Batch move: ${notes}`
    }
    await QueueJob.updateMany(
      {
        customerEmail,
        pinnedToStaff: fromStaffId,
        status: 'QUEUED',
        _id: { $ne: job._id }
      },
      { $set: batchUpdate }
    )
  }

  // 4. Learning & Cleanup
  if (toStaffId && job.customerEmail) {
    await CustomerPreference.findOneAndUpdate(
      { customerEmail: job.customerEmail },
      {
        customerName: job.customerName,
        preferredStaff: toStaffId,
        $inc: { confirmedCount: 1 }
      },
      { upsert: true }
    ).catch(() => { })
  }

  await QueueRequest.updateMany(
    { jobId, type: 'REASSIGN', status: 'PENDING' },
    { status: 'APPROVED', adminAction: `Handled via manual reassignment (${forceMode})` }
  )

  eventBus.emit('job:reassigned', { jobId, fromStaffId, toStaffId, notes, options })

  // If we returned to pool, trigger a sweep
  if (!toStaffId) {
    assignIdleStaff().catch(() => { })
  }

  return job
}

/**
 * Admin: Approve a request (Walk-in or Reassignment).
 */
async function handleRequest(requestId, decision, adminAction, targetStaffId) {
  const request = await QueueRequest.findById(requestId).populate('requestedBy', 'name')
  if (!request) return null

  if (decision === 'REJECTED') {
    request.status = 'REJECTED'
    request.adminAction = adminAction
    await request.save()

    // If a reassignment was rejected, we MUST restore the job to the general pool
    // so it doesn't stay stuck in ADMIN_REVIEW forever.
    if (request.type === 'REASSIGN') {
      const job = await QueueJob.findById(request.jobId)
      if (job && job.status === 'ADMIN_REVIEW') {
        job.status = 'QUEUED'
        job.assignedTo = null
        job.returnReason = `Reassignment Rejected: ${adminAction || 'No reason provided'}`
        await job.save()

        // Schedule a stats refresh — queue:reordered also triggers one via eventHandlers
        statsService.schedule()

        eventBus.emit('queue:reordered', { reason: 'Reassignment Rejected' })
      }
    }

    return { request }
  }
  if (request.type === 'WALKIN') {
    const session = await QueueSession.findOne({ staffId: request.requestedBy._id, isActive: true })
    if (session) {
      const walkinJob = await QueueJob.create({
        emailSubject: `Walk-in: ${request.description.substring(0, 50)}`,
        customerName: 'Walk-in Customer',
        mailBody: request.description,
        folderPath: '',
        type: 'WALKIN',
        status: 'ASSIGNED',
        assignedTo: request.requestedBy._id,
        assignedAt: new Date(),
        pinnedToStaff: null
      })
      session.currentWalkinJob = walkinJob._id
      session.currentQueueJob = null // Focus shift
      await session.save()

      request.status = 'APPROVED'
      request.resultJobId = walkinJob._id
      request.adminAction = adminAction || 'Approved by Admin'
      await request.save()

      eventBus.emit('walkin:approved', { requestId, job: walkinJob })
      return { request, job: walkinJob }
    } else {
      const walkinJob = await QueueJob.create({
        emailSubject: `Walk-in: ${request.description.substring(0, 50)}`,
        customerName: 'Walk-in Customer',
        mailBody: request.description,
        folderPath: '',
        type: 'WALKIN',
        status: 'QUEUED',
        assignedTo: null,
        assignedAt: null,
        pinnedToStaff: request.requestedBy._id
      })
      request.status = 'APPROVED'
      request.resultJobId = walkinJob._id
      request.adminAction = adminAction || 'Approved for offline queue'
      await request.save()

      eventBus.emit('walkin:approved', { requestId, job: walkinJob })
      // Audit: Initial creation log already handled in some places, but let's be explicit
      return { request, job: walkinJob }
    }

  } else if (request.type === 'REASSIGN') {
    const originalJob = await QueueJob.findById(request.jobId)
    if (!originalJob) throw new Error('Original job not found')

    // PRESERVE Staff Reason specifically during the admin handling
    const staffReason = originalJob.handoffNotes

    // Unified logic: Use reassignJob which handles session logic, ghost job prevention, and busy-target parking.
    const updatedJob = await reassignJob(
      request.jobId,
      request.requestedBy._id,
      targetStaffId || null,
      adminAction, // Use admin's action notes as the 'notes' field
      { forceMode: 'PARK', batchMode: true } // Approved requests default to PARK unless force-assigned manually elsewhere
    )

    // Ensure the staff reason is explicitly saved to its new home
    updatedJob.staffHandoffReason = staffReason
    await updatedJob.save()

    request.status = 'APPROVED'
    request.adminAction = adminAction || (targetStaffId ? 'Reassigned to specifically selected staff' : 'Returned to general pool')
    await request.save()

    eventBus.emit('reassign:approved', { requestId, jobId: request.jobId, targetStaffId })
    return { request, job: updatedJob }
  }
}

/**
 * Atomic Staff Request: Reassign the current job to Admin Review
 * frees the staff member and triggers their next assignment.
 */
async function requestReassignment(staffId, jobId, reason) {
  console.log(`[Engine] Incoming requestReassignment for job ${jobId} from staff ${staffId}. Reason: ${reason}`);
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')

  const customerEmail = job.customerEmail

  // Fetch Dynamic Logic from Config
  const config = await SystemConfig.findOne({ key: 'reassignment_reasons' })
  const reasons = config?.value || []
  const reasonConfig = reasons.find(r => r.label === reason)

  const session = await QueueSession.findOne({ staffId, isActive: true })

  // CASE 1: SELF-HOLD (No admin intervention)
  if (reasonConfig && reasonConfig.allowHold && !reasonConfig.requireReview) {
    job.status = 'PAUSED'
    job.pauseReason = reason
    // Keep assignedTo as current staff
    await job.save()

    if (session) {
      if (String(session.currentQueueJob) === String(jobId)) session.currentQueueJob = null
      if (String(session.currentWalkinJob) === String(jobId)) session.currentWalkinJob = null
      await session.save()
    }

    eventBus.emit('job:paused', { job, staffId })

    // Audit log
    await JobEvent.create({
      jobId,
      actionType: 'PAUSED',
      details: { action: 'SELF_HOLD', reason, staffId }
    }).catch(() => {})

    // Trigger next assignment so productivity doesn't drop
    assignNextJob(staffId).catch(err => console.error('[Engine] Auto-assign after self-hold failed:', err))

    return { status: 'PAUSED', job }
  }

  // CASE 2: ADMIN REVIEW (Traditional Handoff)
  // 2. Move job to Review
  job.status = 'ADMIN_REVIEW'
  job.assignedTo = null
  job.reassignedFrom = staffId
  job.handoffNotes = reason
  await job.save()

  // 2.5 BATCH HANDOFF: Un-pin other jobs from this customer so they also move to pool/review context
  if (customerEmail) {
    await QueueJob.updateMany(
      { customerEmail, pinnedToStaff: staffId, status: 'QUEUED' },
      { $set: { pinnedToStaff: null, continuityContext: `Liberated: Released for reassignment by ${session?.userName || 'previous handler'}` } }
    )
  }

  // 3. Create historical request record
  const qReq = await QueueRequest.create({
    type: 'REASSIGN',
    jobId,
    description: reason,
    requestedBy: staffId,
  })

  // 4. Emit event
  const populated = await QueueRequest.findById(qReq._id)
    .populate('requestedBy', 'name')
    .populate('jobId', 'customerName emailSubject')
  eventBus.emit('reassign:requested', {
    request: populated,
    fromStaffId: staffId
  })

  // 5. Trigger next assignment for this staff member
  assignNextJob(staffId).catch(err => console.error('[Engine] Auto-assign after reassign-request failed:', err))

  // Audit log
  await JobEvent.create({
    jobId,
    actionType: 'PAUSED',
    details: { action: 'REQUESTED_REASSIGNMENT', reason, staffId }
  }).catch(() => {})

  return { request: populated }
}

/**
 * Staff: Pause current active job
 */
async function pauseJob(staffId, jobId, pauseQueue = false, isHardPin = false, reason = '') {
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')
  if (String(job.assignedTo) !== String(staffId)) throw new Error('Not authorized for this job')
  if (!['ASSIGNED', 'IN_PROGRESS'].includes(job.status)) throw new Error('Job is not in an active state')

  const session = await QueueSession.findOne({ staffId, isActive: true })
  if (!session) throw new Error('No active session found')

  let holdUntil = null
  let holdBehavior = 'STAY_HOLD'

  if (reason) {
    const config = await SystemConfig.findOne({ key: 'hold_reasons' })
    const reasons = config?.value || []
    const reasonConfig = reasons.find(r => r.label === reason || r.id === reason)
    if (reasonConfig) {
      holdBehavior = reasonConfig.behavior || 'STAY_HOLD'
      if (reasonConfig.timeLimit && reasonConfig.timeLimit > 0) {
        holdUntil = new Date(Date.now() + reasonConfig.timeLimit * 60 * 1000)
      }
    }
  }

  job.status = 'PAUSED'
  job.pauseReason = reason || 'Manual Hold'
  job.holdUntil = holdUntil
  job.holdBehavior = holdBehavior

  if (isHardPin) {
    job.isHardPinned = true
    job.pinnedToStaff = staffId
  }
  await job.save()

  // Always clear the slot if this job was tracked (use String comparison safely)
  if (session.currentQueueJob && String(session.currentQueueJob) === String(jobId)) {
    session.currentQueueJob = null
    // If pauseQueue is true (Pause for Walk-in), we block auto-assignment to protect this staff member
    if (pauseQueue) {
      session.isQueuePaused = true
    }

    // BATCH SURVIVAL: If the paused job was part of a batch (has a customerEmail),
    // instantly promote the next queued job for that customer to keep the batch in the active workspace.
    if (job.customerEmail) {
      const nextInBatch = await QueueJob.findOne({
        pinnedToStaff: staffId,
        status: 'QUEUED',
        customerEmail: job.customerEmail
      }).sort({ createdAt: 1 })

      if (nextInBatch) {
        console.log(`[Engine] Batch Survival: Auto-promoting next job ${nextInBatch._id} for paused batch ${job.customerEmail}`)
        nextInBatch.status = 'IN_PROGRESS'
        nextInBatch.assignedTo = staffId
        nextInBatch.assignedAt = new Date()
        await nextInBatch.save()
        
        session.currentQueueJob = nextInBatch._id
        
        // Notify clients about the promotion so the UI updates seamlessly
        eventBus.emit('job:assigned', { job: nextInBatch, staffId, details: { isTransactional: true } })
      }
    }

    await session.save()
  }

  eventBus.emit('job:paused', { job, staffId })

  return job
}

/**
 * Staff: Resume a paused job
 */
async function resumeJob(staffId, jobId) {
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')
  if (String(job.assignedTo) !== String(staffId)) throw new Error('Not authorized for this job')

  const session = await QueueSession.findOne({ staffId, isActive: true })
  if (!session) throw new Error('No active session')
  
  // Smart Switch: Auto-pause any current job before resuming this one
  await parkActiveJobs(staffId, session)

  job.status = 'IN_PROGRESS'
  job.isHardPinned = false
  await job.save()

  session.currentQueueJob = job._id
  await session.save()

  eventBus.emit('job:resumed', { job, staffId })

  return job
}

/**
 * Try to assign jobs to any staff with empty slots.
 * Updated: Handles Queue and Walkin slots independently.
 */
async function assignIdleStaff() {
  const { User } = require('../repositories');
  const activeSessions = await QueueSession.find({ isActive: true });

  if (activeSessions.length === 0) return [];

  // FAIRNESS SORT: Longest idle first.
  // Fetch lastJobCompletedAt separately to avoid .populate() overwriting session.staffId
  // with a user object, which would break assignNextJob(staffId) calls below.
  const numericIds = activeSessions.map(s => Number(s.staffId)).filter(n => n > 0);
  const staffUsers = numericIds.length
    ? await User.find({ _id: { $in: numericIds } }).select('lastJobCompletedAt').lean()
    : [];
  const staffByIdMap = new Map(staffUsers.map(u => [Number(u.id || u._id), u]));

  activeSessions.sort((a, b) => {
    const timeA = new Date(staffByIdMap.get(Number(a.staffId))?.lastJobCompletedAt || 0).getTime();
    const timeB = new Date(staffByIdMap.get(Number(b.staffId))?.lastJobCompletedAt || 0).getTime();
    return timeA - timeB; // Ascending: Oldest timestamp (longest idle) first
  });

  const results = [];
  for (const session of activeSessions) {
    // session.staffId is always the original numeric ID — never a populated object
    const staffId = Number(session.staffId);
    if (!staffId) continue;
    try {
      // 1. Fill standard Queue slot if empty
      if (!session.currentQueueJob && !session.isQueuePaused) {
        const qJob = await assignNextJob(staffId);
        if (qJob) results.push({ staffId: qJob.assignedTo, jobId: qJob._id, slot: 'queue' });
      }

      // 2. Fill Walkin slot if empty
      if (!session.currentWalkinJob) {
        const wJob = await assignNextWalkin(staffId);
        if (wJob) results.push({ staffId: wJob.assignedTo, jobId: wJob._id, slot: 'walkin' });
      }
    } catch (err) {
      console.error(`[Engine] assignIdleStaff failed for ${staffId}:`, err.message);
    }
  }

  return results;
}

/**
 * Automatically cleanup any sessions that haven't sent a heartbeat.
 * Also recovers "Ghost Jobs" (assigned to offline staff).
 */
/**
 * Background Workload Syncer:
 * Calculates all pinned/held jobs for active sessions and saves them back to the DB.
 * This allows "Zombie" processes to see the same data as the active server.
 */
async function syncWorkloadToDb() {
  const sessions = await QueueSession.find({ isActive: true });
  if (!sessions.length) return;

  const staffIds = sessions.map(s => Number(s.staffId)).filter(n => n > 0);

  // 2 bulk reads instead of 2 reads per session
  const [allPinned, allPaused] = await Promise.all([
    QueueJob.find({ pinnedToStaff: { $in: staffIds }, status: 'QUEUED' })
      .select('pinnedToStaff customerName emailSubject type createdAt')
      .sort({ createdAt: 1 })
      .lean(),
    QueueJob.find({ assignedTo: { $in: staffIds }, status: 'PAUSED' })
      .select('assignedTo customerName emailSubject type updatedAt')
      .sort({ updatedAt: -1 })
      .lean()
  ]);

  // Group results by staffId in memory
  const pinnedByStaff = {};
  const pausedByStaff = {};
  for (const j of allPinned) {
    const sid = Number(j.pinnedToStaff);
    if (!pinnedByStaff[sid]) pinnedByStaff[sid] = [];
    if (pinnedByStaff[sid].length < 100)
      pinnedByStaff[sid].push({ _id: j._id, customerName: j.customerName || j.emailSubject || 'Unknown', type: j.type });
  }
  for (const j of allPaused) {
    const sid = Number(j.assignedTo);
    if (!pausedByStaff[sid]) pausedByStaff[sid] = [];
    if (pausedByStaff[sid].length < 100)
      pausedByStaff[sid].push({ _id: j._id, customerName: j.customerName || j.emailSubject || 'Unknown', type: j.type });
  }

  // Parallel writes — each session row is independent, no lock contention
  await Promise.all(sessions.map(async session => {
    try {
      const sid = Number(session.staffId);
      session.pinnedJobs = pinnedByStaff[sid] || [];
      session.pausedJobs = pausedByStaff[sid] || [];
      session.serverVersion = '1.0.6-trojan-sync';
      await session.save();
    } catch (err) {
      console.error(`[Syncer] Failed for staff ${session.staffId}:`, err.message);
    }
  }));
}

async function cleanupStaleSessions() {
  const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000);
  try {
    // 1. Finalize inactive sessions (including those with lastSeenAt: null that are older than 90 mins)
    const staleSessions = await QueueSession.find({
      isActive: true,
      $or: [
        { lastSeenAt: { $lt: ninetyMinsAgo } },
        { lastSeenAt: null, loginAt: { $lt: ninetyMinsAgo } }
      ]
    });
    for (const session of staleSessions) {
      await onStaffLogout(session.staffId, 'Inactivity (Heartbeat Timeout)');
    }

    // 1.5. Expired Hold Recovery: Find jobs in 'PAUSED' state with an expired hold timer
    const expiredHoldJobs = await QueueJob.find({
      status: 'PAUSED',
      holdUntil: { $ne: null, $lt: new Date() }
    });
    
    let expiredHoldCount = 0;
    const affectedStaffIds = []; // Track who held the returned jobs for real-time notifications
    for (const job of expiredHoldJobs) {
      if (job.holdBehavior === 'RETURN_TO_POOL') {
        console.log(`[Engine] Returning job ${job._id} to pool: hold timer expired`);
        
        // Capture the holder BEFORE clearing assignedTo — used for real-time socket notification
        const holderId = job.assignedTo ? String(job.assignedTo) : null;
        if (holderId) affectedStaffIds.push(holderId);

        // Remove from the assigned staff's session slots if active
        if (job.assignedTo) {
          const session = await QueueSession.findOne({ staffId: job.assignedTo, isActive: true });
          if (session) {
            if (String(session.currentQueueJob) === String(job._id)) session.currentQueueJob = null;
            if (String(session.currentWalkinJob) === String(job._id)) session.currentWalkinJob = null;
            await session.save();
          }
        }
        
        job.lastPausedBy = job.assignedTo; // Preserve who held it for the audit trail
        job.status = 'QUEUED';
        job.assignedTo = null;
        job.assignedAt = null;
        job.pinnedToStaff = null;
        job.isHardPinned = false;
        job.returnReason = `Hold Expired: ${job.pauseReason || 'Timer reached'}`;
        await job.save();
        expiredHoldCount++;
      } else {
        // STAY_HOLD behavior: does not return to pool. Just clear the timer so we don't process it again.
        job.holdUntil = null;
        await job.save();
      }
    }
    
    if (expiredHoldCount > 0) {
      // Pass affectedStaffIds so the event handler can immediately notify those staff sockets
      eventBus.emit('queue:reordered', { reason: 'Hold Timer Expired Recovery', affectedStaffIds: [...new Set(affectedStaffIds)] });
      assignIdleStaff().catch(() => {});
    }

    // 2. Ghost Job Recovery: single LEFT JOIN finds all jobs whose staff has no active session.
    // Replaces the previous N+1 (one session lookup per ghost job) with 2 queries total.
    const ghostRows = await prisma.$queryRaw`
      SELECT qj.id
      FROM   "QueueJob" qj
      LEFT JOIN "QueueSession" qs
        ON  qs."staffId" = qj."assignedToId"
        AND qs."isActive" = true
      WHERE qj.status IN ('ASSIGNED', 'IN_PROGRESS')
        AND qs.id IS NULL
      LIMIT 50
    `;
    let recoveredCount = 0;
    if (ghostRows.length > 0) {
      const ghostIds = ghostRows.map(r => Number(r.id));
      await prisma.queueJob.updateMany({
        where: { id: { in: ghostIds } },
        data: {
          status: 'QUEUED',
          assignedToId: null,
          assignedAt: null,
          returnReason: 'System Recovery (Ghost Job Detected)',
          updatedAt: new Date()
        }
      });
      recoveredCount = ghostIds.length;
      console.log(`[Engine] Ghost recovery: cleared ${recoveredCount} jobs`);
    }
    if (recoveredCount > 0) {
      eventBus.emit('queue:reordered', { reason: 'Ghost Job Recovery' });
    }

    // 2.5 Safety Release: clear pins for staff who have been offline 2+ hours.
    // Single query: LEFT JOIN active sessions + check last-seen on any session — replaces N+1.
    const stalePinRows = await prisma.$queryRaw`
      SELECT qj.id
      FROM   "QueueJob" qj
      LEFT JOIN "QueueSession" active
        ON  active."staffId" = qj."pinnedToStaffId"
        AND active."isActive" = true
      WHERE qj.status = 'QUEUED'
        AND qj."pinnedToStaffId" IS NOT NULL
        AND active.id IS NULL
        AND qj."updatedAt" < NOW() - INTERVAL '2 hours'
        AND NOT EXISTS (
          SELECT 1 FROM "QueueSession" recent
          WHERE recent."staffId"   = qj."pinnedToStaffId"
            AND recent."lastSeenAt" > NOW() - INTERVAL '2 hours'
        )
      LIMIT 100
    `;
    let releasedPins = 0;
    if (stalePinRows.length > 0) {
      const pinIds = stalePinRows.map(r => Number(r.id));
      await prisma.queueJob.updateMany({
        where: { id: { in: pinIds } },
        data: { pinnedToStaffId: null, updatedAt: new Date() }
      });
      releasedPins = pinIds.length;
    }
    if (releasedPins > 0) {
      eventBus.emit('queue:reordered', { reason: 'Stale Pin Release' });
    }

    // 3. Ingestion Recovery
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    await IngestionTask.updateMany(
      { status: 'PROCESSING', updatedAt: { $lt: tenMinsAgo } },
      { $set: { status: 'PENDING', error: 'Stale Task Recovered' } }
    );

    // 3.5 Ghost Folder Recovery — uses non-blocking fs.promises.access so the
    // event loop is not frozen while the filesystem is checked.
    const ghostCheckJobs = await QueueJob.find(
      { status: { $in: ['ADMIN_REVIEW', 'QUEUED'] }, folderPath: { $ne: '' } }
    ).select('_id folderPath').limit(200);

    const missingIds = (
      await Promise.all(
        ghostCheckJobs.map(async j => {
          if (!j.folderPath || !j.folderPath.trim()) return null;
          try { await fs.promises.access(j.folderPath); return null; }
          catch { return j._id; }
        })
      )
    ).filter(Boolean);

    let wipedGhosts = 0;
    if (missingIds.length > 0) {
      await QueueJob.deleteMany({ _id: { $in: missingIds } });
      wipedGhosts = missingIds.length;
    }
    if (wipedGhosts > 0) {
      eventBus.emit('queue:reordered', { reason: 'Ghost Folder Sweep' });
    }

    // 4. Stats Update
    const now = new Date();
    const [br15, br5, stale] = await Promise.all([
      QueueJob.countDocuments({ status: { $in: ['QUEUED', 'ASSIGNED', 'IN_PROGRESS'] }, dueBy: { $gte: now, $lte: new Date(Date.now() + 15 * 60 * 1000) } }),
      QueueJob.countDocuments({ status: { $in: ['QUEUED', 'ASSIGNED', 'IN_PROGRESS'] }, dueBy: { $gte: now, $lte: new Date(Date.now() + 5 * 60 * 1000) } }),
      QueueJob.countDocuments({ status: 'QUEUED', createdAt: { $lt: new Date(Date.now() - 2 * 60 * 60 * 1000) } })
    ]);
    await QueueStats.findOneAndUpdate({}, { breachRisk15: br15, breachRisk5: br5, staleJobs: stale, lastUpdated: new Date() });
    

    // 4.5 Chat Purge
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    await QueueMessage.deleteMany({ timestamp: { $lt: twelveHoursAgo } });

  } catch (err) {
    console.error('[QueueEngine] Cleanup error:', err.message);
  }
}


/**
 * Staff: Toggle personal queue Auto-Assign block
 */
async function toggleQueuePause(staffId, isPaused) {
  const session = await QueueSession.findOne({ staffId, isActive: true })
  if (!session) throw new Error('No active session found')

  session.isQueuePaused = isPaused
  await session.save()

  // If they unpaused their queue and they are currently idle, immediately assign them a job!
  if (!isPaused && !session.currentQueueJob) {
    await assignNextJob(staffId).catch(err => console.error('[Engine] Auto-assign failed upon unpause', err))
  }

  // Publish session update to admin hub
  const sessions = await QueueSession.find({ isActive: true }).populate('staffId', 'name')
  eventBus.emit('state:sync', { sessions })

  return session
}

/**
 * Boost priority of jobs sitting in QUEUED for too long.
 * Increases priorityScore by 1 for every 30 mins of wait time.
 */
async function escalatePriorities() {
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000)

  // Find jobs that haven't been boosted recently or were created long ago
  // We'll use a simple logic: if (currentTime - createdAt) > (priorityScore + 1) * 30 mins, boost it.
  // This ensures that eventually even a priority 0 job gets boosted.
  // Only process top 100 stalest jobs to prevent DB overhead
  const stallJobs = await QueueJob.find({
    status: 'QUEUED',
    createdAt: { $lt: thirtyMinsAgo }
  })
    .sort({ createdAt: 1 })
    .limit(100)

  let boostedCount = 0
  for (const job of stallJobs) {
    const minutesWaiting = (Date.now() - job.createdAt.getTime()) / (1000 * 60)
    const expectedBoost = Math.floor(minutesWaiting / 30)

    // If the job's priority hasn't reached the "escalated" level yet, boost it
    if (job.priorityScore < expectedBoost) {
      job.priorityScore = expectedBoost
      await job.save()
      boostedCount++
    }
  }

  if (boostedCount > 0) {
    console.log(`[QueueEngine] Escalated priority for ${boostedCount} stale jobs.`)
    eventBus.emit('queue:reordered', { reason: 'Priority Escalation' })
  }
}

/**
 * Safely and recursively removes empty parent directories up to a specific root landing zone.
 * Use with caution: only deletes IF the directory is 100% empty.
 */
function removeEmptyParentsRecursive(dir, watchRoot) {

  if (!dir || !watchRoot) return
  const absoluteDir = path.resolve(dir)
  const absoluteRoot = path.resolve(watchRoot)

  // Hard Stop: Do not navigate above or outside the intake root landing zone
  if (!absoluteDir.startsWith(absoluteRoot) || absoluteDir === absoluteRoot) return

  try {
    if (fs.existsSync(absoluteDir) && fs.readdirSync(absoluteDir).length === 0) {
      fs.rmdirSync(absoluteDir)
      // Bubble Up: Recurse to the parent directory
      removeEmptyParentsRecursive(path.dirname(absoluteDir), watchRoot)
    }
  } catch (err) {
    // Cautious Stop: If any error occurs (permissions, non-empty, etc), stop recursion immediately
  }
}

/**
 * Staff: Take any pinned job (Email or Walk-in)
 * @param {string} staffId
 * @param {string} jobId
 * @param {boolean} takeAll - If true, pins all other waiting jobs from this customer
 */
async function takeJob(staffId, jobId, takeAll = false) {
  if (jobId === 'NEXT') {
    const session = await QueueSession.findOne({ staffId, isActive: true })
    if (!session) throw new Error('No active session found. Please enter the queue first.')
    const job = await assignNextJob(staffId, session, { force: true });
    if (!job) throw new Error('No jobs available in the queue.');
    return { job, previousOwnerName: null };
  }

  const lockKey = String(staffId);
  if (assignmentLocks.has(lockKey)) {
    throw new Error('LOCK_CONFLICT: An assignment is already in progress for this staff member. Please try again in a moment.');
  }
  assignmentLocks.add(lockKey);

  try {
    const session = await QueueSession.findOne({ staffId, isActive: true })
    if (!session) throw new Error('No active session found. Please enter the queue first.')

    // 1. Validate the target job
    const job = await QueueJob.findById(jobId)
    if (!job) throw new Error('Job not found.')

    const prevStatus = job.status;
    const oldAssignedTo = job.assignedTo;
    
    // Status safety: Only allow taking jobs that are QUEUED, ASSIGNED (if by same staff), PAUSED, or ADMIN_REVIEW
    if (job.status !== 'QUEUED' && job.status !== 'PAUSED' && job.status !== 'ADMIN_REVIEW' && (job.status !== 'ASSIGNED' || String(job.assignedTo) !== String(staffId))) {
       throw new Error(`Job is already being handled by someone else (Status: ${job.status})`);
    }

    // 2. Auto-Pause any current active job before starting this new one
    await parkActiveJobs(staffId, session)

    // Clear cross-staff assignment if needed
    const oldOwnerId = job.assignedTo || job.pinnedToStaff;
    if (oldOwnerId && String(oldOwnerId) !== String(staffId)) {
        const oldSession = await QueueSession.findOne({ staffId: oldOwnerId, isActive: true });
        if (oldSession) {
            if (String(oldSession.currentQueueJob) === String(job._id)) oldSession.currentQueueJob = null;
            if (String(oldSession.currentWalkinJob) === String(job._id)) oldSession.currentWalkinJob = null;
            await oldSession.save();
        }
        
        // Emit takeover event before overwriting job fields
        eventBus.emit('job:taken-by-other', { 
            jobId: job.id || job._id, 
            newStaffId: staffId, 
            oldStaffId: oldOwnerId 
        });
    }

    // 3. Capture previous owner info for notification enrichment
    let previousOwnerName = null;
    if (oldOwnerId && String(oldOwnerId) !== String(staffId)) {
        const { User } = require('../repositories');
        const oldStaff = await User.findById(oldOwnerId).select('name').lean();
        previousOwnerName = oldStaff?.name || 'Another Staff';
    }

    // 4. Update the target job status
    job.status = 'IN_PROGRESS'
    job.assignedTo = staffId
    job.assignedAt = new Date()
    job.pinnedToStaff = null; // Always clear pin when taken
    job.isHardPinned = false; // Reset hard pin when taken
    await job.save()

    // 5. Update session slots (Strict One-Job-At-A-Time)
    if (job.type === 'WALKIN') {
      session.currentWalkinJob = job._id
      session.currentQueueJob = null // Focus shift
    } else {
      session.currentQueueJob = job._id
      session.currentWalkinJob = null // Focus shift
    }
    await session.save()

    // 6. BATCH MANAGEMENT: Conditionally pin/transfer all other active jobs from this same customer
    if (takeAll && (job.customerEmail || job.customerPhone)) {
      // A. Pin all other QUEUED jobs of this customer
      const queuedBatchFilter = { 
        _id: { $ne: job._id },
        status: 'QUEUED'
      };
      if (job.customerEmail) queuedBatchFilter.customerEmail = job.customerEmail;
      else if (job.customerPhone) queuedBatchFilter.customerPhone = job.customerPhone;

      await QueueJob.updateMany(
        queuedBatchFilter,
        { 
          $set: { 
            pinnedToStaff: staffId,
            continuityContext: (job.continuityContext || '') + ` [Batch Take: Sequential Batching with Job #${String(job._id).slice(-6).toUpperCase()}]`
          } 
        }
      );

      // B. Transfer all other PAUSED jobs of this customer
      const pausedBatchFilter = {
        _id: { $ne: job._id },
        status: 'PAUSED'
      };
      if (job.customerEmail) pausedBatchFilter.customerEmail = job.customerEmail;
      else if (job.customerPhone) pausedBatchFilter.customerPhone = job.customerPhone;

      await QueueJob.updateMany(
        pausedBatchFilter,
        {
          $set: {
            assignedTo: staffId,
            pinnedToStaff: staffId,
            continuityContext: (job.continuityContext || '') + ` [Batch Take Transfer: Sequential Batching with Job #${String(job._id).slice(-6).toUpperCase()}]`
          }
        }
      );

      eventBus.emit('job:batch-reserved', { customerEmail: job.customerEmail, staffId });
    }

    // Continuity: Resume any already-pinned jobs that were paused (always good practice)
    if (job.customerEmail) {
      await QueueJob.updateMany(
        { 
          customerEmail: job.customerEmail, 
          _id: { $ne: job._id },
          status: 'PAUSED',
          pinnedToStaff: staffId
        },
        { $set: { status: 'ASSIGNED' } }
      );
    }

    // 7. Audit Logging via Event Emission
    if (prevStatus === 'PAUSED') {
      eventBus.emit('job:resumed', { job, staffId })
    } else {
      // Log as ASSIGNED with Find Job details
      eventBus.emit('job:assigned', { 
        job, 
        staffId, 
        details: { 
          manualPick: true, 
          viaFindJob: true,
          slot: job.type === 'WALKIN' ? 'walkin' : 'queue' 
        } 
      });
    }

    return { job, previousOwnerName }
  } finally {
    assignmentLocks.delete(lockKey);
  }
}

module.exports = {
  assignNextJob,
  onJobComplete,
  onStaffLogin,
  onStaffLogout,
  reorderQueue,
  pinJob,
  unpinJob,
  reassignJob,
  handleRequest,
  requestReassignment,
  recalculateStats: statsService.recalculate,
  pauseJob,
  resumeJob,
  takeJob,
  assignIdleStaff,
  cleanupStaleSessions,
  toggleQueuePause,
  retrieveJob,
  handleNewJobArrival,
  syncWorkloadToDb
}

/**
 * Admin: Retrieve a completed job back to the queue.
 */
async function retrieveJob(jobId, toStaffId = null) {
  const job = await QueueJob.findById(jobId);
  if (!job) throw new Error('Job not found');
  if (job.status !== 'COMPLETED' && job.status !== 'DISPATCHED') {
    throw new Error('Only completed or dispatched jobs can be retrieved');
  }

  // 1. Move folder back if archived
  if (job.type === 'EMAIL' && job.folderPath) {
    try {
      const archiveRoot = process.env.COMPLETED_JOBS_PATH;
      const watchRoot = process.env.N8N_WATCH_PATH;

      if (archiveRoot && watchRoot && job.folderPath.includes(archiveRoot)) {
        // Calculate original path
        const relativePath = path.relative(archiveRoot, job.folderPath);
        const targetPath = path.join(watchRoot, relativePath);

        if (!fs.existsSync(path.dirname(targetPath))) {
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        }

        try {
          fs.renameSync(job.folderPath, targetPath);
        } catch (renameErr) {
          if (renameErr.code === 'EXDEV') {
            const copyDir = (src, dest) => {
              fs.mkdirSync(dest, { recursive: true });
              const entries = fs.readdirSync(src, { withFileTypes: true });
              for (let entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) copyDir(srcPath, destPath);
                else fs.copyFileSync(srcPath, destPath);
              }
            };
            copyDir(job.folderPath, targetPath);
            fs.rmSync(job.folderPath, { recursive: true, force: true });
          } else {
            throw renameErr;
          }
        }
        
        job.folderPath = targetPath;
        job.relativeFolderPath = path.relative(path.dirname(watchRoot), targetPath).replace(/\\/g, '/');
      }
    } catch (err) {
      console.error(`[Retrieve Archive Error] Job ${jobId}:`, err.message);
    }
  }

  // 2. Reset Status & Cleanup
  // Logic Guardian: Only allow PAUSED if we have a target staff member. Otherwise, it MUST be QUEUED.
  job.status = toStaffId ? 'PAUSED' : 'QUEUED';
  job.assignedTo = toStaffId || null;
  job.pinnedToStaff = toStaffId || null;
  job.isHardPinned = false; // Reset hard pin on retrieval
  
  job.completedAt = null;
  job.completedBy = null;
  job.dispatchedAt = null;
  job.dispatchedBy = null;
  
  // Clear any version history flags if needed
  job.isSuperseded = false;
  
  await job.save();

  // 3. Schedule stats refresh
  statsService.schedule();

  eventBus.emit('queue:reordered', { reason: 'Job Retrieved by Admin' });
  
  // Audit log
  await JobEvent.create({
    jobId: job._id,
    actionType: 'CREATED', // Treat retrieval as a re-entry/re-creation in the pool
    details: { 
      action: 'ADMIN_RETRIEVED',
      previousStatus: 'COMPLETED',
      pinnedTo: toStaffId 
    }
  }).catch(() => {});

  return job;
}

/**
 * Smart Batch Affinity:
 * Detects if a new job belongs to a customer currently handled by a staff member.
 * If so, pins the job to them and emits a real-time event.
 */
async function handleNewJobArrival(jobId) {
  const job = await QueueJob.findById(jobId);
  if (!job || !job.customerEmail) return;

  // Find if anyone is currently working on this customer
  const activeStaffJob = await QueueJob.findOne({
    customerEmail: job.customerEmail,
    status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] },
    assignedTo: { $ne: null },
    _id: { $ne: job._id }
  });

  if (activeStaffJob && activeStaffJob.assignedTo) {
    const staffId = activeStaffJob.assignedTo;
    
    // Pin to this staff immediately
    job.pinnedToStaff = staffId;
    job.continuityContext = (job.continuityContext || '') + ` [Batch Affinity: Auto-linked to active designer]`;
    await job.save();

    // Notify the frontend via eventBus -> socket
    eventBus.emit('batch:new-job', { 
      staffId, 
      job, 
      customerName: job.customerName 
    });
    
    console.log(`[Engine] Batch Affinity: Job ${jobId} auto-pinned to active staff ${staffId}`);
  }
}

