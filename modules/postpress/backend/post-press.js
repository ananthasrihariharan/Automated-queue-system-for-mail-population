const express = require('express')
const router = express.Router()
const auth = require('../../../middleware/auth')
const authorize = require('../../../middleware/authorize')
const activityTracker = require('../../../middleware/activityTracker')
const jobWorkflow = require('../../../services/jobWorkflow')
const { callMicroservice } = require('../../../services/microserviceClient')
const { jobRepo } = require('../../../repositories')

const POST_PRESS_SERVICE_URL = process.env.POST_PRESS_SERVICE_URL || process.env.PRESS_SERVICE_URL

router.use(activityTracker)

router.get(
  '/incoming',
  auth,
  authorize('POST_PRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const data = await jobWorkflow.getIncomingPostPressJobs(req.query)
      res.json(data)
    } catch (err) {
      console.error('[Post Press Incoming GET Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to load incoming jobs' })
    }
  }
)

router.get(
  '/jobs',
  auth,
  authorize('POST_PRESS', 'ADMIN'),
  async (req, res) => {
    try {
      let data = null
      if (process.env.IS_MICROSERVICE !== 'true') {
        try {
          data = await callMicroservice(
            POST_PRESS_SERVICE_URL,
            'get',
            '/api/post-press/jobs',
            { query: req.query, timeout: 500 }
          )
        } catch (svcErr) {
          if (svcErr.status !== 503) throw svcErr
        }
      }
      if (!data) data = await jobWorkflow.getPostPressJobs(req.query)
      res.json(data)
    } catch (err) {
      console.error('[Post Press GET Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to load post press jobs' })
    }
  }
)

router.get(
  '/jobs/history',
  auth,
  authorize('POST_PRESS', 'ADMIN'),
  async (req, res) => {
    try {
      // All POST_PRESS staff see the full completed job history
      const userId = null
      const data = await jobWorkflow.getPostPressHistory({ ...req.query, userId })
      res.json(data)
    } catch (err) {
      console.error('[Post Press History GET Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to load post press history' })
    }
  }
)

router.get(
  '/lamination-products/available',
  auth,
  authorize('POST_PRESS', 'ADMIN', 'PREPRESS', 'PRESS', 'FINISHING', 'DISPATCH'),
  async (req, res) => {
    try {
      const { laminationProductRepo } = require('../../../repositories')
      const rolls = await laminationProductRepo.find({ deleted: false, isAvailable: true })
      res.json(rolls)
    } catch (err) {
      console.error('[Post Press Available Rolls Error]:', err)
      res.status(500).json({ message: 'Failed to fetch available rolls' })
    }
  }
)

router.patch(
  '/jobs/:jobId/complete-task',
  auth,
  authorize('POST_PRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const taskType = req.query.task_type
      const rawItemIndex = req.query.item_index
      const rollCode = req.query.roll_code
      const itemIndex =
        rawItemIndex === undefined || rawItemIndex === null || rawItemIndex === ''
          ? undefined
          : Number.parseInt(String(rawItemIndex), 10)
      if (!taskType) {
        return res.status(400).json({ message: 'task_type query param required (lamination or binding)' })
      }
      if (rawItemIndex !== undefined && !Number.isInteger(itemIndex)) {
        return res.status(400).json({ message: 'item_index must be a valid integer' })
      }
      let data = null
      if (process.env.IS_MICROSERVICE !== 'true') {
        try {
          data = await callMicroservice(
            POST_PRESS_SERVICE_URL,
            'patch',
            `/api/post-press/jobs/${req.params.jobId}/complete-task`,
            {
              query: {
                task_type: taskType,
                item_index: itemIndex,
                roll_code: rollCode,
                user_id: req.user._id?.toString?.() || String(req.user._id || '')
              },
              timeout: 500
            }
          )
        } catch (svcErr) {
          if (svcErr.status !== 503) throw svcErr
        }
      }
      if (!data) {
        data = await jobWorkflow.completePostPressTask(
          req.params.jobId,
          taskType,
          req.user._id,
          itemIndex,
          rollCode
        )
      }
      const io = req.app.get('io')
      if (io) {
        io.emit('workflow:updated', { jobId: req.params.jobId, taskType, itemIndex })
      }
      req.user.lastLoginAt = new Date()
      await req.user.save()
      res.json(data)
    } catch (err) {
      console.error('[Post Press PATCH Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to complete task' })
    }
  }
)

// â”€â”€ Task Start (records startedAt in taskLog) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post(
  '/jobs/:jobId/task-start',
  auth,
  authorize('POST_PRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const { taskType, itemIndex } = req.body
      const job = await jobRepo.findOne({ jobId: req.params.jobId })
      if (!job) return res.status(404).json({ message: 'Job not found' })
      if (!job.taskLog) job.taskLog = []
      // Only add if no existing open entry
      const exists = job.taskLog.find(
        l => l.task === taskType && l.itemIndex === itemIndex && l.module === 'post_press' && !l.completedAt
      )
      if (!exists) {
        job.taskLog.push({
          task: taskType, itemIndex,
          startedAt: new Date(), completedAt: null,
          durationMs: null,
          staffName: req.user?.name || '',
          staffId: req.user?._id || undefined,
          module: 'post_press'
        })
        job.markModified('taskLog')
        await job.save()
      }
      res.json({ ok: true })
    } catch (err) {
      console.error('[Post Press Task Start Error]:', err)
      res.status(500).json({ message: err.message || 'Failed to record task start' })
    }
  }
)

module.exports = router

