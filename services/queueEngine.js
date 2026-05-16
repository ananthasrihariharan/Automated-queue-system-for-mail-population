/**
 * Queue Engine — Core blind assignment logic
 * 
 * Handles FIFO job assignment with priority sorting,
 * pin-aware skipping, and parallel walk-in slots.
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const QueueJob = require('../models/QueueJob')
const QueueSession = require('../models/QueueSession')
const CustomerPreference = require('../models/CustomerPreference')
const QueueRequest = require('../models/QueueRequest')
const SystemConfig = require('../models/SystemConfig')
const JobEvent = require('../models/JobEvent')
const IngestionTask = require('../models/IngestionTask')
const QueueStats = require('../models/QueueStats')
const QueueMessage = require('../models/QueueMessage')
const eventBus = require('./eventBus')
const statsService = require('./statsService')

/**
 * Per-staff in-memory assignment lock.
 * Prevents concurrent assignNextJob(staffId) calls from double-assigning
 * the same staff member when event sweeps fire simultaneously.
 */
const assignmentLocks = new Set()

/**
 * Global assignment semaphore.
 * Ensures that only one assignment cycle is actively evaluating candidates at a time.
 * This is crucial for protecting the "Clash Shield" logic when multiple staff members
 * request jobs simultaneously for the same customer.
 */
let assignmentSema = false;

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

