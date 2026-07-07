/**
 * Admin Queue Routes Ã¢â‚¬â€ Full queue management for admins
 * Role: ADMIN
 */

const express = require('express')
const fs = require('fs')
const path = require('path')
const router = express.Router()

const auth = require('../../../middleware/auth')
const authorize = require('../../../middleware/authorize')
const queueEngine = require('../../../services/queueEngine')
const pathService = require('../../../services/pathService')
const eventBus = require('../../../services/eventBus')
const statsService = require('../../../services/statsService')
const { queueJobRepo } = require('../../../repositories')
const { queueSessionRepo } = require('../../../repositories')
const { queueRequestRepo } = require('../../../repositories')
const { customerPreferenceRepo } = require('../../../repositories')
const { userRepo } = require('../../../repositories')
const { jobEventRepo } = require('../../../repositories')
const { systemConfigRepo } = require('../../../repositories')
const { queueStatsRepo } = require('../../../repositories')

/**
 * GET /jobs Ã¢â‚¬â€ Full queue view (all statuses)
 */
router.get('/jobs', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search, assignedTo, date } = req.query
    const skip = (Number(page) - 1) * Number(limit)
 
    const filter = { isSuperseded: { $ne: true } }
    if (status && status !== 'undefined' && status !== 'null') {
      if (status === 'ASSIGNED') {
        filter.status = { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] }
      } else {
        filter.status = status
      }
    }

    // Date filtering: Filter by completedAt for COMPLETED jobs, else createdAt
    if (date && date !== 'undefined' && date !== 'null') {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)
      
      if (status === 'COMPLETED') {
        filter.completedAt = { $gte: start, $lte: end }
      } else {
        filter.createdAt = { $gte: start, $lte: end }
      }
    }

    // Staff filter: supports single ID or comma-separated multiple IDs
    let staffOr = null
    if (assignedTo && assignedTo !== 'undefined' && assignedTo !== 'null') {
      const ids = String(assignedTo).split(',').map(s => s.trim()).filter(Boolean)
      staffOr = [
        { assignedTo: { $in: ids } },
        { reassignedFrom: { $in: ids }, status: 'ADMIN_REVIEW' }
      ]
    }
    
    // Search filter
    let searchOr = null
    if (search && search.trim() !== '') {
      searchOr = [
        { customerName: { $regex: search.trim(), $options: 'i' } },
        { customerEmail: { $regex: search.trim(), $options: 'i' } },
        { emailSubject: { $regex: search.trim(), $options: 'i' } }
      ]
    }

    // Combine without overwriting each other
    if (staffOr && searchOr) {
      filter.$and = [{ $or: staffOr }, { $or: searchOr }]
    } else if (staffOr) {
      filter.$or = staffOr
    } else if (searchOr) {
      filter.$or = searchOr
    }
 
    const total = await queueJobRepo.countDocuments(filter)
    const jobs = await queueJobRepo.find(filter)
      .sort({ createdAt: -1, priorityScore: -1, queuePosition: 1 })
      .populate('assignedTo', 'name')
      .populate('pinnedToStaff', 'name')
      .populate('reassignedFrom', 'name')
      .populate('lastPausedBy', 'name')
      .populate('auditLog.actor', 'name')
      .skip(skip)
      .limit(Number(limit))

    // Queue stats
    const statsQuery = { status: 'COMPLETED' }
    if (date && date !== 'undefined' && date !== 'null') {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)
      statsQuery.completedAt = { $gte: start, $lte: end }
    }

    // Synchronized Queue stats: Relative to current filters if applicable, otherwise global
    // Dynamic counts for current tab if a search/designer filter is active
    const stats = {
      totalQueued: (status === 'QUEUED' || !status) ? total : await queueJobRepo.countDocuments({ status: 'QUEUED', isSuperseded: { $ne: true } }),
      totalInProgress: (status === 'ASSIGNED') ? total : await queueJobRepo.countDocuments({ status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] }, isSuperseded: { $ne: true } }),
      completed: (status === 'COMPLETED') ? total : await queueJobRepo.countDocuments(statsQuery),
      activeSessions: await queueSessionRepo.countActiveNonDeleted(),
      adminReview: (status === 'ADMIN_REVIEW') ? total : await queueJobRepo.countDocuments({ status: 'ADMIN_REVIEW', isSuperseded: { $ne: true } }),
      junk: (status === 'JUNK') ? total : await queueJobRepo.countDocuments({ status: 'JUNK', isSuperseded: { $ne: true } }),
      total
    }

    res.json({ jobs, stats, total, pages: Math.ceil(total / Number(limit)) })
  } catch (err) {
    console.error('ADMIN QUEUE JOBS ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /threads/:threadId Ã¢â‚¬â€ Fetch all version history for a project thread
 */
router.get('/threads/:threadId', auth, async (req, res) => {
  try {
    const jobs = await queueJobRepo.find({ threadId: req.params.threadId })
      .sort({ createdAt: 1 })
      .populate('assignedTo', 'name')
      .populate('lastPausedBy', 'name')
      .populate('auditLog.actor', 'name')
    res.json(jobs)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /sessions Ã¢â‚¬â€ All active staff sessions
 */
router.get('/sessions', auth, authorize('ADMIN'), async (req, res) => {
  try {
    // Only return sessions active in the last 90 minutes (heartbeat check)
    const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000)
    const sessions = await queueSessionRepo.find({ 
      isActive: true,
      lastSeenAt: { $gte: ninetyMinsAgo }
    })
      .populate('staffId', 'name phone _id')
      .populate({
        path: 'currentQueueJob',
        select: 'status customerName emailSubject relativeFolderPath assignedAt'
      })
      .populate({
        path: 'currentWalkinJob',
        select: 'status customerName description relativeFolderPath assignedAt'
      })
      .lean()
      .exec()

    // Transform to include compatibility fields for Admin Panel
    const processedSessions = await Promise.all(sessions.map(async s => {
      const sess = { ...s }
      sess.staffName = s.staffId?.name || 'Unknown Staff'
      
      const rawStaffId = s.staffId?._id || s.staffId
      sess.serverVersion = '1.0.6-live-debug';

      let pinnedJobs = [];
      let pausedJobs = [];
      if (rawStaffId) {
        const numericStaffId = Number(rawStaffId);

        const [pinned, paused] = await Promise.all([
          queueJobRepo.find({ pinnedToStaff: numericStaffId, status: 'QUEUED' })
            .select('customerName emailSubject type createdAt')
            .sort({ createdAt: 1 })
            .limit(100)
            .lean(),
          queueJobRepo.find({ assignedTo: numericStaffId, status: 'PAUSED' })
            .select('customerName emailSubject type updatedAt')
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean()
        ])
        pinnedJobs = pinned || [];
        pausedJobs = paused || [];
      }

      sess.pinnedJobs = pinnedJobs.map(j => ({
        ...j,
        customerName: j.customerName || j.emailSubject || 'No Name'
      }));
      sess.pausedJobs = pausedJobs.map(j => ({
        ...j,
        customerName: j.customerName || j.emailSubject || 'No Name'
      }));
      
      const activeJob = s.currentQueueJob || s.currentWalkinJob
      if (activeJob) {
        sess.activeJobCustomer = activeJob.customerName || activeJob.emailSubject || 'In Progress'
      }
      if (activeJob && activeJob.assignedAt) {
        sess.startTime = activeJob.assignedAt
        const diff = Date.now() - new Date(activeJob.assignedAt).getTime()
        const mins = Math.floor(diff / 60000)
        sess.elapsedTime = `${mins}m`
      }
      
      return sess
    }))

    // DIAGNOSTIC: Write the actual response to a file so we can see it
    fs.writeFileSync(path.join(__dirname, '../last_api_response.json'), JSON.stringify(processedSessions, null, 2))

    res.json(processedSessions)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /staff Ã¢â‚¬â€ Get all prepress staff for assignment dropdowns
 */
router.get('/staff', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const staff = await userRepo.find({
      roles: 'PREPRESS',
      isActive: true,
      isDeleted: false
    }).select('name phone')

    res.json(staff)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/priority Ã¢â‚¬â€ Set priority score + due_by
 */
router.patch('/jobs/:id/priority', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { priorityScore, dueBy } = req.body
    const job = await queueEngine.reorderQueue(req.params.id, priorityScore, undefined)

    if (dueBy) {
      job.dueBy = new Date(dueBy)
      await job.save()
    }

    res.json({ message: 'Priority updated', job })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/reorder Ã¢â‚¬â€ Change queue position
 */
router.patch('/jobs/:id/reorder', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { queuePosition, priorityScore } = req.body
    const job = await queueEngine.reorderQueue(
      req.params.id,
      priorityScore !== undefined ? priorityScore : 0,
      queuePosition
    )

    res.json({ message: 'Queue position updated', job })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/pin Ã¢â‚¬â€ Pin to specific staff
 */
router.patch('/jobs/:id/pin', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { staffId } = req.body
    if (!staffId) return res.status(400).json({ message: 'staffId required' })

    const job = await queueEngine.pinJob(req.params.id, staffId)

    // Update/create customer preference
    if (job.customerEmail) {
      await customerPreferenceRepo.findOneAndUpdate(
        { customerEmail: job.customerEmail, preferredStaff: staffId },
        {
          customerEmail: job.customerEmail,
          customerName: job.customerName,
          preferredStaff: staffId,
          $inc: { confirmedCount: 1 }
        },
        { upsert: true, new: true }
      )
    }

    res.json({ message: 'Job pinned to staff', job })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/unpin Ã¢â‚¬â€ Remove pin
 */
router.patch('/jobs/:id/unpin', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const job = await queueEngine.unpinJob(req.params.id)
    res.json({ message: 'Pin removed', job })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/reassign Ã¢â‚¬â€ Reassign to different staff
 */
router.patch('/jobs/:id/reassign', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { toStaffId, notes, forceMode, batchMode } = req.body
    if (!toStaffId && toStaffId !== null) return res.status(400).json({ message: 'toStaffId required' })

    const job = await queueJobRepo.findById(req.params.id)
    if (!job) return res.status(404).json({ message: 'Job not found' })

    const result = await queueEngine.reassignJob(
      req.params.id,
      job.assignedTo,
      toStaffId,
      notes,
      { forceMode, batchMode }
    )

    res.json({ message: 'Job reassigned', job: result })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/retrieve Ã¢â‚¬â€ Un-complete a job and return to queue (optional pin)
 */
router.patch('/jobs/:id/retrieve', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { toStaffId } = req.body
    const job = await queueEngine.retrieveJob(req.params.id, toStaffId)
    res.json({ message: 'Job retrieved to queue', job })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /requests Ã¢â‚¬â€ Fetch all pending walk-in and reassignment requests
 */
router.get('/requests', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const requests = await queueRequestRepo.find({ status: 'PENDING' })
      .populate('requestedBy', 'name')
      .populate('jobId', 'customerName emailSubject')
      .sort({ createdAt: -1 })
    res.json(requests)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /requests/:id/handle Ã¢â‚¬â€ Approve or Reject a walk-in or reassignment
 */
router.post('/requests/:id/handle', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { decision, adminAction, targetStaffId } = req.body
    const result = await queueEngine.handleRequest(req.params.id, decision, adminAction || '', targetStaffId)
    if (!result) return res.status(404).json({ message: 'Request not found' })

    res.json({ message: `Request ${decision.toLowerCase()} successfully`, result })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/complexity Ã¢â‚¬â€ Tag complexity post-completion
 */
router.patch('/jobs/:id/complexity', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { complexityTag } = req.body
    const job = await queueJobRepo.findById(req.params.id)
    if (!job) return res.status(404).json({ message: 'Job not found' })

    job.complexityTag = complexityTag
    await job.save()

    res.json({ message: 'Complexity tagged', job })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * DELETE /jobs/:id Ã¢â‚¬â€ Permanently remove a job from queue
 */
router.delete('/jobs/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const job = await queueJobRepo.findById(req.params.id)
    if (!job) return res.status(404).json({ message: 'Job not found' })

    // Clean up session references before deleting
    if (job.assignedTo) {
      const session = await queueSessionRepo.findOne({ staffId: job.assignedTo, isActive: true })
      if (session) {
        if (String(session.currentQueueJob) === String(job._id)) session.currentQueueJob = null
        if (String(session.currentWalkinJob) === String(job._id)) session.currentWalkinJob = null
        await session.save()
        
        // Anti-strand fix: Instantly funnel them a new job if they were actively working on the deleted job
        await queueEngine.assignNextJob(job.assignedTo).catch(e => console.error('[Engine] Anti-strand assignNextJob failed:', e))
      }
    }

    await queueJobRepo.deleteJob(req.params.id)

    // Cleanup disk footprint
    pathService.deleteJobFolder(job);

    // Fix #2: Use eventBus to maintain the audit trail instead of raw io push
    eventBus.emit('job:deleted', { jobId: req.params.id, assignedTo: job.assignedTo, status: job.status })

    res.json({ message: 'Job deleted permanently' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /jobs/bulk-delete Ã¢â‚¬â€ Permanently remove multiple jobs
 */
router.post('/jobs/bulk-delete', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { jobIds } = req.body;
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
       return res.status(400).json({ message: 'jobIds array is required' });
    }

    const jobs = await queueJobRepo.find({ _id: { $in: jobIds } });
    if (jobs.length === 0) {
       return res.status(404).json({ message: 'No matching jobs found' });
    }

    for (const job of jobs) {
      if (job.assignedTo) {
        const session = await queueSessionRepo.findOne({ staffId: job.assignedTo, isActive: true });
        if (session) {
          if (String(session.currentQueueJob) === String(job._id)) session.currentQueueJob = null;
          if (String(session.currentWalkinJob) === String(job._id)) session.currentWalkinJob = null;
          await session.save();
          await queueEngine.assignNextJob(job.assignedTo).catch(e => console.error('[Engine] Anti-strand failed:', e));
        }
      }

      await queueJobRepo.deleteJob(job._id);

      // Cleanup disk footprint
      pathService.deleteJobFolder(job);

      eventBus.emit('job:deleted', { jobId: job._id, assignedTo: job.assignedTo, status: job.status });
    }

    res.json({ message: `${jobs.length} jobs deleted permanently` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
})

/**
 * POST /jobs/bulk-status Ã¢â‚¬â€ Move multiple jobs to a new status (e.g. JUNK, ADMIN_REVIEW)
 */
router.post('/jobs/bulk-status', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { jobIds, status } = req.body;
    if (!Array.isArray(jobIds) || jobIds.length === 0 || !status) {
       return res.status(400).json({ message: 'jobIds array and status are required' });
    }

    const jobs = await queueJobRepo.find({ _id: { $in: jobIds } });
    if (jobs.length === 0) {
       return res.status(404).json({ message: 'No matching jobs found' });
    }

    let movedCount = 0;

    for (const job of jobs) {
       if (job.status === status) continue;
       
       // Clean session and anti-strand if being removed from active duty
       if (job.assignedTo && ['JUNK', 'ADMIN_REVIEW', 'QUEUED'].includes(status)) {
         const session = await queueSessionRepo.findOne({ staffId: job.assignedTo, isActive: true });
         if (session) {
           if (String(session.currentQueueJob) === String(job._id)) session.currentQueueJob = null;
           if (String(session.currentWalkinJob) === String(job._id)) session.currentWalkinJob = null;
           await session.save();
           await queueEngine.assignNextJob(job.assignedTo).catch(e => console.error(e));
         }
       }

       job.status = status;
       job.returnReason = `Bulk moved to ${status} by admin`;
       await job.save();
       movedCount++;
       
       // Log audit natively via JobEvent to keep UI robust
       jobEventRepo.create({ jobId: job._id, actionType: 'CREATED', details: { action: `MOVED_TO_${status}` } }).catch(() => {});
    }

    statsService.schedule();

    res.json({ message: `${movedCount} jobs moved to ${status}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
})

/**
 * POST /jobs/bulk-reassign Ã¢â‚¬â€ Reassign multiple jobs to a new staff member
 */
router.post('/jobs/bulk-reassign', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { jobIds, toStaffId, notes, forceMode } = req.body;
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
       return res.status(400).json({ message: 'jobIds array is required' });
    }

    let reassignedCount = 0;

    for (const jobId of jobIds) {
      const job = await queueJobRepo.findById(jobId);
      if (!job) continue;

      await queueEngine.reassignJob(
        jobId,
        job.assignedTo,
        toStaffId === 'pool' ? null : toStaffId,
        notes || '',
        { forceMode: forceMode || 'PARK', batchMode: false }
      );
      reassignedCount++;
    }

    statsService.schedule();

    res.json({ message: `${reassignedCount} jobs reassigned successfully` });
  } catch (err) {
    console.error('BULK REASSIGN ERROR:', err);
    res.status(500).json({ message: err.message });
  }
})

/**
 * GET /customer-preferences Ã¢â‚¬â€ View preference map
 */
router.get('/customer-preferences', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const prefs = await customerPreferenceRepo.find()
      .populate('preferredStaff', 'name')
      .sort({ confirmedCount: -1 })

    res.json(prefs)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /stats Ã¢â‚¬â€ Queue analytics
 */
router.get('/stats', auth, authorize('ADMIN'), async (req, res) => {
  try {
    let stats = await queueStatsRepo.findOne({})
    
    // Auto-recovery if stats are missing
    if (!stats) {
      await statsService.recalculate()
      stats = await queueStatsRepo.findOne({})
    }

    // Still need to aggregate avgCompletionTime as it's truly dynamic
    const avgCompletionTime = await queueJobRepo.aggregate([
      { $match: { status: 'COMPLETED', assignedAt: { $ne: null }, completedAt: { $ne: null } } },
      { $project: { duration: { $subtract: ['$completedAt', '$assignedAt'] } } },
      { $group: { _id: null, avg: { $avg: '$duration' } } }
    ])

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    // Accurate count based on actual job state today
    const realCompletedToday = await queueJobRepo.countDocuments({ 
      status: 'COMPLETED',
      completedAt: { $gte: startOfDay, $lte: endOfDay }
    })

    res.json({
      totalQueued: await queueJobRepo.countDocuments({ status: 'QUEUED', isSuperseded: { $ne: true } }),
      totalInProgress: await queueJobRepo.countDocuments({ status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] }, isSuperseded: { $ne: true } }),
      completed: realCompletedToday,
      activeSessions: await queueSessionRepo.countActiveNonDeleted(),
      avgCompletionTimeMs: avgCompletionTime[0]?.avg || 0,
      adminReview: await queueJobRepo.countDocuments({ status: 'ADMIN_REVIEW', isSuperseded: { $ne: true } }),
      breachRisk15: stats.breachRisk15,
      breachRisk5: stats.breachRisk5,
      junk: await queueJobRepo.countDocuments({ status: 'JUNK', isSuperseded: { $ne: true } }),
      staleJobs: await queueJobRepo.countDocuments({ 
        status: { $in: ['QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED'] }, 
        isSuperseded: { $ne: true },
        updatedAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) } 
      })
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/restore Ã¢â‚¬â€ Move a JUNK/ADMIN_REVIEW job back to the waiting pool
 */
router.patch('/jobs/:id/restore', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const job = await queueJobRepo.findById(req.params.id)
    if (!job) return res.status(404).json({ message: 'Job not found' })

    // Place at end of current QUEUED pool
    const maxPos = await queueJobRepo.countDocuments({ status: 'QUEUED' })
    job.status = 'QUEUED'
    job.isSuperseded = false
    job.assignedToId = null
    job.assignedAt  = null
    job.returnReason = 'Restored from Junk by admin'
    job.queuePosition = maxPos + 1
    job.priorityScore = 0
    await job.save()

    // Reactive sweep Ã¢â‚¬â€ funnel restored job to any idle staff immediately
    // Commented out auto-assignment sweep on restore
    // await queueEngine.triggerAssignmentSweep().catch(e => console.error('[restore] sweep error:', e))

    eventBus.emit('job:restored', { jobId: job._id })

    res.json({ message: 'Job restored to queue', job })
  } catch (err) {
    console.error('RESTORE JOB ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /jobs/bulk-restore Ã¢â‚¬â€ Restores multiple JUNK/ADMIN_REVIEW jobs to QUEUED
 */
router.post('/jobs/bulk-restore', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { jobIds } = req.body;
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
       return res.status(400).json({ message: 'jobIds array is required' });
    }

    const jobs = await queueJobRepo.find({ _id: { $in: jobIds } });
    if (jobs.length === 0) {
       return res.status(404).json({ message: 'No matching jobs found' });
    }

    let maxPos = await queueJobRepo.countDocuments({ status: 'QUEUED' });

    for (const job of jobs) {
       maxPos++;
       job.status = 'QUEUED';
       job.isSuperseded = false;
       job.assignedToId = null;
       job.assignedAt = null;
       job.returnReason = 'Bulk Restored from Junk by admin';
       job.queuePosition = maxPos;
       job.priorityScore = 0;
       await job.save();
       
       eventBus.emit('job:restored', { jobId: job._id });
    }

    // Commented out auto-assignment sweep on bulk-restore so they remain in Waiting pool
    /*
    if (typeof queueEngine.triggerAssignmentSweep === 'function') {
        await queueEngine.triggerAssignmentSweep().catch(e => console.error('[restore] sweep error:', e));
    } else {
        await queueEngine.assignIdleStaff().catch(e => console.error('[restore] assignIdleStaff error:', e));
    }
    */

    res.json({ message: `${jobs.length} jobs restored to queue` });
  } catch (err) {
    console.error('RESTORE BULK JOB ERROR:', err);
    res.status(500).json({ message: err.message });
  }
})

/**
 * GET /stats/staff-leaderboard Ã¢â‚¬â€ Today's completion count per staff member
 */
router.get('/stats/staff-leaderboard', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const leaderboard = await jobEventRepo.aggregate([
      {
        $match: {
          actionType: 'COMPLETED',
          timestamp: { $gte: startOfDay },
          'details.staffId': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$details.staffId',
          count: { $sum: 1 },
          avgDurationMs: { $avg: 0 }
        }
      },
      { $sort: { count: -1 } }
    ])

    // Attach staff names
    const staffIds = leaderboard.map(l => l._id)
    const staffUsers = await userRepo.find({ _id: { $in: staffIds } }).select('name')
    const nameMap = Object.fromEntries(staffUsers.map(u => [String(u._id), u.name]))

    const result = leaderboard.map((entry, idx) => ({
      rank: idx + 1,
      staffId: entry._id,
      name: nameMap[String(entry._id)] || 'Unknown',
      count: entry.count,
      avgDurationMs: Math.round(entry.avgDurationMs || 0)
    }))

    res.json(result)
  } catch (err) {
    console.error('LEADERBOARD ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /config Ã¢â‚¬â€ Get system-wide configurations
 * Open to STAFF for read-only access to rules, restricted to ADMIN for updates.
 */
router.get('/config', auth, async (req, res) => {
  try {
    let configs = await systemConfigRepo.find()
    
    // Auto-init queue completion behavior setting if missing
    let behaviorConfig = configs.find(c => c.key === 'queueCompletionBehavior')
    if (!behaviorConfig) {
      await systemConfigRepo.create({
        key: 'queueCompletionBehavior',
        value: 'QUEUE_ONLY',
        description: 'Determines what happens when a Queue Staff member clicks Mark Complete'
      })
      configs = await systemConfigRepo.find()
    }

    // Auto-init reassignment reasons if missing or empty
    let reasonConfig = configs.find(c => c.key === 'reassignment_reasons')
    if (!reasonConfig || !Array.isArray(reasonConfig.value) || reasonConfig.value.length === 0) {
        const defaultReasons = [
            { id: 'client_waiting', label: 'Waiting for Client', requireReview: false, allowHold: true },
            { id: 'file_error', label: 'File Error', requireReview: false, allowHold: true },
            { id: 'wrong_assignment', label: 'Wrong Assignment', requireReview: true, allowHold: false }
        ]
        
        if (!reasonConfig) {
            await systemConfigRepo.create({
                key: 'reassignment_reasons',
                value: defaultReasons,
                description: 'Rules for job reassignments and holds'
            })
        } else {
            await systemConfigRepo.updateOne({ _id: reasonConfig._id }, { $set: { value: defaultReasons } })
        }
        configs = await systemConfigRepo.find()
    }

    // Auto-init hold reasons if missing or empty
    let holdReasonConfig = configs.find(c => c.key === 'hold_reasons')
    if (!holdReasonConfig || !Array.isArray(holdReasonConfig.value) || holdReasonConfig.value.length === 0) {
        const defaultHoldReasons = [
            { id: 'client_delay', label: 'Waiting for Client Response', behavior: 'RETURN_TO_POOL', timeLimit: 15 },
            { id: 'artwork_issue', label: 'Artwork Clarification Needed', behavior: 'RETURN_TO_POOL', timeLimit: 30 },
            { id: 'supervisor_approval', label: 'Waiting for Supervisor Approval', behavior: 'STAY_HOLD', timeLimit: 60 }
        ]
        
        if (!holdReasonConfig) {
            await systemConfigRepo.create({
                key: 'hold_reasons',
                value: defaultHoldReasons,
                description: 'Reasons and rules for holding jobs'
            })
        } else {
            await systemConfigRepo.updateOne({ _id: holdReasonConfig._id }, { $set: { value: defaultHoldReasons } })
        }
        configs = await systemConfigRepo.find()
    }
    
    res.json(configs)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /config/:key Ã¢â‚¬â€ Update a system-wide configuration
 */
router.patch('/config/:key', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { value } = req.body
    const config = await systemConfigRepo.findOneAndUpdate(
      { key: req.params.key },
      { value, updatedAt: new Date() },
      { upsert: true, new: true }
    )
    res.json(config)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /staff/:id/workspace Ã¢â‚¬â€ Detailed staff workspace insight (Active, Held, Reserved)
 */
router.get('/staff/:id/workspace', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const staffId = req.params.id;
    
    // 1. Get the active session to identify "Active Slot" jobs
    const session = await queueSessionRepo.findOne({ staffId, isActive: true });
    
    // 2. Fetch all jobs assigned or pinned to this staff
    const allJobs = await queueJobRepo.find({
      status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'QUEUED'] },
      $or: [
        { assignedTo: staffId },
        { pinnedToStaff: staffId }
      ]
    }).sort({ priorityScore: -1, createdAt: 1 });

    const workspace = {
      active: [],
      held: [],
      reserved: []
    };

    allJobs.forEach(job => {
      // Check if it's in the primary session slots (Active)
      const isActiveSlot = session && (
        String(session.currentQueueJob?._id || session.currentQueueJob) === String(job._id) || 
        String(session.currentWalkinJob?._id || session.currentWalkinJob) === String(job._id)
      );

      if (isActiveSlot || job.status === 'IN_PROGRESS') {
        workspace.active.push(job);
      } else if (job.status === 'PAUSED') {
        workspace.held.push(job);
      } else {
        workspace.reserved.push(job);
      }
    });

    res.json(workspace);
  } catch (err) {
    console.error('STAFF WORKSPACE ERROR:', err);
    res.status(500).json({ message: 'Error fetching staff workspace' });
  }
});

module.exports = router


