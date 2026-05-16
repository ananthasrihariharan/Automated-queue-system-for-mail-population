/**
 * Queue Routes — Staff-facing queue endpoints
 * Role: PREPRESS
 */

const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const queueEngine = require('../services/queueEngine')
const QueueRequest = require('../models/QueueRequest')
const QueueJob = require('../models/QueueJob')
const QueueSession = require('../models/QueueSession')

/**
 * POST /start-session — Staff enters queue mode
 */
router.post('/start-session', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const { session, job } = await queueEngine.onStaffLogin(req.user._id)
    // eventHandlers now handles the eventBus signal

    res.json({
      message: 'Queue session started',
      session: {
        id: session._id,
        loginAt: session.loginAt
      },
      currentJob: job || null
    })
  } catch (err) {
    console.error('START SESSION ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /end-session — Staff leaves queue mode
 */
router.post('/end-session', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const session = await queueEngine.onStaffLogout(req.user._id, 'Manual Logout')

    res.json({
      message: session ? 'Queue session ended' : 'No active session found',
      session
    })
  } catch (err) {
    console.error('END SESSION ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /my-jobs-today — All jobs assigned to me today (active + paused + completed)
 */
router.get('/my-jobs-today', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const now = new Date()
    const startOfToday = new Date(now.setHours(0, 0, 0, 0))

    // Return everything assigned to this staff today — completed, active, paused
    const jobs = await QueueJob.find({
      assignedTo: req.user._id,
      $or: [
        { status: 'COMPLETED', completedAt: { $gte: startOfToday } },
        { status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] } }
      ]
    })
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'name')
      .populate('reassignedFrom', 'name')

    res.json(jobs)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})


/**
 * GET /pool-size — How many jobs are waiting in the pool (PREPRESS-accessible)
 */
router.get('/pool-size', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const waiting = await QueueJob.countDocuments({ status: 'QUEUED' })
    const inProgress = await QueueJob.countDocuments({ status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } })
    res.json({ waiting, inProgress })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /general-pool — Search the waiting pool for specific jobs
 */
router.get('/general-pool', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const { search = '' } = req.query;
    
    const filter = { 
      status: { $in: ['QUEUED', 'PAUSED', 'ASSIGNED', 'IN_PROGRESS'] },
      isSuperseded: { $ne: true },
      type: { $ne: 'WALKIN' }
    };

    if (search) {
      const regex = { $regex: search.trim(), $options: 'i' };
      filter.$or = [
        { customerName: regex },
        { customerEmail: regex },
        { emailSubject: regex }
      ];
    }

    const jobs = await QueueJob.find(filter)
      .sort({ priorityScore: -1, createdAt: 1 })
      .limit(50) 
      .populate('pinnedToStaff', 'name')
      .populate('assignedTo', 'name');

    // Add batch counts to each result for UI visibility
    const jobsWithCounts = await Promise.all(jobs.map(async (job) => {
      const batchFilter = { 
        status: 'QUEUED', 
        isSuperseded: { $ne: true }
      };
      
      if (job.customerEmail) batchFilter.customerEmail = job.customerEmail;
      else if (job.customerPhone) batchFilter.customerPhone = job.customerPhone;
      else {
        return { ...job.toObject(), batchCount: 1 };
      }

      const count = await QueueJob.countDocuments(batchFilter);
      return { ...job.toObject(), batchCount: count };
    }));

    res.json(jobsWithCounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
})

/**
 * GET /current-job — Get currently assigned job (fallback if WebSocket missed)
 */
