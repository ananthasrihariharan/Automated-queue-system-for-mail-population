const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const Job = require('../models/Job')
const {
  generateInitialPassword,
  hashPassword
} = require('../utils/password')

router.post(
  '/users',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    const { name, phone, roles } = req.body

    const plainPassword = generateInitialPassword(name, phone)

    const user = await User.create({
      name,
      phone,
      roles,
      password: plainPassword
    })

    res.json({
      message: 'User created',
      initialPassword: plainPassword // show ONCE
    })
  }
)

/**
 * GET JOBS FOR ADMIN (LAST 30 DAYS)
 */
router.get(
  '/jobs',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const last30Days = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      )

      const jobs = await Job.find(
        { createdAt: { $gte: last30Days } },
        {
          jobId: 1,
          customerName: 1,
          paymentStatus: 1,
          packingPreference: 1,
          jobStatus: 1,
          createdAt: 1,
          adminApprovalNote: 1
        }
      ).sort({ createdAt: -1 })

      res.json(jobs)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * ADMIN APPROVE UNPAID DISPATCH
 */
router.patch(
  '/jobs/:jobId/approve-dispatch',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const { note } = req.body

      const job = await Job.findOne({ jobId: req.params.jobId })
      if (!job) {
        return res.status(404).json({ message: 'Job not found' })
      }

      if (job.paymentStatus === 'PAID') {
        return res.status(400).json({
          message: 'Payment already completed'
        })
      }

      job.paymentStatus = 'ADMIN_APPROVED'
      job.adminApprovalNote = note || 'Approved by admin'
      job.adminApprovedAt = new Date()

      await job.save()

      res.json({
        message: 'Dispatch approved by admin',
        jobId: job.jobId
      })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router
