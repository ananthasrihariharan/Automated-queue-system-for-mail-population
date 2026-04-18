/**
 * Admin Queue Routes — Full queue management for admins
 * Role: ADMIN
 */

const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const queueEngine = require('../services/queueEngine')
const QueueJob = require('../models/QueueJob')
const QueueSession = require('../models/QueueSession')
const QueueRequest = require('../models/QueueRequest')
const CustomerPreference = require('../models/CustomerPreference')
const User = require('../models/User')

/**
 * GET /jobs — Full queue view (all statuses)
 */
router.get('/jobs', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search, assignedTo } = req.query
    const skip = (Number(page) - 1) * Number(limit)
 
    const filter = {}
    if (status && status !== 'undefined' && status !== 'null') filter.status = status

    // Staff filter: jobs assigned to them OR in ADMIN_REVIEW requested by them
    let staffOr = null
    if (assignedTo && assignedTo !== 'undefined' && assignedTo !== 'null') {
      staffOr = [
        { assignedTo: assignedTo },
        { reassignedFrom: assignedTo, status: 'ADMIN_REVIEW' }
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
 
    const total = await QueueJob.countDocuments(filter)
    const jobs = await QueueJob.find(filter)
      .sort({ priorityScore: -1, queuePosition: 1, createdAt: 1 })
      .populate('assignedTo', 'name')
      .populate('pinnedToStaff', 'name')
      .populate('reassignedFrom', 'name')
      .populate('lastPausedBy', 'name')
      .skip(skip)
      .limit(Number(limit))

    // Queue stats
    const stats = {
      queued: await QueueJob.countDocuments({ status: 'QUEUED' }),
      assigned: await QueueJob.countDocuments({ status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }),
      paused: await QueueJob.countDocuments({ status: 'PAUSED' }),
      completed: await QueueJob.countDocuments({ status: 'COMPLETED' }),
      total
    }

    res.json({ jobs, stats, total, pages: Math.ceil(total / Number(limit)) })
  } catch (err) {
    console.error('ADMIN QUEUE JOBS ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /threads/:threadId — Fetch all version history for a project thread
 */
router.get('/threads/:threadId', auth, async (req, res) => {
  try {
    const jobs = await QueueJob.find({ threadId: req.params.threadId })
      .sort({ createdAt: 1 })
      .populate('assignedTo', 'name')
      .populate('lastPausedBy', 'name')
    res.json(jobs)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /sessions — All active staff sessions
 */
router.get('/sessions', auth, authorize('ADMIN'), async (req, res) => {
  try {
    // Only return sessions active in the last 90 minutes (heartbeat check)
    const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000)
    const sessions = await QueueSession.find({ 
      isActive: true,
      lastSeenAt: { $gte: ninetyMinsAgo }
    })
      .populate('staffId', 'name phone')
      .populate({
        path: 'currentQueueJob',
        select: 'status customerName emailSubject relativeFolderPath'
      })
      .populate({
        path: 'currentWalkinJob',
        select: 'status customerName description relativeFolderPath'
      })

    res.json(sessions)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /staff — Get all prepress staff for assignment dropdowns
 */
router.get('/staff', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const staff = await User.find({
      roles: 'PREPRESS',
      isActive: true
    }).select('name phone')

    res.json(staff)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/priority — Set priority score + due_by
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
 * PATCH /jobs/:id/reorder — Change queue position
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
 * PATCH /jobs/:id/pin — Pin to specific staff
 */
router.patch('/jobs/:id/pin', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { staffId } = req.body
    if (!staffId) return res.status(400).json({ message: 'staffId required' })

    const job = await queueEngine.pinJob(req.params.id, staffId)

    // Update/create customer preference
    if (job.customerEmail) {
      await CustomerPreference.findOneAndUpdate(
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
 * PATCH /jobs/:id/unpin — Remove pin
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
 * PATCH /jobs/:id/reassign — Reassign to different staff
 */
router.patch('/jobs/:id/reassign', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { toStaffId, notes } = req.body
    if (!toStaffId) return res.status(400).json({ message: 'toStaffId required' })

    const job = await QueueJob.findById(req.params.id)
    if (!job) return res.status(404).json({ message: 'Job not found' })

    const result = await queueEngine.reassignJob(
      req.params.id,
      job.assignedTo,
      toStaffId,
      notes
    )

    res.json({ message: 'Job reassigned', job: result })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /requests — Fetch all pending walk-in and reassignment requests
 */
router.get('/requests', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const QueueRequest = require('../models/QueueRequest')
    const requests = await QueueRequest.find({ status: 'PENDING' })
      .populate('requestedBy', 'name')
      .populate('jobId', 'customerName emailSubject')
      .sort({ createdAt: -1 })
    res.json(requests)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /requests/:id/handle — Approve or Reject a walk-in or reassignment
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
 * PATCH /jobs/:id/complexity — Tag complexity post-completion
 */
router.patch('/jobs/:id/complexity', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { complexityTag } = req.body
    const job = await QueueJob.findById(req.params.id)
    if (!job) return res.status(404).json({ message: 'Job not found' })

    job.complexityTag = complexityTag
    await job.save()

    res.json({ message: 'Complexity tagged', job })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * DELETE /jobs/:id — Permanently remove a job from queue
 */
router.delete('/jobs/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const job = await QueueJob.findById(req.params.id)
    if (!job) return res.status(404).json({ message: 'Job not found' })

    // Clean up session references before deleting
    if (job.assignedTo) {
      const session = await QueueSession.findOne({ staffId: job.assignedTo, isActive: true })
      if (session) {
        if (String(session.currentQueueJob) === String(job._id)) session.currentQueueJob = null
        if (String(session.currentWalkinJob) === String(job._id)) session.currentWalkinJob = null
        await session.save()
        
        // Anti-strand fix: Instantly funnel them a new job if they were actively working on the deleted job
        await queueEngine.assignNextJob(job.assignedTo).catch(e => console.error('[Engine] Anti-strand assignNextJob failed:', e))
      }
    }

    await QueueJob.findByIdAndDelete(req.params.id)

    // Cleanup disk footprint
    if (job.folderPath) {
       const fs = require('fs');
       const path = require('path');
       try {
          if (fs.existsSync(job.folderPath)) {
             fs.rmSync(job.folderPath, { recursive: true, force: true });
          }
          // Remove parent if empty
          const parentPath = path.dirname(job.folderPath);
          const watchRoot = process.env.N8N_WATCH_PATH;
          if (watchRoot && parentPath !== watchRoot && parentPath.includes(watchRoot)) {
             if (fs.existsSync(parentPath) && fs.readdirSync(parentPath).length === 0) {
                 fs.rmdirSync(parentPath);
             }
          }
       } catch (err) {
          console.error('[Delete] Failed to cleanup folder:', err);
       }
    }

    // Fix #2: Use eventBus to maintain the audit trail instead of raw io push
    const eventBus = require('../services/eventBus')
    eventBus.emit('job:deleted', { jobId: req.params.id, assignedTo: job.assignedTo, status: job.status })

    res.json({ message: 'Job deleted permanently' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /jobs/bulk-delete — Permanently remove multiple jobs
 */
router.post('/jobs/bulk-delete', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { jobIds } = req.body;
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
       return res.status(400).json({ message: 'jobIds array is required' });
    }

    const jobs = await QueueJob.find({ _id: { $in: jobIds } });
    if (jobs.length === 0) {
       return res.status(404).json({ message: 'No matching jobs found' });
    }

    const fs = require('fs');
    const path = require('path');
    const watchRoot = process.env.N8N_WATCH_PATH;

    for (const job of jobs) {
      if (job.assignedTo) {
        const session = await QueueSession.findOne({ staffId: job.assignedTo, isActive: true });
        if (session) {
          if (String(session.currentQueueJob) === String(job._id)) session.currentQueueJob = null;
          if (String(session.currentWalkinJob) === String(job._id)) session.currentWalkinJob = null;
          await session.save();
          await queueEngine.assignNextJob(job.assignedTo).catch(e => console.error('[Engine] Anti-strand failed:', e));
        }
      }

      await QueueJob.findByIdAndDelete(job._id);

      // Cleanup disk footprint
      if (job.folderPath) {
         try {
            if (fs.existsSync(job.folderPath)) {
               fs.rmSync(job.folderPath, { recursive: true, force: true });
            }
            // Remove parent if empty
            const parentPath = path.dirname(job.folderPath);
            if (watchRoot && parentPath !== watchRoot && parentPath.includes(watchRoot)) {
               if (fs.existsSync(parentPath) && fs.readdirSync(parentPath).length === 0) {
                   fs.rmdirSync(parentPath);
               }
            }
         } catch (err) {
            console.error('[Bulk Delete] Failed to cleanup folder:', err);
         }
      }

      const eventBus = require('../services/eventBus');
      eventBus.emit('job:deleted', { jobId: job._id, assignedTo: job.assignedTo, status: job.status });
    }

    res.json({ message: `${jobs.length} jobs deleted permanently` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
})

/**
 * POST /jobs/bulk-status — Move multiple jobs to a new status (e.g. JUNK, ADMIN_REVIEW)
 */
router.post('/jobs/bulk-status', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { jobIds, status } = req.body;
    if (!Array.isArray(jobIds) || jobIds.length === 0 || !status) {
       return res.status(400).json({ message: 'jobIds array and status are required' });
    }

    const jobs = await QueueJob.find({ _id: { $in: jobIds } });
    if (jobs.length === 0) {
       return res.status(404).json({ message: 'No matching jobs found' });
    }

    const eventBus = require('../services/eventBus');
    let movedCount = 0;

    for (const job of jobs) {
       if (job.status === status) continue;
       
       // Clean session and anti-strand if being removed from active duty
       if (job.assignedTo && ['JUNK', 'ADMIN_REVIEW', 'QUEUED'].includes(status)) {
         const session = await QueueSession.findOne({ staffId: job.assignedTo, isActive: true });
         if (session) {
           if (String(session.currentQueueJob) === String(job._id)) session.currentQueueJob = null;
           if (String(session.currentWalkinJob) === String(job._id)) session.currentWalkinJob = null;
           await session.save();
           await queueEngine.assignNextJob(job.assignedTo).catch(e => console.error(e));
         }
         job.assignedTo = null;
         job.assignedAt = null;
       }

       job.status = status;
       job.returnReason = `Bulk moved to ${status} by admin`;
       await job.save();
       movedCount++;
       
       // Log audit natively via JobEvent to keep UI robust
       require('../models/JobEvent').create({ jobId: job._id, actionType: 'CREATED', details: { action: `MOVED_TO_${status}` } }).catch(() => {});
    }

    // Force stats to recalculate dynamically rather than manually adjusting them
    await require('../services/statsService').recalculate();

    res.json({ message: `${movedCount} jobs moved to ${status}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
})

/**
 * GET /customer-preferences — View preference map
 */
router.get('/customer-preferences', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const prefs = await CustomerPreference.find()
      .populate('preferredStaff', 'name')
      .sort({ confirmedCount: -1 })

    res.json(prefs)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /stats — Queue analytics
 */
router.get('/stats', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const QueueStats = require('../models/QueueStats')
    let stats = await QueueStats.findOne({})
    
    // Auto-recovery if stats are missing
    if (!stats) {
      const statsService = require('../services/statsService')
      await statsService.recalculate()
      stats = await QueueStats.findOne({})
    }

    // Still need to aggregate avgCompletionTime as it's truly dynamic
    const avgCompletionTime = await QueueJob.aggregate([
      { $match: { status: 'COMPLETED', assignedAt: { $ne: null }, completedAt: { $ne: null } } },
      { $project: { duration: { $subtract: ['$completedAt', '$assignedAt'] } } },
      { $group: { _id: null, avg: { $avg: '$duration' } } }
    ])

    res.json({
      totalQueued: stats.queued,
      totalInProgress: stats.assigned,
      completed: stats.completedToday,
      activeSessions: stats.activeSessions,
      avgCompletionTimeMs: avgCompletionTime[0]?.avg || 0,
      adminReview: stats.adminReview,
      breachRisk15: stats.breachRisk15,
      breachRisk5: stats.breachRisk5,
      junk: stats.junk,
      staleJobs: stats.staleJobs
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/restore — Move a JUNK/ADMIN_REVIEW job back to the waiting pool
 */
router.patch('/jobs/:id/restore', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const job = await QueueJob.findById(req.params.id)
    if (!job) return res.status(404).json({ message: 'Job not found' })

    // Place at end of current QUEUED pool
    const maxPos = await QueueJob.countDocuments({ status: 'QUEUED' })
    job.status = 'QUEUED'
    job.assignedTo = null
    job.assignedAt  = null
    job.returnReason = 'Restored from Junk by admin'
    job.queuePosition = maxPos + 1
    job.priorityScore = 0
    await job.save()

    // Reactive sweep — funnel restored job to any idle staff immediately
    await queueEngine.triggerAssignmentSweep().catch(e => console.error('[restore] sweep error:', e))

    const eventBus = require('../services/eventBus')
    eventBus.emit('job:restored', { jobId: job._id })

    res.json({ message: 'Job restored to queue', job })
  } catch (err) {
    console.error('RESTORE JOB ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /jobs/bulk-restore — Restores multiple JUNK/ADMIN_REVIEW jobs to QUEUED
 */
router.post('/jobs/bulk-restore', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { jobIds } = req.body;
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
       return res.status(400).json({ message: 'jobIds array is required' });
    }

    const jobs = await QueueJob.find({ _id: { $in: jobIds } });
    if (jobs.length === 0) {
       return res.status(404).json({ message: 'No matching jobs found' });
    }

    let maxPos = await QueueJob.countDocuments({ status: 'QUEUED' });
    const eventBus = require('../services/eventBus');

    for (const job of jobs) {
       maxPos++;
       job.status = 'QUEUED';
       job.assignedTo = null;
       job.assignedAt = null;
       job.returnReason = 'Bulk Restored from Junk by admin';
       job.queuePosition = maxPos;
       job.priorityScore = 0;
       await job.save();
       
       eventBus.emit('job:restored', { jobId: job._id });
    }

    // Reactive sweep
    if (typeof queueEngine.triggerAssignmentSweep === 'function') {
        await queueEngine.triggerAssignmentSweep().catch(e => console.error('[restore] sweep error:', e));
    } else {
        await queueEngine.assignIdleStaff().catch(e => console.error('[restore] assignIdleStaff error:', e));
    }

    res.json({ message: `${jobs.length} jobs restored to queue` });
  } catch (err) {
    console.error('RESTORE BULK JOB ERROR:', err);
    res.status(500).json({ message: err.message });
  }
})

/**
 * GET /stats/staff-leaderboard — Today's completion count per staff member
 */
router.get('/stats/staff-leaderboard', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const JobEvent = require('../models/JobEvent')
    const leaderboard = await JobEvent.aggregate([
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
    const staffUsers = await User.find({ _id: { $in: staffIds } }).select('name')
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

module.exports = router
