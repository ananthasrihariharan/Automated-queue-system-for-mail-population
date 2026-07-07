const express = require('express')
const router = express.Router()

const auth = require('../../../middleware/auth')
const authorize = require('../../../middleware/authorize')

const { jobRepo } = require('../../../repositories')
const activityTracker = require('../../../middleware/activityTracker')

router.use(activityTracker)

/**
 * GET JOBS FOR CASHIER (LAST 30 DAYS)
 * Role: CASHIER
 */
router.get(
  '/jobs',
  auth,
  authorize('CASHIER'),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, search = '', paymentStatus = 'ALL', hideDispatched = 'true', date = '' } = req.query
      const skip = (Number(page) - 1) * Number(limit)

      let targetDateStr = (date && date !== 'undefined' && date !== 'null') ? date : new Date().toISOString().split('T')[0]
      const startOfDay = new Date(targetDateStr)
      startOfDay.setUTCHours(0, 0, 0, 0)
      const endOfDay = new Date(targetDateStr)
      endOfDay.setUTCHours(23, 59, 59, 999)
      if (isNaN(startOfDay.getTime())) {
        const todayStr = new Date().toISOString().split('T')[0]
        startOfDay.setTime(new Date(todayStr).setUTCHours(0, 0, 0, 0))
        endOfDay.setTime(new Date(todayStr).setUTCHours(23, 59, 59, 999))
        targetDateStr = todayStr
      }

      console.log(`[CASHIER] Query: page=${page}, limit=${limit}, date=${targetDateStr}`)

      const { jobs, total } = await jobRepo.listJobsForCashier({
        createdAtStart: startOfDay,
        createdAtEnd: endOfDay,
        search: search.trim() || null,
        paymentStatus,
        hideDispatched: hideDispatched === 'true',
        skip,
        take: Number(limit)
      })

      res.json({
        jobs,
        total,
        pages: Math.ceil(total / Number(limit)),
        currentPage: Number(page)
      })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * MARK PAYMENT AS PAID
 * Role: CASHIER
 */
router.patch(
  '/jobs/:jobId/payment',
  auth,
  authorize('CASHIER'),
  async (req, res) => {
    try {
      const { paymentMode } = req.body

      const job = await jobRepo.findOne({ jobId: req.params.jobId })

      if (!job) {
        return res.status(404).json({ message: 'Job not found' })
      }

      if (job.paymentStatus === 'PAID') {
        return res.status(400).json({ message: 'Payment already marked as PAID' })
      }

      const updated = await jobRepo.updatePaymentStatus(job.id, 'PAID', req.user._id, paymentMode || 'CASH')

      res.json({
        message: 'Payment marked as PAID',
        job: updated
      })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router


