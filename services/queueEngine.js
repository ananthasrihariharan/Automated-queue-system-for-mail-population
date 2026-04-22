/**
 * Queue Engine — Core blind assignment logic
 * 
 * Handles FIFO job assignment with priority sorting,
 * pin-aware skipping, and parallel walk-in slots.
 */

const mongoose = require('mongoose')
const QueueJob = require('../models/QueueJob')
const QueueSession = require('../models/QueueSession')
const CustomerPreference = require('../models/CustomerPreference')
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
 * Get the next available job for a specific staff member.
 * Respects: priority sort → FIFO → pin rules.
 */
async function getNextJobForStaff(staffId) {
  const job = await QueueJob.findOne({
    status: 'QUEUED',
    $or: [
      { pinnedToStaff: staffId },
      { pinnedToStaff: null }
    ]
  }).sort({ pinnedToStaff: -1, priorityScore: -1, queuePosition: 1, createdAt: 1 })

  return job
}

/**
 * Assign the next available job to a staff member.
 * Called when: staff logs in, staff completes a job, or new job enters queue.
 */
async function assignNextJob(staffId) {
  const lockKey = String(staffId)

  // Per-staff lock: if an assignment is already in-flight for this staff member,
  // bail out immediately to prevent concurrent double-assignment races.
  if (assignmentLocks.has(lockKey)) {
    console.log(`[Engine] Lock: assignNextJob already in-flight for staff ${lockKey}, skipping.`)
    return null
  }
  if (assignmentSema) return null; // Global across-all-staff lock to protect search logic
  assignmentSema = true;
  assignmentLocks.add(lockKey)

  try {
    const session = await QueueSession.findOne({ staffId, isActive: true })
    if (!session) return null
    if (session.isQueuePaused) return null

    // Safety: If they already have a job, return it instead of creating a ghost
    if (session.currentQueueJob) {
      const existing = await QueueJob.findOne({ _id: session.currentQueueJob, status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] } })
      if (existing) return existing
    }


    // 1.1 Find potential candidates for THIS staff member (top 100)
    const candidates = await QueueJob.find({
      status: 'QUEUED',
      $or: [
        { pinnedToStaff: staffId },
        { pinnedToStaff: null, reassignedFrom: { $ne: staffId } }
      ]
    }).sort({ pinnedToStaff: -1, priorityScore: -1, queuePosition: 1, createdAt: 1 })
      .limit(100)

    if (!candidates || candidates.length === 0) return null

    let jobCandidate = null
    
    // 1.2 CONCURRENCY SHIELD ITERATION: Find the first candidate without a customer clash
    for (const cand of candidates) {
      if (!cand.customerEmail) {
        jobCandidate = cand
        break
      }

      const clash = await QueueJob.findOne({
        customerEmail: cand.customerEmail,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] },
        assignedTo: { $ne: staffId }
      })

      if (!clash) {
        jobCandidate = cand
        break
      }
      console.log(`[Engine] Clash Shield: Skipping ${cand.customerEmail} (Job #${cand._id.toString().substring(18)}) for Staff ${staffId}. Someone else is handling a related job.`)
    }

    if (!jobCandidate) {
      console.warn(`[Engine] Stalling: All top candidates for Staff ${staffId} are blocked by concurrency clashes.`)
      return null
    }

    // 1.3 Atomic Assignment
    // We use findOneAndUpdate to securely grab the job ONLY IF it is still QUEUED
    const job = await QueueJob.findOneAndUpdate(
      { _id: jobCandidate._id, status: 'QUEUED' },
      { $set: { status: 'ASSIGNED', assignedTo: staffId, assignedAt: new Date() } },
      { new: true }
    )

    if (!job) return null // Another process grabbed it first!

    // 1.4 BATCH LOCK: Immediately claim all other queued jobs from this customer
    if (job.customerEmail) {
      await QueueJob.updateMany(
        { 
          customerEmail: job.customerEmail, 
          status: 'QUEUED', 
          pinnedToStaff: null 
        },
        { 
          $set: { 
            pinnedToStaff: staffId,
            continuityContext: (job.continuityContext || '') + ` [Auto-reserved: Sequential Batching with Job #${job._id.toString().substring(18).toUpperCase()}]`
          } 
        }
      )
      eventBus.emit('job:batch-reserved', { customerEmail: job.customerEmail, staffId })
    }

    // 1.5 Update Session — ATOMIC DB-level claim to prevent multi-process races.
    // Only claims the slot if it's still free. If another PM2 instance grabbed it first, abort.
    const claimedSession = await QueueSession.findOneAndUpdate(
      { _id: session._id, currentQueueJob: null },
      { $set: { currentQueueJob: job._id } },
      { new: true }
    )
    if (!claimedSession) {
      // Another process already claimed this slot — undo the job assignment and bail out
      await QueueJob.findOneAndUpdate(
        { _id: job._id, status: 'ASSIGNED' },
        { $set: { status: 'QUEUED', assignedTo: null, assignedAt: null } }
      )
      console.warn(`[Engine] DB-lock lost for staff ${staffId}: session slot was claimed by another process. Job returned to QUEUED.`)
      return null
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
 * Mark a job as complete and assign the next one.
 */
async function onJobComplete(staffId, jobId) {
  // 1. Atomic Completion
  const job = await QueueJob.findOneAndUpdate(
    {
      _id: jobId,
      assignedTo: staffId,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
    },
    { $set: { status: 'COMPLETED', completedAt: new Date() } },
    { new: true }
  )
  if (!job) throw new Error('Job not found, not assigned to you, or already completed')

  // 2. Clear Session Slots
  const session = await QueueSession.findOne({ staffId, isActive: true })
  if (session) {
    if (String(session.currentQueueJob) === String(jobId)) session.currentQueueJob = null
    if (String(session.currentWalkinJob) === String(jobId)) session.currentWalkinJob = null
    await session.save()
  }

  // 3. Move folder (Non-blocking internal try-catch)
  if (job.type === 'EMAIL' && job.folderPath) {
    try {
      const fs = require('fs');
      const path = require('path');
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

  // 4. Resume Paused Jobs if any
  const pausedJob = await QueueJob.findOne({ assignedTo: staffId, status: 'PAUSED' }).sort({ updatedAt: -1 });
  if (pausedJob && session && !session.currentQueueJob) {
    pausedJob.status = 'IN_PROGRESS';
    await pausedJob.save();
    session.currentQueueJob = pausedJob._id;
    await session.save();
    eventBus.emit('job:resumed', { job: pausedJob, staffId });
    return pausedJob;
  }

  // 5. Emit completed FIRST so stats decrement before the next assignment increments
  eventBus.emit('job:completed', { jobId: job._id, staffId })
  // Small yield to let the stats event handler run before auto-assign triggers its own stats
  await new Promise(resolve => setImmediate(resolve))
  return await assignNextJob(staffId)
}

/**
 * Handle staff login to queue system.
 */
async function onStaffLogin(staffId) {
  const oldSessions = await QueueSession.find({ staffId, isActive: true })
  for (const os of oldSessions) {
    await onStaffLogout(staffId, 'Session Terminated by New Login (Refresh)')
  }
  const session = await QueueSession.create({
    staffId,
    loginAt: new Date(),
    isActive: true
  })

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
 
  if (session.currentQueueJob) {
    const job = await QueueJob.findById(session.currentQueueJob)
    if (job && ['ASSIGNED', 'PAUSED', 'IN_PROGRESS'].includes(job.status)) {
      job.status = 'QUEUED'
      job.assignedTo = null
      job.assignedAt = null
      job.pinnedToStaff = staffId // Preserve pin so they can resume it if they log back in
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
    pJob.pinnedToStaff = staffId // Preserve pin so they can resume paused job on re-login
    if (reason) pJob.returnReason = reason
    await pJob.save()
  }
 
  if (session.currentWalkinJob) {
    const walkinJob = await QueueJob.findById(session.currentWalkinJob)
    if (walkinJob && ['ASSIGNED', 'IN_PROGRESS'].includes(walkinJob.status)) {
      walkinJob.status = 'QUEUED'
      walkinJob.assignedTo = null
      walkinJob.assignedAt = null
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
  job.pinnedToStaff = targetStaffId
  await job.save()

  // LEARNING: Update long-term preference when admin manually pins
  if (job.customerEmail) {
    const CustomerPreference = require('../models/CustomerPreference')
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
      await newSession.save()
    }
  } else {
    // Return to general pool
    job.status = 'QUEUED'
    job.assignedTo = null
    job.assignedAt = null
    job.pinnedToStaff = null
    job.reassignedFrom = fromStaffId
    job.handoffNotes = notes || ''
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
    ).catch(() => {})
  }

  const QueueRequest = require('../models/QueueRequest')
  await QueueRequest.updateMany(
    { jobId, type: 'REASSIGN', status: 'PENDING' },
    { status: 'APPROVED', adminAction: `Handled via manual reassignment (${forceMode})` }
  )

  eventBus.emit('job:reassigned', { jobId, fromStaffId, toStaffId, notes, options })
  
  // If we returned to pool, trigger a sweep
  if (!toStaffId) {
     assignIdleStaff().catch(() => {})
  }

  return job
}

/**
 * Admin: Approve a request (Walk-in or Reassignment).
 */
async function handleRequest(requestId, decision, adminAction, targetStaffId) {
  const QueueRequest = require('../models/QueueRequest')
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
        const statsService = require('./statsService')
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
  const QueueRequest = require('../models/QueueRequest')
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')

  const customerEmail = job.customerEmail

  // 1. Clear session slot immediately
  const session = await QueueSession.findOne({ staffId, isActive: true })
  if (session) {
    if (String(session.currentQueueJob) === String(jobId)) session.currentQueueJob = null
    if (String(session.currentWalkinJob) === String(jobId)) session.currentWalkinJob = null
    await session.save()
  }

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

  return { request: populated }
}

/**
 * Staff: Pause current active job
 */
async function pauseJob(staffId, jobId) {
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
    await session.save()
  }

  eventBus.emit('job:paused', { job, staffId })
  
  // Return the job so the route can send it back
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
  if (session.currentQueueJob) throw new Error('You are already working on another job. Pause it first.')

  job.status = 'IN_PROGRESS'
  await job.save()

  session.currentQueueJob = job._id
  await session.save()

  eventBus.emit('job:resumed', { job, staffId })
  
  return job
}

/**
 * Try to assign jobs to any truly idle staff.
 * Serialized (sequential) to prevent race conditions where two staff
 * simultaneously grab the same job candidate.
 */
async function assignIdleStaff() {
  // Only consider staff with NO queue job AND NO walkin job (truly idle)
  const idleSessions = await QueueSession.find({ 
    isActive: true, 
    currentQueueJob: null,
    currentWalkinJob: null
  })
  
  const results = []
  // SEQUENTIAL (not parallel) to prevent race conditions
  for (const session of idleSessions) {
    try {
      const job = await assignNextJob(session.staffId)
      if (job) results.push({ staffId: job.assignedTo, jobId: job._id })
    } catch (err) {
      console.error(`[Engine] assignIdleStaff failed for ${session.staffId}:`, err.message)
    }
  }

  return results
}

/**
 * Automatically cleanup any sessions that haven't sent a heartbeat.
 * Also recovers "Ghost Jobs" (assigned to offline staff).
 */
async function cleanupStaleSessions() {
  const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000)
  try {
    // 1. Finalize inactive sessions
    const staleSessions = await QueueSession.find({
      isActive: true,
      lastSeenAt: { $lt: ninetyMinsAgo }
    })
    for (const session of staleSessions) {
      await onStaffLogout(session.staffId, 'Inactivity (Heartbeat Timeout)')
    }

    // 2. Integrity Check: Catch "Ghost Jobs" (Assigned but no active session handles them)
    // Find jobs that are ASSIGNED but the staff assigned to them has no active session OR is not tracking that job
    // CRITICAL FIX: EXCLUDE 'PAUSED' jobs from ghost sweep since session.currentQueueJob intentionally decouples them!
    const assignedJobs = await QueueJob.find({ status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } })
    let recoveredCount = 0
    for (const job of assignedJobs) {
      const session = await QueueSession.findOne({ staffId: job.assignedTo, isActive: true })
      if (!session || (session.currentQueueJob?.toString() !== job._id.toString() && session.currentWalkinJob?.toString() !== job._id.toString())) {
        console.log(`[Integrity] Recovering ghost job ${job._id} (Assigned to ${job.assignedTo})`)
        job.status = 'QUEUED'
        job.assignedTo = null
        job.assignedAt = null
        job.returnReason = 'System Recovery (Ghost Job Detected)'
        await job.save()
        recoveredCount++
        
        if (session) {
           // Synchronize session if it exists but is out of sync
           if (job.type === 'EMAIL') session.currentQueueJob = null
           else session.currentWalkinJob = null
           await session.save()
        }
      }
    }
    if (recoveredCount > 0) {
      eventBus.emit('queue:reordered', { reason: 'Ghost Job Recovery' })
    }

    // 2.5 Safety Release: Clear pins for staff who have been offline for > 2 hours
    const twoHoursAgoLimit = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const stalePinnedJobs = await QueueJob.find({
      status: 'QUEUED',
      pinnedToStaff: { $ne: null }
    })
    
    let releasedPins = 0
    for (const pJob of stalePinnedJobs) {
      const activeSession = await QueueSession.findOne({ staffId: pJob.pinnedToStaff, isActive: true })
      if (!activeSession) {
        // Staff is offline. Check if they were seen recently or if this is a stale pin.
        // We look for any session (active or not) to find their lastSeeAt
        const lastSession = await QueueSession.findOne({ staffId: pJob.pinnedToStaff }).sort({ lastSeenAt: -1 })
        if (!lastSession || lastSession.lastSeenAt < twoHoursAgoLimit) {
          console.log(`[Safety] Releasing stale pin for job ${pJob._id} (Staff offline too long)`)
          pJob.pinnedToStaff = null
          pJob.continuityContext = (pJob.continuityContext || '') + ' [System: Pin released due to staff inactivity]'
          await pJob.save()
          releasedPins++
        }
      }
    }
    if (releasedPins > 0) {
      eventBus.emit('queue:reordered', { reason: 'Stale Pin Release' })
    }

    // 3. Ingestion Recovery: Recover tasks stuck in PROCESSING (Crash recovery)
    const IngestionTask = require('../models/IngestionTask')
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000)
    const stuckTasks = await IngestionTask.updateMany(
      { status: 'PROCESSING', updatedAt: { $lt: tenMinsAgo } },
      { $set: { status: 'PENDING', error: 'Stale Task Recovered (System Restart/Crash)' } }
    )
    if (stuckTasks.modifiedCount > 0) {
      console.log(`[Cleanup] Recovered ${stuckTasks.modifiedCount} stuck ingestion tasks.`)
    }

    // 3.5. Ghost Folder Recovery: Wipes REVIEW/QUEUED jobs whose folders were manually deleted by admins externally
    const fs = require('fs')
    const ghostCheckJobs = await QueueJob.find({ status: { $in: ['ADMIN_REVIEW', 'QUEUED'] } })
    let wipedGhosts = 0
    for (const j of ghostCheckJobs) {
      if (j.folderPath && j.folderPath.trim() !== '' && !fs.existsSync(j.folderPath)) {
        await QueueJob.findByIdAndDelete(j._id)
        wipedGhosts++
      }
    }
    if (wipedGhosts > 0) {
      console.log(`[Cleanup] Wiped ${wipedGhosts} ghost jobs due to missing physical folders.`)
      eventBus.emit('queue:reordered', { reason: 'Ghost Folder Sweep' })
    }

    // 4. Update Time-Sensitive Stats (SLA Breach & Staleness)
    const now = new Date()
    const in5mins  = new Date(Date.now() + 5  * 60 * 1000)
    const in15mins = new Date(Date.now() + 15 * 60 * 1000)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    
    const [br15, br5, stale] = await Promise.all([
      QueueJob.countDocuments({ status: { $in: ['QUEUED', 'ASSIGNED', 'IN_PROGRESS'] }, dueBy: { $gte: now, $lte: in15mins } }),
      QueueJob.countDocuments({ status: { $in: ['QUEUED', 'ASSIGNED', 'IN_PROGRESS'] }, dueBy: { $gte: now, $lte: in5mins } }),
      QueueJob.countDocuments({ status: 'QUEUED', createdAt: { $lt: twoHoursAgo } })
    ])
    
    const QueueStats = require('../models/QueueStats')
    await QueueStats.findOneAndUpdate({}, { 
      breachRisk15: br15, 
      breachRisk5: br5, 
      staleJobs: stale,
      lastUpdated: new Date()
    })

    // 5. Priority Escalation: DISABLED (Admin requested total manual control)
    // await escalatePriorities()

    // 4. Daily Chat Purge: Remove messages older than 12 hours (User requested reduction from 24h)
    const QueueMessage = require('../models/QueueMessage')
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)
    const purgeResult = await QueueMessage.deleteMany({ timestamp: { $lt: twelveHoursAgo } })
    if (purgeResult.deletedCount > 0) {
      console.log(`[Cleanup] Purged ${purgeResult.deletedCount} old chat messages.`)
    }

  } catch (err) {
    console.error('[QueueEngine] Cleanup error:', err.message)
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
  const fs = require('fs')
  const path = require('path')

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
  assignIdleStaff,
  cleanupStaleSessions,
  toggleQueuePause
}
