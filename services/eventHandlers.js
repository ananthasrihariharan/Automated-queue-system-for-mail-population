const eventBus = require('./eventBus')
const JobEvent = require('../models/JobEvent')
const QueueJob = require('../models/QueueJob')
const QueueSession = require('../models/QueueSession')
const User = require('../models/User')
const statsService = require('./statsService')

/**
 * Service to handle decoupled events:
 * 1. Audit Logging (JobEvent)
 * 2. Socket.io Notifications
 * 3. Throttled Dashboard Sync
 * 4. Real-time Pre-calculated Stats
 */
class EventHandlers {
  constructor() {
    this.io = null
    this.syncInterval = null
    this.isSyncing = false
    this.sweepTimer = null  // Debounce timer for assignIdleStaff sweeps
  }

  async init(io) {
    this.io = io
    this.setupListeners()
    this.startThrottledSync()
    
    // Initial sync of queue statistics
    await statsService.recalculate()
  }

  setupListeners() {
    // ─── Job Life Cycle ───
    
    eventBus.on('job:created', async ({ job }) => {
      await this.logEvent(job._id, 'CREATED', { status: job.status })
      
      // Update Stats
      if (job.status === 'QUEUED') await statsService.increment('queued')
      else if (job.status === 'ASSIGNED') await statsService.increment('assigned')
      else if (job.status === 'ADMIN_REVIEW') await statsService.increment('adminReview')
      else if (job.status === 'JUNK') await statsService.increment('junk')

      // Debounced sweep: multiple rapid job:created events coalesce into one sweep
      if (job.status === 'QUEUED') {
        this.triggerSweep()
      }
    })

    eventBus.on('job:assigned', async ({ job, staffId, details = {} }) => {
      const staff = await User.findById(staffId).select('name').lean()
      await this.logEvent(job._id, 'ASSIGNED', { 
        staffId, 
        staffName: staff?.name || 'Unknown',
        ...details
      }, staffId)
      
      // Update Stats
      await statsService.move('queued', 'assigned')
      
      // Real-time direct push for assignment (it's critical/urgent)
      if (this.io) {
        const staffRoom = `staff:${String(staffId).toLowerCase()}`
        const slot = details.slot || (job.type === 'WALKIN' ? 'walkin' : 'queue')
        this.io.to(staffRoom).emit('job:assigned', { job, slot })
      }
    })

    eventBus.on('job:completed', async ({ jobId, staffId }) => {
      const staff = await User.findById(staffId).select('name').lean()
      await this.logEvent(jobId, 'COMPLETED', { staffId, staffName: staff?.name || 'Unknown' }, staffId)
      
      // Update Stats
      await statsService.decrement('assigned')
      await statsService.markJobCompleted()
    })

    eventBus.on('job:pinned', async ({ jobId, staffId }) => {
      const job = await QueueJob.findById(jobId).lean();
      await this.logEvent(jobId, 'CREATED', { pinnedTo: staffId, action: 'PIN' })

      // Real-time notification for the staff member (Continuity / Manual Pin)
      if (this.io && staffId && job) {
        const staffRoom = `staff:${String(staffId).toLowerCase()}`
        this.io.to(staffRoom).emit('job:pinned', { 
          job, 
          message: job.continuityContext || `A new job has been pinned to your queue.`
        })
      }

      // Use debounced sweep instead of immediate assignNextJob so the pin DB write
      // has time to flush before the engine queries candidates. Without this delay,
      // assignNextJob could pick a different job instead of the newly pinned one.
      this.triggerSweep()
    })


    eventBus.on('batch:new-job', async ({ staffId, job, customerName }) => {
      if (this.io && staffId) {
        const staffRoom = `staff:${String(staffId).toLowerCase()}`
        this.io.to(staffRoom).emit('batch:new-job', { 
          job, 
          customerName,
          message: `New job received for ${customerName}! Added to your current batch.`
        })
      }
    })

    eventBus.on('job:reassigned', async ({ jobId, fromStaffId, toStaffId, notes, options }) => {
      const [fromStaff, toStaff] = await Promise.all([
        fromStaffId ? User.findById(fromStaffId).select('name').lean() : null,
        toStaffId ? User.findById(toStaffId).select('name').lean() : null
      ])
      await this.logEvent(jobId, 'REASSIGNED', { 
        fromStaffId, 
        fromStaffName: fromStaff?.name || 'Pool',
        toStaffId, 
        toStaffName: toStaff?.name || 'Pool',
        notes,
        forceMode: options?.forceMode || 'PARK', 
        batchMode: options?.batchMode || false
      }, toStaffId || fromStaffId)
      
      // Note: Reassigning within the pool or between users might not change overall "assigned" vs "queued" stats
      // unless it was previously assigned and now is not (return to pool)
      if (!toStaffId && fromStaffId) {
        await statsService.move('assigned', 'queued')
      } else if (toStaffId && !fromStaffId) {
        await statsService.move('queued', 'assigned')
      }

      if (this.io && toStaffId) {
        try {
          const job = await QueueJob.findById(jobId).populate('assignedTo', 'name').populate('lastPausedBy', 'name');
          if (job) {
             this.io.to(`staff:${String(toStaffId).toLowerCase()}`).emit('job:assigned', { job, slot: 'queue' });
          }
        } catch (err) {
          console.error('[Events] Failed to fetch reassigned job for socket emit:', err);
        }
      }
      if (this.io && fromStaffId) {
        this.io.to(`staff:${String(fromStaffId).toLowerCase()}`).emit('job:removed', { jobId, reason: 'reassigned' })
      }
    })

    eventBus.on('job:deleted', async ({ jobId, assignedTo, status }) => {
      // Use status from payload since job is already deleted from DB!
      if (!status) {
         // Fallback if emitted without status (legacy)
         const job = await QueueJob.findById(jobId).select('status')
         if (job) status = job.status
      }

      if (status) {
        if (status === 'QUEUED') await statsService.decrement('queued')
        else if (status === 'ASSIGNED' || status === 'IN_PROGRESS') await statsService.decrement('assigned')
        else if (status === 'PAUSED') await statsService.decrement('paused')
        else if (status === 'ADMIN_REVIEW') await statsService.decrement('adminReview')
        else if (status === 'JUNK') await statsService.decrement('junk')
      }

      await this.logEvent(jobId, 'COMPLETED', { action: 'ADMIN_DELETED' }).catch(() => {})
      if (this.io) {
        if (assignedTo) this.io.to(`staff:${String(assignedTo).toLowerCase()}`).emit('job:removed', { jobId, reason: 'deleted_by_admin' })
        this.io.to('admin:queue').emit('state:sync', { type: 'job_deleted', jobId })
      }
      // Use debounced sweep instead of direct call
      this.triggerSweep()
    })

    eventBus.on('job:restored', async ({ jobId }) => {
      // Find old status if possible, or just assume it was Junk/Review
      // Usually restore happens from JUNK or ADMIN_REVIEW
      await statsService.increment('queued')
      // Note: We don't know for sure if it was JUNK or REVIEW here without querying MongoDB before the change
      // So recalculating every now and then is good. For now, let's assume restoring always comes from a state we need to decrement.
      // But actually routes/admin-queue.js handles the status change before emitting job:restored.
      // Better to recalculate after restore to be safe.
      await statsService.recalculate()
    })


    // ─── Session Life Cycle ───
    eventBus.on('session:started', async ({ staffId }) => {
      console.log(`[Events] Staff login: ${staffId}`)
      await statsService.increment('activeSessions')
    })

    eventBus.on('session:ended', async ({ staffId, reason }) => {
      console.log(`[Events] Staff logout: ${staffId} (${reason})`)
      await statsService.decrement('activeSessions')
      // Full recalculate required because queueEngine silently pushes active/paused jobs back to the waiting pool during logout
      await statsService.recalculate()
      this.triggerSweep()
    })

    // ─── Missing Listeners (Audit Fix) ───
    eventBus.on('job:resumed', async ({ job, staffId }) => {
      const staff = await User.findById(staffId).select('name').lean()
      await this.logEvent(job._id, 'RESUMED', { staffId, staffName: staff?.name || 'Unknown' }, staffId)
      await statsService.move('paused', 'assigned')
    })

    eventBus.on('job:paused', async ({ job, staffId, details = {} }) => {
      const staff = await User.findById(staffId).select('name').lean()
      await this.logEvent(job._id, 'PAUSED', { 
          staffId, 
          staffName: staff?.name || 'Unknown',
          reason: job.returnReason || '',
          ...details
      }, staffId)
      await statsService.move('assigned', 'paused')
    })

    eventBus.on('queue:reordered', async ({ jobId, reason }) => {
      if (jobId) await this.logEvent(jobId, 'CREATED', { action: 'REORDER' })
      if (reason) await statsService.recalculate() // Run sync for batch/recovery triggers
      this.triggerSweep()
    })
 
    eventBus.on('job:unpinned', async ({ jobId }) => {
      await this.logEvent(jobId, 'CREATED', { action: 'UNPIN' })
      this.triggerSweep()
    })

    // Fired when a staff member takes a PAUSED/QUEUED job that was held by someone else
    eventBus.on('job:taken-by-other', async ({ jobId, newStaffId, oldStaffId }) => {
      try {
        const [newStaff, oldStaff] = await Promise.all([
          User.findById(newStaffId).select('name').lean(),
          User.findById(oldStaffId).select('name').lean()
        ])

        await this.logEvent(jobId, 'REASSIGNED', {
          action: 'TAKEN_BY_OTHER_STAFF',
          fromStaffId: oldStaffId,
          fromStaffName: oldStaff?.name || 'Unknown Staff',
          toStaffId: newStaffId,
          toStaffName: newStaff?.name || 'Another Staff',
          reason: `Job claimed from ${oldStaff?.name || 'another staff'} via Find Job.`
        }, newStaffId)

        if (this.io) {
          // Notify old staff: their held job was taken — clear it from their screen
          this.io.to(`staff:${String(oldStaffId).toLowerCase()}`).emit('job:removed', {
            jobId,
            reason: 'taken_by_other_staff',
            message: `⚠️ Job #${jobId.toString().substring(18).toUpperCase()} was taken by ${newStaff?.name || 'another staff member'}.`
          })
        }

        // Trigger a sweep so the old staff (now possibly idle) can get a new job
        this.triggerSweep()
      } catch (err) {
        console.error('[Events] job:taken-by-other handler failed:', err.message)
      }
    })

    eventBus.on('job:batch-reserved', async ({ customerEmail, staffId }) => {
      // Find all affected jobs to log them individually or log a summary
      // Logging individually is better for the Activity Journal
      const jobs = await QueueJob.find({ customerEmail, pinnedToStaff: staffId, status: 'QUEUED' })
      for (const job of jobs) {
        await this.logEvent(job._id, 'CREATED', { action: 'BATCH_RESERVED', staffId }, staffId)
      }
    })

    eventBus.on('walkin:approved', async ({ requestId, job }) => {
      await this.logEvent(job._id, 'ASSIGNED', { action: 'WALKIN_APPROVED', requestId }, job.assignedTo)
      // Walkin creation implicitly increments a job count. 
      // But walkins are created directly with status ASSIGNED or QUEUED.
      // Since job:created is NOT emitted for manual walkin creation in queueEngine.js (it should be!),
      // we handle it here or add job:created there.
      // Let's add stats logic for walkins.
      if (job.status === 'ASSIGNED') await statsService.increment('assigned')
      else await statsService.increment('queued')

      if (this.io && job.assignedTo) {
        this.io.to(`staff:${String(job.assignedTo).toLowerCase()}`).emit('job:assigned', { job, slot: 'walkin' })
      }
    })

    eventBus.on('reassign:approved', async ({ requestId, jobId, targetStaffId }) => {
      await this.logEvent(jobId, 'REASSIGNED', { action: 'REASSIGN_APPROVED', requestId, targetStaffId }, targetStaffId)
      // Reassignment status move is already handled by job:reassigned emission in reassignJob
    })

    eventBus.on('reassign:requested', async ({ request, fromStaffId }) => {
      try {
        const jobId = String(request.jobId._id || request.jobId)
        console.log(`[Events] Processing reassign:requested for Job ${jobId} from Staff ${fromStaffId}`)
        
        const requester = await User.findById(fromStaffId).select('name').lean()
        await this.logEvent(jobId, 'REASSIGN_REQUESTED', { 
            requestId: request._id, 
            reason: request.description,
            requestedBy: fromStaffId,
            requestedByName: requester?.name || 'Unknown'
        }, fromStaffId)
        
        // Update Stats (Wrapped in try-catch so it never blocks the socket emission)
        try {
          await statsService.move('assigned', 'adminReview')
        } catch (statsErr) {
          console.error('[Events] Stats move failed during reassignment:', statsErr.message)
        }

        if (this.io) {
          // Remove from staff's active view - Ensure room ID is a lowercase string matching client join
          const staffRoom = `staff:${String(fromStaffId).toLowerCase()}`
          console.log(`[Socket] Emitting job:removed to ${staffRoom} for job ${jobId}`)
          this.io.to(staffRoom).emit('job:removed', { jobId, reason: 'reassign_requested' })
          
          // Notify admin hub
          this.io.to('admin:queue').emit('reassign:requested', request)
        }
      } catch (err) {
        console.error('[Events] Fatal error in reassign:requested handler:', err.message)
      }
    })

    eventBus.on('walkin:requested', async ({ request }) => {
      if (this.io) {
        this.io.to('admin:queue').emit('walkin:requested', request)
      }
    })
  }