router.get('/current-job', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const session = await QueueSession.findOne({
      staffId: req.user._id,
      isActive: true
    })
      .populate({
        path: 'currentQueueJob',
        populate: { path: 'reassignedFrom', select: 'name' }
      })
      .populate('currentWalkinJob')

    if (!session) {
      return res.json({ active: false, queueJob: null, walkinJob: null })
    }

    const pausedJobs = await QueueJob.find({ assignedTo: req.user._id, status: 'PAUSED' })
    const pendingPinnedJobs = await QueueJob.find({ pinnedToStaff: req.user._id, status: 'QUEUED' })
    
    // The "Tray": Assigned to me, but not currently the "active" slot job
    const pendingTray = await QueueJob.find({ 
      assignedTo: req.user._id, 
      status: 'ASSIGNED',
      _id: { $ne: session.currentQueueJob?._id || session.currentQueueJob } 
    }).sort({ priorityScore: -1, createdAt: 1 })

    // 1.5 BATCH STREAM: Find all other jobs for this customer that are pinned/assigned to me
    let activeBatch = []
    if (session.currentQueueJob && session.currentQueueJob.customerEmail) {
      activeBatch = await QueueJob.find({
        customerEmail: session.currentQueueJob.customerEmail,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'QUEUED'] },
        $or: [
          { assignedTo: req.user._id },
          { pinnedToStaff: req.user._id }
        ]
      }).sort({ createdAt: 1 })
    }

    res.json({
      active: true,
      sessionId: session._id,
      queueJob: session.currentQueueJob || null,
      walkinJob: session.currentWalkinJob || null,
      activeBatch: activeBatch,
      pausedJobs: pausedJobs || [],
      pendingPinnedJobs: pendingPinnedJobs || [],
      pendingTray: pendingTray || []
    })
  } catch (err) {
    console.error('CURRENT JOB ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /take-job — Staff manually picks a job from the pool or their queue
 */
router.post('/take-job', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const { jobId, takeAll = false } = req.body;
    if (!jobId) return res.status(400).json({ message: 'Job ID required' });

    const job = await queueEngine.takeJob(req.user._id, jobId, takeAll);
    res.json({
      message: 'Job successfully taken',
      job
    });
  } catch (err) {
    console.error('TAKE JOB ERROR:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /complete-job/:id — Mark queue job done, triggers next assignment
 */
router.post('/complete-job/:id', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const nextJob = await queueEngine.onJobComplete(req.user._id, req.params.id)

    res.json({
      message: 'Job completed',
      nextJob: nextJob || null
    })
  } catch (err) {
    console.error('COMPLETE JOB ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /bulk-complete — Mark multiple jobs as done
 */
router.post('/bulk-complete', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const { jobIds } = req.body
    if (!jobIds || !Array.isArray(jobIds)) {
      return res.status(400).json({ message: 'jobIds array is required' })
    }

    const results = []
    for (const id of jobIds) {
      try {
        await queueEngine.onJobComplete(req.user._id, id)
        results.push({ id, status: 'success' })
      } catch (e) {
        results.push({ id, status: 'error', message: e.message })
      }
    }

    res.json({
      message: `Processed ${jobIds.length} completions`,
      results
    })
  } catch (err) {
    console.error('BULK COMPLETE ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /walkin-request — Staff requests walk-in approval from admin
 */
router.post('/walkin-request', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const { description } = req.body
    if (!description) return res.status(400).json({ message: 'description is required' })

    const QueueRequest = require('../models/QueueRequest')
    const request = await QueueRequest.create({
      type: 'WALKIN',
      description,
      requestedBy: req.user._id
    })

    // Fix #3: Notify via eventBus instead of raw io
    const eventBus = require('../services/eventBus')
    const populated = await QueueRequest.findById(request._id).populate('requestedBy', 'name')
    eventBus.emit('walkin:requested', { request: populated })

    res.status(201).json({
      message: 'Walk-in request sent to admin',
      request
    })
  } catch (err) {
    console.error('WALKIN REQUEST ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})


/**
 * GET /staff-list — Get all staff members for messaging contact list
 * Available to any authenticated user (staff and admin)
 */
router.get('/staff-list', auth, async (req, res) => {
  try {
    const User = require('../models/User')
    const staff = await User.find({ isActive: true }).select('name role roles')
    res.json(staff)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /session-status — Check if staff has active session
 */
router.get('/session-status', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const session = await QueueSession.findOne({
      staffId: req.user._id,
      isActive: true
    })

    res.json({
      active: !!session,
      session: session ? {
        id: session._id,
        loginAt: session.loginAt,
        isQueuePaused: session.isQueuePaused
      } : null
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /session/toggle-pause — Toggle active staff job auto-assignment stream
 */
router.post('/session/toggle-pause', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const { isPaused } = req.body
    const session = await queueEngine.toggleQueuePause(req.user._id, isPaused)
    res.json({ success: true, isQueuePaused: session.isQueuePaused })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /heartbeat — Maintain active session status
 */
router.post('/heartbeat', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const session = await QueueSession.findOneAndUpdate(
      { staffId: req.user._id, isActive: true },
      { lastSeenAt: new Date() },
      { new: true }
    )
    res.json({ success: !!session })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /reassign-request — Staff requests job move with reason
 */
router.post('/reassign-request', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const { jobId, reason, notes } = req.body
    if (!jobId || !reason) return res.status(400).json({ message: 'jobId and reason are required' })

    const job = await QueueJob.findById(jobId)
    if (!job) return res.status(404).json({ message: 'Job not found' })

    // Delegate atomic transition to engine (which now handles request creation and socket emission)
    await queueEngine.requestReassignment(req.user._id, jobId, reason)

    res.json({ message: 'Reassignment request saved and sent to admin' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /jobs/:id/pause — Manually hold/pause the current job
 */
router.post('/jobs/:id/pause', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const { fetchNext = true } = req.body;
    // If fetchNext is false, it means they clicked "Pause for Walk-in". 
    // We pass true to pauseQueue to block auto-assignment and stay idle.
    const job = await queueEngine.pauseJob(req.user._id, req.params.id, !fetchNext)
    
    // Engine already emits job:paused, we just handle the next assignment here if requested
    if (fetchNext) {
      await queueEngine.assignNextJob(req.user._id)
    }
    
    res.json({ message: 'Job paused successfully', job })
  } catch (err) {
    console.error('PAUSE ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /jobs/:id/resume — Manually resume a paused job
 */
router.post('/jobs/:id/resume', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const job = await queueEngine.resumeJob(req.user._id, req.params.id)
    res.json({ message: 'Job resumed successfully', job })
  } catch (err) {
    console.error('RESUME ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

/**
 * POST /jobs/:id/take — Explicitly start/take any job (pinned or walkin)
 */
router.post('/jobs/:id/take', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const { takeAll = false } = req.body;
    const job = await queueEngine.takeJob(req.user._id, req.params.id, takeAll)
    res.json({ message: 'Job taken successfully', job })
  } catch (err) {
    console.error('TAKE JOB ERROR:', err)
    res.status(500).json({ message: err.message })
  }
})

// Keep old route for backward compatibility if needed, pointing to same logic
router.post('/walkin/:id/start', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const job = await queueEngine.takeJob(req.user._id, req.params.id)
    res.json({ message: 'Job started successfully', job })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * PATCH /jobs/:id/complexity — Staff tags complexity after completing
 */
router.patch('/jobs/:id/complexity', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const { complexityTag } = req.body
    const job = await QueueJob.findById(req.params.id)
    if (!job) return res.status(404).json({ message: 'Job not found' })

    // Ensure they only tag jobs they handled
    if (String(job.assignedTo) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized for this job' })
    }

    job.complexityTag = complexityTag
    await job.save()

    res.json({ message: 'Complexity tagged', job })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/**
 * GET /files/:jobId/* — Securely serve job assets from N8N watch path
 * Role: ADMIN or ASSIGNED PREPRESS staff
 */
router.get('/files/:jobId/*', auth, async (req, res) => {
  try {
    const { jobId } = req.params
    const filePath = req.params[0] // Captured by '*'
    
    // 1. Verify Authentication & Role
    const roles = req.user.roles || []
    const isAdmin = roles.includes('ADMIN') || req.user.role === 'ADMIN'
    const isStaff = roles.some(r => ['PREPRESS', 'DISPATCH'].includes(r)) || ['PREPRESS', 'DISPATCH'].includes(req.user.role)

    // 2. Lookup Job to check assignment
    const job = await QueueJob.findById(jobId)
    if (!job) return res.status(404).json({ message: 'Job record not found' })

    const isAssigned = String(job.assignedTo) === String(req.user._id)
    const isPinned = String(job.pinnedToStaff) === String(req.user._id)
    const isQueued = job.status === 'QUEUED'

    // 🛡️ SECURITY CHECK: Broad access for staff/admins; restricted for others
    if (!isAdmin && !isStaff && !isAssigned && !isPinned) {
      console.warn(`[Security] Unauthorized file access attempt on Job ${jobId} by User ${req.user._id}`)
      return res.status(403).json({ message: 'Access denied. You are not authorized to view these files.' })
    }


    // 3. Resolve Real Path (Unified PathService)
    const pathService = require('../services/pathService');
    const absolutePath = pathService.resolveFilePath(job, filePath);

    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'File not found on storage server' });
    }

    const stats = fs.statSync(absolutePath)

    // FRIENDLY FILENAME PRESERVATION
    const filename = path.basename(absolutePath)
    const safeName = filename.replace(/[/\\?%*:|"<>]/g, '-')
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`)

    if (stats.isDirectory()) {
      const files = fs.readdirSync(absolutePath)
      let html = `<html><head><title>Assets: ${job.customerName}</title><style>body{font-family:sans-serif;padding:2rem;background:#f8fafc} a{display:block;padding:0.5rem;color:#2563eb;text-decoration:none;border-bottom:1px solid #e2e8f0} a:hover{background:#eff6ff}</style></head><body>`
      html += `<h2>Files for ${job.customerName} - ${job.emailSubject}</h2>`
      html += `<a href="../">.. (Up)</a>`
      files.forEach(f => {
        html += `<a href="${path.join(req.originalUrl, f)}">${f}</a>`
      })
      html += `</body></html>`
      return res.send(html)
    }

    res.sendFile(absolutePath)
  } catch (err) {
    console.error('SECURE FILE ERROR:', err)
    res.status(500).json({ message: 'Server error serving file' })
  }
})


module.exports = router

