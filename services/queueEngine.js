/**
 * Queue Engine — Core blind assignment logic
 * 
 * Handles FIFO job assignment with priority sorting,
 * pin-aware skipping, and parallel walk-in slots.
 */

const QueueJob = require('../models/QueueJob')
const QueueSession = require('../models/QueueSession')
const eventBus = require('./eventBus')

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
  const session = await QueueSession.findOne({ staffId, isActive: true })
  if (!session) return null
  // Feature addition: Respect staff manual queue pause block
  if (session.isQueuePaused) return null

  // Safety: If they already have a job, return it instead of creating a ghost
  if (session.currentQueueJob) {
    const existing = await QueueJob.findOne({ _id: session.currentQueueJob, status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] } })
    if (existing) return existing
  }

  // 1. Find and update the job ATOMICALLY
  let job = await QueueJob.findOneAndUpdate(
    {
      status: 'QUEUED',
      $or: [
        { pinnedToStaff: staffId },
        { pinnedToStaff: null, reassignedFrom: { $ne: staffId } }
      ]
    },
    { $set: { status: 'ASSIGNED', assignedTo: staffId, assignedAt: new Date() } },
    { sort: { pinnedToStaff: -1, priorityScore: -1, queuePosition: 1, createdAt: 1 }, new: true }
  )

  if (!job) return null

  // 2. Immediately bind to session before emitting events
  session.currentQueueJob = job._id
  await session.save()

  // 3. Notify
  eventBus.emit('job:assigned', { job, staffId })

  return job
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

  // 5. Notify & Auto-Assign Next
  eventBus.emit('job:completed', { jobId: job._id, staffId })
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
      job.pinnedToStaff = null
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
    pJob.pinnedToStaff = null
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
async function reassignJob(jobId, fromStaffId, toStaffId, notes) {
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')

  if (fromStaffId) {
    const oldSession = await QueueSession.findOne({ staffId: fromStaffId, isActive: true })
    if (oldSession) {
      if (String(oldSession.currentQueueJob) === String(jobId)) oldSession.currentQueueJob = null
      if (String(oldSession.currentWalkinJob) === String(jobId)) oldSession.currentWalkinJob = null
      await oldSession.save()
    }
  }

  // Fix #8: Prevent "ghost job" ONLY if target staff is specified
  let newSession = null
  if (toStaffId) {
    newSession = await QueueSession.findOne({ staffId: toStaffId, isActive: true })
    if (!newSession) {
      throw new Error('Target staff is offline. Cannot reassign directly to an offline user.');
    }
    
    if (newSession.currentQueueJob) {
      // Target staff is currently working on an active job. 
      // Park it in their personal queue instead of overwriting their active job.
      job.status = 'QUEUED'
      job.assignedTo = null
      job.assignedAt = null
      job.pinnedToStaff = toStaffId
      job.reassignedFrom = fromStaffId
      job.handoffNotes = notes || ''
      await job.save()

      const QueueRequest = require('../models/QueueRequest')
      await QueueRequest.updateMany(
        { jobId, type: 'REASSIGN', status: 'PENDING' },
        { status: 'APPROVED', adminAction: 'Assigned to active queue (Target Staff is Busy)' }
      )
      eventBus.emit('job:reassigned', { jobId, fromStaffId, toStaffId, notes })
      return job
    }
  } else {
    // Return to general pool
    job.status = 'QUEUED'
    job.assignedTo = null
    job.assignedAt = null
    job.pinnedToStaff = null
    job.reassignedFrom = fromStaffId
    job.handoffNotes = notes || ''
    await job.save()

    const QueueRequest = require('../models/QueueRequest')
    await QueueRequest.updateMany(
      { jobId, type: 'REASSIGN', status: 'PENDING' },
      { status: 'APPROVED', adminAction: 'Returned to general pool' }
    )
    
    // Trigger assignment sweep since a job is now available
    assignIdleStaff().catch(err => console.error('[Handoff-Pool] Sweep failed:', err))

    eventBus.emit('job:reassigned', { jobId, fromStaffId, toStaffId: null, notes })
    return job
  }

  job.assignedTo = toStaffId
  job.reassignedFrom = fromStaffId
  job.handoffNotes = notes || ''
  job.status = 'ASSIGNED'
  job.assignedAt = new Date()
  await job.save()

  const QueueRequest = require('../models/QueueRequest')
  await QueueRequest.updateMany(
    { jobId, type: 'REASSIGN', status: 'PENDING' },
    { status: 'APPROVED', adminAction: 'Resolved via manual reassignment' }
  )

  if (newSession) {
    newSession.currentQueueJob = job._id
    await newSession.save()
  }

  eventBus.emit('job:reassigned', { jobId, fromStaffId, toStaffId, notes })

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
      await request.save()

      eventBus.emit('walkin:approved', { requestId, job: walkinJob })
      assignIdleStaff().catch(e => console.error('[Walkin] Sweep failed:', e))
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
      await request.save()

      eventBus.emit('walkin:approved', { requestId, job: walkinJob })
      assignIdleStaff().catch(e => console.error('[Walkin-Offline] Sweep failed:', e))
      return { request, job: walkinJob }
    }

  } else if (request.type === 'REASSIGN') {
    const originalJob = await QueueJob.findById(request.jobId)
    if (!originalJob) throw new Error('Original job not found')

    // Unified logic: Use reassignJob which handles session logic, ghost job prevention, and busy-target parking.
    await reassignJob(
      request.jobId,
      request.requestedBy._id,
      targetStaffId || null,
      request.description
    )

    request.status = 'APPROVED'
    await request.save()

    // Trigger assignment sweep for the requester who is now idle
    assignIdleStaff().catch(e => console.error('[Request] Sweep failed:', e))

    eventBus.emit('reassign:approved', { requestId, jobId: request.jobId, targetStaffId })
    return { request, job: originalJob }
  }
}

/**
 * Staff: Pause current active job
 */
async function pauseJob(staffId, jobId) {
  const job = await QueueJob.findById(jobId)
  if (!job) throw new Error('Job not found')
  if (String(job.assignedTo) !== String(staffId)) throw new Error('Not authorized for this job')

  const session = await QueueSession.findOne({ staffId, isActive: true })
  if (!session || String(session.currentQueueJob) !== String(jobId)) {
    throw new Error('Job is not actively in your session')
  }

  job.status = 'PAUSED'
  await job.save()

  session.currentQueueJob = null
  await session.save()

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
 * Try to assign jobs to any idle staff.
 * Optimized for parallel processing to improve scale.
 */
async function assignIdleStaff() {
  const idleSessions = await QueueSession.find({ isActive: true, currentQueueJob: null })
  
  // Parallelize assignments for efficiency
  const assignments = await Promise.allSettled(
    idleSessions.map(session => assignNextJob(session.staffId))
  )

  return assignments
    .filter(res => res.status === 'fulfilled' && res.value !== null)
    .map(res => {
      const job = res.value
      return { staffId: job.assignedTo, jobId: job._id }
    })
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
      if (recoveredCount > 0) {
        eventBus.emit('queue:reordered', { reason: 'Ghost Job Recovery' })
      }
    }

    // 3. Priority Escalation: DISABLED (Admin requested total manual control)
    // await escalatePriorities()

    // 4. Daily Chat Purge: Remove messages older than 24 hours
    const QueueMessage = require('../models/QueueMessage')
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const purgeResult = await QueueMessage.deleteMany({ timestamp: { $lt: yesterday } })
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
  pauseJob,
  resumeJob,
  assignIdleStaff,
  cleanupStaleSessions,
  toggleQueuePause
}
