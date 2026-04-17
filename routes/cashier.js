const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const Job = require('../models/Job')
const activityTracker = require('../middleware/activityTracker')

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
      const { page = 1, limit = 50 } = req.query
      const skip = (Number(page) - 1) * Number(limit)

      const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const filter = { createdAt: { $gte: last30Days } }

      const jobs = await Job.find(filter, {
        _id: 0,
        jobId: 1,
        customerName: 1,
        paymentStatus: 1,
        jobStatus: 1,
        createdAt: 1,
        customerId: 1
      }
      ).sort({ createdAt: -1 })
        .populate('customerId', 'isCreditCustomer')
        .skip(skip)
        .limit(Number(limit))

      const total = await Job.countDocuments(filter)

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

      const job = await Job.findOne({ jobId: req.params.jobId })

      if (!job) {
        return res.status(404).json({ message: 'Job not found' })
      }

      if (job.paymentStatus === 'PAID') {
        return res.status(400).json({ message: 'Payment already marked as PAID' })
      }

      job.paymentStatus = 'PAID'
      job.paymentHandledBy = req.user._id
      // job.paymentMode = paymentMode || 'CASH'
      await job.save()

      res.json({
        message: 'Payment marked as PAID',
        job
      })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router