async function assignNextJob(staffId, existingSession = null) {
  const lockKey = String(staffId)

  // 1. Stale Lock Protection: If the semaphore has been held for > 30s, assume it's stuck and release.
  const now = Date.now();
  if (assignmentSema && (now - assignmentSemaTimestamp > 30000)) {
    console.warn(`[Engine] STALE SEMAPHORE DETECTED (Held for ${Math.round((now - assignmentSemaTimestamp)/1000)}s). Forcing release.`);
    assignmentSema = false;
  }

  // Per-staff lock: if an assignment is already in-flight for this staff member,
  // bail out immediately to prevent concurrent double-assignment races.
  if (assignmentLocks.has(lockKey)) {
    console.log(`[Engine] Lock: assignNextJob already in-flight for staff ${lockKey}, skipping.`)
    return null
  }
  if (assignmentSema) return null; // Global across-all-staff lock to protect search logic
  
  assignmentSema = true;
  assignmentSemaTimestamp = Date.now();
  assignmentLocks.add(lockKey)

  try {
    const session = existingSession || await QueueSession.findOne({ staffId, isActive: true })
    if (!session) return null
    if (session.isQueuePaused) return null

    // Auto-Pause Guardian: If they already have an active job, park it before assigning a new one!
    if (session.currentQueueJob || session.currentWalkinJob) {
      await parkActiveJobs(staffId, session)
    }


    // 1.1 Find all customer identities currently being handled by OTHER staff (Clash Shield)
    const [clashedEmails, clashedPhones] = await Promise.all([
      QueueJob.find({
        status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] },
        assignedTo: { $ne: staffId },
        customerEmail: { $ne: null }
      }).distinct('customerEmail'),
      QueueJob.find({
        status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] },
        assignedTo: { $ne: staffId },
        customerPhone: { $ne: null }
      }).distinct('customerPhone')
    ])

    // 1.2 Find the single best candidate that respects ALL rules (Priority, Pin, Clash Shield)
    const jobCandidate = await QueueJob.findOne({
      status: 'QUEUED',
      type: { $ne: 'WALKIN' },
      $or: [
        { pinnedToStaff: staffId },
        { pinnedToStaff: null, reassignedFrom: { $ne: staffId } }
      ],
      // Multi-layer Clash Shield
      $and: [
        { customerEmail: { $nin: clashedEmails } },
        { customerPhone: { $nin: clashedPhones } }
      ]
    }).sort({ pinnedToStaff: -1, priorityScore: -1, queuePosition: 1, createdAt: 1 })
      .select('_id customerEmail customerPhone')

    if (!jobCandidate) return null;

    // 1.3 Atomic Assignment
    const job = await QueueJob.findOneAndUpdate(
      { _id: jobCandidate._id, status: 'QUEUED' },
      { $set: { status: 'ASSIGNED', assignedTo: staffId, assignedAt: new Date() } },
      { new: true }
    )

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
          continuityContext: (job.continuityContext || '') + ` [Auto-reserved: Sequential Batching with Job #${job._id.toString().substring(18).toUpperCase()}]`
        }
      }
    )
    
    eventBus.emit('job:batch-reserved', { 
      customerEmail: job.customerEmail, 
      customerPhone: job.customerPhone,
      staffId 
    })

    // 1.5 Update Session — ATOMIC DB-level claim
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
    // Always release the locks, even on error, so the staff member can be re-attempted
    assignmentLocks.delete(lockKey)
    assignmentSema = false;
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

    // Find the best walk-in candidate
    // Priority: Pinned to this staff -> Unpinned general walk-ins -> FIFO
    const jobCandidate = await QueueJob.findOne({
      status: 'QUEUED',
      type: 'WALKIN',
      $or: [
        { pinnedToStaff: staffId },
        { pinnedToStaff: null }
      ]
    }).sort({ pinnedToStaff: -1, priorityScore: -1, createdAt: 1 });

    if (!jobCandidate) return null;

    // Atomic claim
    const job = await QueueJob.findOneAndUpdate(
      { _id: jobCandidate._id, status: 'QUEUED' },
      { $set: { status: 'ASSIGNED', assignedTo: staffId, assignedAt: new Date() } },
      { new: true }
    );

    if (!job) return null;

    // Update Session — ATOMIC DB-level claim
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
    require('../models/User').findByIdAndUpdate(staffId, { lastJobCompletedAt: new Date() })
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
  eventBus.emit('job:completed', { jobId: job._id, staffId })
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
async function onStaffLogin(staffId) {
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
    require('../models/User').findByIdAndUpdate(staffId, { lastJobCompletedAt: new Date() })
  ]);

  const job = await assignNextJob(staffId)
  eventBus.emit('session:started', { staffId, sessionId: session._id })

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
      job.pinnedToStaff = isManualLogout ? null : staffId 
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
    pJob.pinnedToStaff = isManualLogout ? null : staffId 
    if (reason) pJob.returnReason = reason
    await pJob.save()
  }

  if (session.currentWalkinJob) {
    const walkinJob = await QueueJob.findById(session.currentWalkinJob)
    if (walkinJob && ['ASSIGNED', 'IN_PROGRESS'].includes(walkinJob.status)) {
      walkinJob.status = 'QUEUED'
      walkinJob.assignedTo = null
      walkinJob.assignedAt = null
      walkinJob.pinnedToStaff = isManualLogout ? null : (walkinJob.pinnedToStaff || staffId)
      if (reason) walkinJob.returnReason = reason
      await walkinJob.save()
    }
  }

  session.isActive = false
  session.logoutAt = new Date()
  session.currentQueueJob = null
  session.currentWalkinJob = null
  await session.save()

  eventBus.emit('session:ended', { staffId, sessionId: session._id, reason })

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
    await statsService.recalculate().catch(err => console.error('[pin-review] stats recalc failed:', err.message))
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
          oldActiveJob.returnReason = `Interrupted by forced admin handoff (#${job._id.toString().substring(18)})`
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
    }
  } else {
    // 2.5 Logic Guardian: Return to general pool if no owner is assigned
    job.status = 'QUEUED'
    job.assignedTo = null
    job.assignedAt = null
    job.pinnedToStaff = null
  }

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

        // Ensure stats and dashboard are synced
        await statsService.recalculate()

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
async function pauseJob(staffId, jobId, pauseQueue = false) {
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')
  if (String(job.assignedTo) !== String(staffId)) throw new Error('Not authorized for this job')
  if (!['ASSIGNED', 'IN_PROGRESS'].includes(job.status)) throw new Error('Job is not in an active state')

  const session = await QueueSession.findOne({ staffId, isActive: true })
  if (!session) throw new Error('No active session found')

  job.status = 'PAUSED'
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
  const User = require('../models/User');
  const activeSessions = await QueueSession.find({ isActive: true })
    .populate('staffId', 'lastJobCompletedAt');

  // FAIRNESS SORT: Longest idle first
  activeSessions.sort((a, b) => {
    const staffA = a.staffId;
    const staffB = b.staffId;
    const timeA = new Date(staffA?.lastJobCompletedAt || 0).getTime();
    const timeB = new Date(staffB?.lastJobCompletedAt || 0).getTime();
    return timeA - timeB; // Ascending: Oldest timestamp (longest idle) first
  });

  const results = [];
  for (const session of activeSessions) {
    try {
      // 1. Fill standard Queue slot if empty
      if (!session.currentQueueJob && !session.isQueuePaused) {
        const qJob = await assignNextJob(session.staffId);
        if (qJob) results.push({ staffId: qJob.assignedTo, jobId: qJob._id, slot: 'queue' });
      }

      // 2. Fill Walkin slot if empty
      if (!session.currentWalkinJob) {
        const wJob = await assignNextWalkin(session.staffId);
        if (wJob) results.push({ staffId: wJob.assignedTo, jobId: wJob._id, slot: 'walkin' });
      }
    } catch (err) {
      console.error(`[Engine] assignIdleStaff failed for ${session.staffId}:`, err.message);
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
  for (const session of sessions) {
    try {
      const staffIdStr = session.staffId.toString();
      const staffIdObj = mongoose.Types.ObjectId.isValid(staffIdStr) ? new mongoose.Types.ObjectId(staffIdStr) : null;
      const idQuery = staffIdObj ? { $in: [staffIdObj, staffIdStr] } : staffIdStr;

      const [pinned, paused] = await Promise.all([
        QueueJob.find({ 
          pinnedToStaff: idQuery, 
          status: { $regex: /^QUEUED$/i } 
        })
          .select('jobId customerName emailSubject type createdAt')
          .sort({ createdAt: 1 })
          .limit(100)
          .lean(),
        QueueJob.find({ 
          assignedTo: idQuery, 
          status: { $regex: /^PAUSED$/i } 
        })
          .select('jobId customerName emailSubject type updatedAt')
          .sort({ updatedAt: -1 })
          .limit(100)
          .lean()
      ]);

      session.pinnedJobs = (pinned || []).map(j => ({
        _id: j._id,
        jobId: j.jobId,
        customerName: j.customerName || j.emailSubject || 'Unknown',
        type: j.type
      }));

      session.pausedJobs = (paused || []).map(j => ({
        _id: j._id,
        jobId: j.jobId,
        customerName: j.customerName || j.emailSubject || 'Unknown',
        type: j.type
      }));

      session.serverVersion = '1.0.6-trojan-sync';
      await session.save();
    } catch (err) {
      console.error(`[Syncer] Failed for staff ${session.staffId}:`, err.message);
    }
  }
}

async function cleanupStaleSessions() {
  const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000);
  try {
    // 1. Finalize inactive sessions
    const staleSessions = await QueueSession.find({
      isActive: true,
      lastSeenAt: { $lt: ninetyMinsAgo }
    });
    for (const session of staleSessions) {
      await onStaffLogout(session.staffId, 'Inactivity (Heartbeat Timeout)');
    }

    // 2. Ghost Job Recovery: Find jobs stuck in 'IN_PROGRESS' or 'ASSIGNED' with no active session
    // UPDATED: Now respects "Batch Stream" — don't recover if part of an active session's batch!
    const ghostJobs = await QueueJob.find({ status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } });
    let recoveredCount = 0;
    for (const job of ghostJobs) {
      const session = await QueueSession.findOne({ staffId: job.assignedTo, isActive: true });
      
      let isActuallyActive = false;
      if (session) {
        const isInSlot = (String(session.currentQueueJob) === String(job._id) || String(session.currentWalkinJob) === String(job._id));
        
        // BATCH AWARENESS: Even if not in slot, is it part of the active batch for this session?
        // If the session has an active queue job, check if this ghost job shares the same customerEmail
        let isInBatch = false;
        if (!isInSlot && session.currentQueueJob && job.customerEmail) {
            const activeQueueJob = await QueueJob.findById(session.currentQueueJob);
            if (activeQueueJob && activeQueueJob.customerEmail === job.customerEmail) {
                isInBatch = true;
            }
        }
        
        if (isInSlot || isInBatch) {
            isActuallyActive = true;
        }
      }

      if (!isActuallyActive) {
        console.log(`[Engine] Recovering ghost job ${job._id} (Assigned to ${job.assignedTo} who is offline/idle)`);
        job.status = 'QUEUED';
        job.assignedTo = null;
        job.assignedAt = null;
        job.returnReason = 'System Recovery (Ghost Job Detected)';
        await job.save();
        recoveredCount++;

        if (session) {
          if (job.type === 'EMAIL') session.currentQueueJob = null;
          else session.currentWalkinJob = null;
          await session.save();
        }
      }
    }
    if (recoveredCount > 0) {
      eventBus.emit('queue:reordered', { reason: 'Ghost Job Recovery' });
    }

    // 2.5 Safety Release: Clear pins for offline staff
    const twoHoursAgoLimit = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const stalePinnedJobs = await QueueJob.find({ status: 'QUEUED', pinnedToStaff: { $ne: null } });
    let releasedPins = 0;
    for (const pJob of stalePinnedJobs) {
      const activeSession = await QueueSession.findOne({ staffId: pJob.pinnedToStaff, isActive: true });
      if (!activeSession) {
        const lastSession = await QueueSession.findOne({ staffId: pJob.pinnedToStaff }).sort({ lastSeenAt: -1 });
        if (!lastSession || lastSession.lastSeenAt < twoHoursAgoLimit) {
          pJob.pinnedToStaff = null;
          pJob.continuityContext = (pJob.continuityContext || '') + ' [System: Pin released due to staff inactivity]';
          await pJob.save();
          releasedPins++;
        }
      }
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

    // 3.5 Ghost Folder Recovery
    const ghostCheckJobs = await QueueJob.find({ status: { $in: ['ADMIN_REVIEW', 'QUEUED'] } });
    let wipedGhosts = 0;
    for (const j of ghostCheckJobs) {
      if (j.folderPath && j.folderPath.trim() !== '' && !fs.existsSync(j.folderPath)) {
        await QueueJob.findByIdAndDelete(j._id);
        wipedGhosts++;
      }
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
  const lockKey = String(staffId);
  if (assignmentLocks.has(lockKey)) return null;
  assignmentLocks.add(lockKey);

  try {
    const session = await QueueSession.findOne({ staffId, isActive: true })
    if (!session) throw new Error('No active session found. Please enter the queue first.')

    // 1. Validate the target job
    const job = await QueueJob.findById(jobId)
    if (!job) throw new Error('Job not found.')

    const prevStatus = job.status;
    const oldAssignedTo = job.assignedTo;
    
    // Status safety: Only allow taking jobs that are QUEUED, ASSIGNED (if by same staff), or PAUSED
    if (job.status !== 'QUEUED' && job.status !== 'PAUSED' && (job.status !== 'ASSIGNED' || String(job.assignedTo) !== String(staffId))) {
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
            jobId: job._id, 
            newStaffId: staffId, 
            oldStaffId: oldOwnerId 
        });
    }

    // 3. Capture previous owner info for notification enrichment
    let previousOwnerName = null;
    if (oldOwnerId && String(oldOwnerId) !== String(staffId)) {
        const User = require('../models/User');
        const oldStaff = await User.findById(oldOwnerId).select('name').lean();
        previousOwnerName = oldStaff?.name || 'Another Staff';
    }

    // 4. Update the target job status
    job.status = 'IN_PROGRESS'
    job.assignedTo = staffId
    job.assignedAt = new Date()
    job.pinnedToStaff = null; // Always clear pin when taken
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

    // 6. BATCH MANAGEMENT: Conditionally pin all other waiting jobs from this same customer
    if (takeAll && (job.customerEmail || job.customerPhone)) {
      const batchFilter = { 
        _id: { $ne: job._id },
        status: 'QUEUED',
        pinnedToStaff: null
      };
      
      if (job.customerEmail) batchFilter.customerEmail = job.customerEmail;
      else if (job.customerPhone) batchFilter.customerPhone = job.customerPhone;

      await QueueJob.updateMany(
        batchFilter,
        { 
          $set: { 
            pinnedToStaff: staffId,
            continuityContext: (job.continuityContext || '') + ` [Batch Take: Sequential Batching with Job #${job._id.toString().substring(18).toUpperCase()}]`
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
  
  job.completedAt = null;
  job.completedBy = null;
  job.dispatchedAt = null;
  job.dispatchedBy = null;
  
  // Clear any version history flags if needed
  job.isSuperseded = false;
  
  await job.save();

  // 3. Recalculate stats
  await statsService.recalculate();

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
