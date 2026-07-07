const express = require('express')
const router = express.Router()
const auth = require('../../../middleware/auth')
const authorize = require('../../../middleware/authorize')
const activityTracker = require('../../../middleware/activityTracker')
const jobWorkflow = require('../../../services/jobWorkflow')

router.use(activityTracker)

router.get(
  '/jobs',
  auth,
  authorize('PRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const data = await jobWorkflow.getPressJobs(req.query)
      res.json(data)
    } catch (err) {
      console.error('[Press GET Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to load press jobs' })
    }
  }
)

router.get(
  '/jobs/history',
  auth,
  authorize('PRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const data = await jobWorkflow.getPressHistory(req.query)
      res.json(data)
    } catch (err) {
      console.error('[Press History GET Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to load press history' })
    }
  }
)

router.patch(
  '/jobs/:jobId/finish',
  auth,
  authorize('PRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const data = await jobWorkflow.finishPressJob(req.params.jobId, req.user._id)
      const io = req.app.get('io')
      if (io) io.emit('workflow:updated', { jobId: req.params.jobId, taskType: 'press:finish' })
      req.user.lastLoginAt = new Date()
      await req.user.save()
      res.json(data)
    } catch (err) {
      console.error('[Press PATCH Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to finish job' })
    }
  }
)

router.patch(
  '/jobs/:jobId/confirm-item',
  auth,
  authorize('PRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const itemIndex = parseInt(req.query.item_index, 10)
      if (isNaN(itemIndex)) {
        return res.status(400).json({ message: 'item_index query param is required' })
      }
      const data = await jobWorkflow.confirmPressItem(req.params.jobId, itemIndex, req.user._id)
      const io = req.app.get('io')
      if (io) io.emit('workflow:updated', { jobId: req.params.jobId, taskType: 'press:confirm-item' })
      req.user.lastLoginAt = new Date()
      await req.user.save()
      res.json(data)
    } catch (err) {
      console.error('[Press Confirm Item Error]:', err)
      res.status(err.status || 500).json({ message: err.message || 'Failed to confirm item' })
    }
  }
)

module.exports = router

