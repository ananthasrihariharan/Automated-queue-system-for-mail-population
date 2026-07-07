const express = require('express')
const router = express.Router()
const auth = require('../../../middleware/auth')
const authorize = require('../../../middleware/authorize')
const activityTracker = require('../../../middleware/activityTracker')
const jobWorkflow = require('../../../services/jobWorkflow')
const { callMicroservice } = require('../../../services/microserviceClient')
const { jobRepo } = require('../../../repositories')

const FINISHING_SERVICE_URL = process.env.FINISHING_SERVICE_URL || process.env.PRESS_SERVICE_URL

// All finishing sub-roles
const ALL_FINISHING_ROLES = ['FINISHING', 'FINISHING_CUTTING', 'FINISHING_DIE_CUTTING', 'FINISHING_CREASING', 'FINISHING_CORNER_CUT', 'ADMIN']

// Map sub-role â†’ allowed task types
const ROLE_TASK_MAP = {
  FINISHING_CUTTING:    ['cutting', 'cutting2'],
  FINISHING_DIE_CUTTING: ['dieCutting'],
  FINISHING_CREASING:   ['creasing'],
  FINISHING_CORNER_CUT: ['cornerCutting'],
  FINISHING:            null, // null = all tasks allowed
  ADMIN:                null
}

const FINISHING_SUB_ROLES = ['FINISHING_CUTTING', 'FINISHING_DIE_CUTTING', 'FINISHING_CREASING', 'FINISHING_CORNER_CUT']

/** Union of allowed task types â€” sub-roles take priority over general FINISHING. */
function getAllowedTasksForUser(userRoles) {
  if (userRoles.includes('ADMIN')) return null

  const subRoleTasks = []
  for (const role of FINISHING_SUB_ROLES) {
    if (userRoles.includes(role) && ROLE_TASK_MAP[role]) {
      subRoleTasks.push(...ROLE_TASK_MAP[role])
    }
  }
  if (subRoleTasks.length) return [...new Set(subRoleTasks)]

  if (userRoles.includes('FINISHING')) return null
  return null
}

/**
 * For sub-role users, always force taskType â€” supports multiple finishing roles.
 */
function injectTaskFilter(req) {
  const userRoles = req.user.roles || []
  const allowed = getAllowedTasksForUser(userRoles)
  if (!allowed) return null

  req.query.taskType = allowed.join(',')
  return allowed
}

router.use(activityTracker)

router.get(
  '/jobs/incoming',
  auth,
  authorize(...ALL_FINISHING_ROLES),
  async (req, res) => {
    try {
      // Inject task filter for sub-role users so they only see their relevant jobs
      injectTaskFilter(req)
      const data = await jobWorkflow.getIncomingFinishingJobs(req.query)
      res.json(data)
    } catch (err) {
      console.error('[Finishing Incoming GET Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to load incoming finishing jobs' })
    }
  }
)

router.get(
  '/jobs',
  auth,
  authorize(...ALL_FINISHING_ROLES),
  async (req, res) => {
    try {
      injectTaskFilter(req)
      let data = null
      if (process.env.IS_MICROSERVICE !== 'true') {
        try {
          data = await callMicroservice(
            FINISHING_SERVICE_URL,
            'get',
            '/api/finishing/jobs',
            { query: req.query, timeout: 500 }
          )
        } catch (svcErr) {
          if (svcErr.status !== 503) throw svcErr
        }
      }
      if (!data) data = await jobWorkflow.getFinishingJobs(req.query)
      const allowed = getAllowedTasksForUser(req.user.roles || [])
      if (allowed && data?.jobs) {
        data.jobs = jobWorkflow.filterFinishingJobsByTasks(data.jobs, allowed)
      }
      res.json(data)
    } catch (err) {
      console.error('[Finishing GET Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to load finishing jobs' })
    }
  }
)

router.get(
  '/jobs/history',
  auth,
  authorize(...ALL_FINISHING_ROLES),
  async (req, res) => {
    try {
      injectTaskFilter(req)
      // Non-ADMIN users see only their own completed jobs
      const userId = req.user.roles?.includes('ADMIN') ? null : req.user._id
      const data = await jobWorkflow.getFinishingHistory({ ...req.query, userId })
      // NOTE: do NOT call filterFinishingJobsByTasks here for history.
      // Completed items have activeStage="done" â€” that filter would drop every result.
      // The $or query inside getFinishingHistory already scopes results to the correct stages.
      res.json(data)
    } catch (err) {
      console.error('[Finishing History GET Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to load finishing history' })
    }
  }
)

router.patch(
  '/jobs/:jobId/complete-task',
  auth,
  authorize(...ALL_FINISHING_ROLES),
  async (req, res) => {
    try {
      const rawItemIndex = req.query.item_index
      const taskType = req.query.task_type || 'cutting'
      const itemIndex =
        rawItemIndex === undefined || rawItemIndex === null || rawItemIndex === ''
          ? undefined
          : Number.parseInt(String(rawItemIndex), 10)
      if (rawItemIndex !== undefined && !Number.isInteger(itemIndex)) {
        return res.status(400).json({ message: 'item_index must be a valid integer' })
      }

      const userRoles = req.user.roles || []
      const allowedTasks = getAllowedTasksForUser(userRoles)
      if (allowedTasks && !allowedTasks.includes(taskType)) {
        return res.status(403).json({
          message: `You can only complete: ${allowedTasks.join(', ')}`
        })
      }

      let data = null
      if (process.env.IS_MICROSERVICE !== 'true') {
        try {
          data = await callMicroservice(
            FINISHING_SERVICE_URL,
            'patch',
            `/api/finishing/jobs/${req.params.jobId}/complete-task`,
            {
              query: {
                task_type: taskType,
                item_index: itemIndex,
                user_id: req.user._id?.toString?.() || String(req.user._id || '')
              },
              timeout: 500
            }
          )
        } catch (svcErr) {
          if (svcErr.status !== 503) throw svcErr
        }
      }
      if (!data) data = await jobWorkflow.completeFinishingTask(req.params.jobId, req.user._id, itemIndex, taskType)

      const io = req.app.get('io')
      if (io) {
        io.emit('workflow:updated', { jobId: req.params.jobId, taskType, itemIndex })
      }

      req.user.lastLoginAt = new Date()
      await req.user.save()
      res.json(data)
    } catch (err) {
      console.error('[Finishing PATCH Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to complete task' })
    }
  }
)


// â”€â”€ Task Start (records startedAt in taskLog) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post(
  '/jobs/:jobId/task-start',
  auth,
  authorize(...ALL_FINISHING_ROLES),
  async (req, res) => {
    try {
      const { taskType, itemIndex } = req.body
      const job = await jobRepo.findOne({ jobId: req.params.jobId })
      if (!job) return res.status(404).json({ message: 'Job not found' })
      if (!job.taskLog) job.taskLog = []
      const exists = job.taskLog.find(
        l => l.task === taskType && l.itemIndex === itemIndex && l.module === 'finishing' && !l.completedAt
      )
      if (!exists) {
        job.taskLog.push({
          task: taskType, itemIndex,
          startedAt: new Date(), completedAt: null,
          durationMs: null,
          staffName: req.user?.name || '',
          staffId: req.user?._id || undefined,
          module: 'finishing'
        })
        job.markModified('taskLog')
        await job.save()
      }
      res.json({ ok: true })
    } catch (err) {
      console.error('[Finishing Task Start Error]:', err)
      res.status(500).json({ message: err.message || 'Failed to record task start' })
    }
  }
)

module.exports = router

