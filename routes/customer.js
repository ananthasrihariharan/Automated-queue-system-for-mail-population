const express = require('express')
const router = express.Router()

const Job = require('../models/Job')
const customerAuth = require('../middleware/customerAuth')

/**
 * GET JOB DETAILS
 * Role: CUSTOMER (Authenticated)
 */
router.get(
  '/jobs/:jobId',
  customerAuth,
  async (req, res) => {
    try {
      const job = await Job.findOne({
        jobId: req.params.jobId,
        customerId: req.customer.customerId
      })

      if (!job) {
        return res.status(404).json({ message: 'Job not found' })
      }

      res.json(job)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * SAVE CUSTOMER PACKING DECISION
 * No auth, no role
 */
router.post('/jobs/:jobId/packing', async (req, res) => {
  try {
    const { packingPreference, parcels } = req.body

    if (!['SINGLE', 'MULTIPLE'].includes(packingPreference)) {
      return res.status(400).json({ message: 'Invalid packing preference' })
    }

    const job = await Job.findOne({ jobId: req.params.jobId })

    if (!job) {
      return res.status(404).json({ message: 'Job not found' })
    }

    job.packingPreference = packingPreference
    job.parcels = parcels
    job.customerConfirmedAt = new Date()

    await job.save()

    res.json({ message: 'Packing confirmed' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

/**
 * GET ALL JOBS FOR LOGGED-IN CUSTOMER
 * Uses customerAuth middleware
 */
router.get(
  '/jobs',
  customerAuth,
  async (req, res) => {
    try {
      const { status } = req.query

      // Build filter
      const filter = { customerId: req.customer.customerId }

      // Filter by job status if specified
      if (status === 'active') {
        filter.jobStatus = { $ne: 'DISPATCHED' }
      } else if (status === 'history') {
        filter.jobStatus = 'DISPATCHED'
      }

      const jobs = await Job.find(
        filter,
        {
          jobId: 1,
          createdAt: 1,
          jobStatus: 1,
          totalItems: 1,
          packingPreference: 1,
          dispatchedAt: 1,
          rackLocation: 1,
          itemScreenshots: 1
        }
      ).sort({ createdAt: -1 })

      res.json(jobs)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router
