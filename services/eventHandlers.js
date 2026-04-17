const eventBus = require('./eventBus')
const JobEvent = require('../models/JobEvent')
const QueueJob = require('../models/QueueJob')
const QueueSession = require('../models/QueueSession')

/**
 * Service to handle decoupled events:
 * 1. Audit Logging (JobEvent)
 * 2. Socket.io Notifications
 * 3. Throttled Dashboard Sync
 */
class EventHandlers {
  constructor() {
    this.io = null
    this.syncInterval = null
    this.isSyncing = false
  }

  init(io) {
    this.io = io
    this.setupListeners()
    this.startThrottledSync()
  }

  setupListeners() {
    // ─── Job Life Cycle ───
    // NOTE: job:created is handled below with assignIdleStaff. Only one listener.

    eventBus.on('job:assigned', async ({ job, staffId }) => {
      await this.logEvent(job._id, 'ASSIGNED', { staffId })
      
      // Real-time direct push for assignment (it's critical/urgent)
      if (this.io) {
        this.io.to(`staff:${staffId}`).emit('job:assigned', { job, slot: 'queue' })
      }
    })

    eventBus.on('job:completed', async ({ jobId, staffId }) => {
      await this.logEvent(jobId, 'COMPLETED', { staffId })
    })

    eventBus.on('job:pinned', async ({ jobId, staffId }) => {
      await this.logEvent(jobId, 'CREATED', { pinnedTo: staffId, action: 'PIN' }) // Use CREATED or similar for flow
    })

    eventBus.on('job:reassigned', async ({ jobId, fromStaffId, toStaffId, notes }) => {
      await this.logEvent(jobId, 'REASSIGNED', { fromStaffId, toStaffId, notes })
      if (this.io && toStaffId) {
        this.io.to(`staff:${toStaffId}`).emit('job:assigned', { jobId, slot: 'queue' })
      }
      if (this.io && fromStaffId) {
        this.io.to(`staff:${fromStaffId}`).emit('job:removed', { jobId, reason: 'reassigned' })
      }
    })

    // Unified Delete Handler: Cleanup session, notify staff, alert admins, and sweep pool
    eventBus.on('job:deleted', async ({ jobId, assignedTo }) => {
      await this.logEvent(jobId, 'COMPLETED', { action: 'ADMIN_DELETED' }).catch(() => {})
      if (this.io) {
        if (assignedTo) this.io.to(`staff:${assignedTo}`).emit('job:removed', { jobId, reason: 'deleted_by_admin' })
        this.io.to('admin:queue').emit('state:sync', { type: 'job_deleted', jobId })
      }
      this.triggerSweep()
    })


    // ─── Session Life Cycle ───
    eventBus.on('session:started', async ({ staffId }) => {
      console.log(`[Events] Staff login: ${staffId}`)
    })

    eventBus.on('session:ended', async ({ staffId, reason }) => {
      console.log(`[Events] Staff logout: ${staffId} (${reason})`)
      // Staff finished or left; their job is released. Check pool for others.
      this.triggerSweep()
    })

    // ─── Missing Listeners (Audit Fix) ───
    eventBus.on('job:resumed', async ({ job, staffId }) => {
      await this.logEvent(job._id, 'RESUMED', { staffId })
    })

    eventBus.on('queue:reordered', async ({ jobId }) => {
      await this.logEvent(jobId, 'CREATED', { action: 'REORDER' })
      // Priority shifted; check for idle staff
      this.triggerSweep()
    })
 
    eventBus.on('job:unpinned', async ({ jobId }) => {
      await this.logEvent(jobId, 'CREATED', { action: 'UNPIN' })
      // Job is now available for everyone; check for idle staff
      this.triggerSweep()
    })

    eventBus.on('walkin:approved', async ({ requestId, job }) => {
      await this.logEvent(job._id, 'ASSIGNED', { action: 'WALKIN_APPROVED', requestId })
      if (this.io && job.assignedTo) {
        this.io.to(`staff:${job.assignedTo}`).emit('job:assigned', { job, slot: 'walkin' })
      }
    })

    eventBus.on('reassign:approved', async ({ requestId, jobId, targetStaffId }) => {
      await this.logEvent(jobId, 'REASSIGNED', { action: 'REASSIGN_APPROVED', requestId, targetStaffId })
    })

    // ─── Auto-Assign Idle Staff on New Job (Flaw #4 Fix) ───
    eventBus.on('job:created', async ({ job }) => {
      await this.logEvent(job._id, 'CREATED', { status: job.status })
      if (job.status === 'QUEUED') {
        try {
          const queueEngine = require('./queueEngine')
          await queueEngine.assignIdleStaff()
        } catch (err) {
          console.error('[Events] assignIdleStaff failed:', err.message)
        }
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
