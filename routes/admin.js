const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const Job = require('../models/Job')

/**
 * GET UNPAID JOBS (ADMIN VIEW)
 */
router.get(
  '/jobs/unpaid',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const jobs = await Job.find(
        { paymentStatus: 'UNPAID' },
        {
          _id: 0,
          jobId: 1,
          customerName: 1,
          paymentStatus: 1
        }
      ).sort({ createdAt: -1 })

      res.json(jobs)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * APPROVE UNPAID DISPATCH
 */
router.patch(
  '/jobs/:jobId/approve-dispatch',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const { reason } = req.body

      // if (!reason) {
      //   return res.status(400).json({
      //     message: 'Approval reason is required'
      //   })
      // }

      const job = await Job.findOne({ jobId: req.params.jobId })

      if (!job) {
        return res.status(404).json({ message: 'Job not found' })
      }

      if (job.paymentStatus === 'PAID') {
        return res.status(400).json({
          message: 'Job already paid. Approval not required.'
        })
      }

      job.paymentStatus = 'ADMIN_APPROVED'
      job.adminApproval = {
        approvedBy: req.user._id,
        approvedAt: new Date(),
        reason
      }

      await job.save()

      res.json({
        message: 'Dispatch approved by admin',
        jobId: job.jobId,
        paymentStatus: job.paymentStatus
      })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router