  /**
   * Centralized Engine 'Crank':
   * Scans for all idle staff and attempts to assign available jobs.
   * Debounced to 150ms — multiple rapid events coalesce into a single sweep,
   * preventing concurrent assignIdleStaff() calls that cause job over-assignment.
   */
  triggerSweep() {
    if (this.sweepTimer) clearTimeout(this.sweepTimer)
    this.sweepTimer = setTimeout(async () => {
      this.sweepTimer = null
      try {
        const queueEngine = require('./queueEngine')
        await queueEngine.assignIdleStaff()
      } catch (err) {
        console.error('[Events] triggerSweep failed:', err.message)
      }
    }, 150)
  }
 
  async logEvent(jobId, actionType, details = {}, userId = null) {

    try {
      await JobEvent.create({ jobId, actionType, details, userId })
      
      // Update the inline auditLog in QueueJob for quick retrieval
      await QueueJob.findByIdAndUpdate(jobId, {
        $push: {
          auditLog: {
            action: actionType,
            actor: userId, // RESTORED: Now correctly saving the person who did the action
            timestamp: new Date(),
            details
          }
        }
      })
    } catch (err) {
      console.error('[Events] Logging failed:', err.message)
    }
  }

  /**
   * Pushes the overall queue state to admins every 2 seconds.
   * This prevents spamming the socket with dozens of small events.
   */
  startThrottledSync() {
    this.syncInterval = setInterval(async () => {
      if (!this.io || this.isSyncing) return
      this.isSyncing = true

      try {
        // Fix #14: Limit active jobs to prevent unbounded payload in sync
        const activeJobs = await QueueJob.find({ 
          status: { $in: ['QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'ADMIN_REVIEW'] } 
        }).select('customerName emailSubject status priorityScore queuePosition assignedTo pinnedToStaff type createdAt')
          .sort({ queuePosition: 1 }).limit(150)

        const sessions = await QueueSession.find({ isActive: true })
          .populate('staffId', 'name role')
          .populate({
            path: 'currentQueueJob',
            select: 'status customerName emailSubject assignedAt'
          })
          .populate({
            path: 'currentWalkinJob',
            select: 'status customerName description assignedAt'
          })

        // Enrich for frontend compatibility
        const enrichedSessions = sessions.map(s => {
          const sess = s.toObject()
          sess.staffName = s.staffId?.name || 'Unknown Staff'
          
          const activeJob = s.currentQueueJob || s.currentWalkinJob
          if (activeJob && activeJob.assignedAt) {
            sess.startTime = activeJob.assignedAt
            const diff = Date.now() - new Date(activeJob.assignedAt).getTime()
            const mins = Math.floor(diff / 60000)
            sess.elapsedTime = `${mins}m`
          }
          return sess
        })

        this.io.to('admin:queue').emit('state:sync', {
          jobs: activeJobs,
          sessions: enrichedSessions,
          timestamp: new Date()
        })
      } catch (err) {
        console.error('[Sync] Failed:', err.message)
      } finally {
        this.isSyncing = false
      }
    }, 2000)
  }
}

module.exports = new EventHandlers()
