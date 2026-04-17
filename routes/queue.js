/**
 * Queue Routes — Staff-facing queue endpoints
 * Role: PREPRESS
 */

const express = require('express')
const router = express.Router()

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
    }).sort({ createdAt: -1 }).populate('assignedTo', 'name')

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
 * GET /current-job — Get currently assigned job (fallback if WebSocket missed)
 */
router.get('/current-job', auth, authorize('PREPRESS'), async (req, res) => {
  try {
    const session = await QueueSession.findOne({
      staffId: req.user._id,
      isActive: true
    })
      .populate('currentQueueJob')
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

    res.json({
      active: true,
      sessionId: session._id,
      queueJob: session.currentQueueJob || null,
      walkinJob: session.currentWalkinJob || null,
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

    const QueueRequest = require('../models/QueueRequest')
    const qReq = await QueueRequest.create({
      type: 'REASSIGN',
      jobId,
      description: reason,
      requestedBy: req.user._id,
    })

    // 1. Move job to Admin Review immediately so staff is freed
    job.status = 'ADMIN_REVIEW'
    job.assignedTo = null
    job.reassignedFrom = req.user._id
    job.handoffNotes = reason
    await job.save()

    // 2. Clear staff session slot so they can get a new job
    const session = await QueueSession.findOne({ staffId: req.user._id, isActive: true })
    if (session) {
      if (String(session.currentQueueJob) === String(jobId)) session.currentQueueJob = null
      if (String(session.currentWalkinJob) === String(jobId)) session.currentWalkinJob = null
      await session.save()
    }

    // 3. Automatically assign next job to this staff member
    queueEngine.assignNextJob(req.user._id).catch(err => console.error('[Reassign] Auto-assign next failed:', err))

    // 4. Notify via eventBus so audit trail is written by eventHandlers (BUG-04 fix)
    const eventBus = require('../services/eventBus')
    const populated = await QueueRequest.findById(qReq._id)
      .populate('requestedBy', 'name')
      .populate('jobId', 'customerName emailSubject')
    eventBus.emit('reassign:requested', { request: populated })

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
    const job = await queueEngine.pauseJob(req.user._id, req.params.id)
    
    // Engine already emits job:paused, we just handle the next assignment here
    await queueEngine.assignNextJob(req.user._id)
    
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

module.exports = router

