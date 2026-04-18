const eventBus = require('./eventBus')
const JobEvent = require('../models/JobEvent')
const QueueJob = require('../models/QueueJob')
const QueueSession = require('../models/QueueSession')
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

      if (job.status === 'QUEUED') {
        try {
          const queueEngine = require('./queueEngine')
          await queueEngine.assignIdleStaff()
        } catch (err) {
          console.error('[Events] assignIdleStaff failed:', err.message)
        }
      }
    })

    eventBus.on('job:assigned', async ({ job, staffId }) => {
      await this.logEvent(job._id, 'ASSIGNED', { staffId })
      
      // Update Stats
      await statsService.move('queued', 'assigned')
      
      // Real-time direct push for assignment (it's critical/urgent)
      if (this.io) {
        const staffRoom = `staff:${String(staffId).toLowerCase()}`
        this.io.to(staffRoom).emit('job:assigned', { job, slot: 'queue' })
      }
    })

    eventBus.on('job:completed', async ({ jobId, staffId }) => {
      await this.logEvent(jobId, 'COMPLETED', { staffId })
      
      // Update Stats
      await statsService.decrement('assigned')
      await statsService.markJobCompleted()
    })

    eventBus.on('job:pinned', async ({ jobId, staffId }) => {
      await this.logEvent(jobId, 'CREATED', { pinnedTo: staffId, action: 'PIN' })
    })

    eventBus.on('job:reassigned', async ({ jobId, fromStaffId, toStaffId, notes }) => {
      await this.logEvent(jobId, 'REASSIGNED', { fromStaffId, toStaffId, notes })
      
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
      await this.logEvent(job._id, 'RESUMED', { staffId })
      await statsService.move('paused', 'assigned')
    })

    eventBus.on('job:paused', async ({ job, staffId }) => {
      await this.logEvent(job._id, 'PAUSED', { staffId })
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

    eventBus.on('walkin:approved', async ({ requestId, job }) => {
      await this.logEvent(job._id, 'ASSIGNED', { action: 'WALKIN_APPROVED', requestId })
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
      await this.logEvent(jobId, 'REASSIGNED', { action: 'REASSIGN_APPROVED', requestId, targetStaffId })
      // Reassignment status move is already handled by job:reassigned emission in reassignJob
    })

    eventBus.on('reassign:requested', async ({ request, fromStaffId }) => {
      try {
        const jobId = String(request.jobId._id || request.jobId)
        console.log(`[Events] Processing reassign:requested for Job ${jobId} from Staff ${fromStaffId}`)
        
        await this.logEvent(jobId, 'REASSIGN_REQUESTED', { requestId: request._id, reason: request.description })
        
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
   * Throttled slightly to prevent DB thundering herds during concurrent events.
   */
  async triggerSweep() {
    try {
      const queueEngine = require('./queueEngine')
      await queueEngine.assignIdleStaff()
    } catch (err) {
      console.error('[Events] triggerSweep failed:', err.message)
    }
  }
 
  async logEvent(jobId, actionType, details = {}, userId = null) {

    try {
      await JobEvent.create({ jobId, actionType, details, userId })
      
      // Update the inline auditLog in QueueJob for quick retrieval
      await QueueJob.findByIdAndUpdate(jobId, {
        $push: {
          auditLog: {
            action: actionType,
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
        }).sort({ queuePosition: 1 }).limit(150)

        const activeSessions = await QueueSession.find({ isActive: true })
          .populate('staffId', 'name role')

        this.io.to('admin:queue').emit('state:sync', {
          jobs: activeJobs,
          sessions: activeSessions,
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
