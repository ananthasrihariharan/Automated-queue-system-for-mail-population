const express = require('express')
const router = express.Router()

const { jobRepo } = require('../../../repositories')
const customerAuth = require('../../../middleware/customerAuth')

/**
 * GET JOB DETAILS
 * Role: CUSTOMER (Authenticated)
 */
router.get(
  '/jobs/:jobId',
  customerAuth,
  async (req, res) => {
    try {
      const job = await jobRepo.findOne({
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
router.post('/jobs/:jobId/packing', customerAuth, async (req, res) => {
  try {
    const { packingPreference, parcels } = req.body

    if (!['SINGLE', 'MULTIPLE'].includes(packingPreference)) {
      return res.status(400).json({ message: 'Invalid packing preference' })
    }

    const job = await jobRepo.findOne({ jobId: req.params.jobId })

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
      const jobs = await jobRepo.listJobsForCustomer({
        customerId: req.customer.customerId,
        status
      })
      res.json(jobs)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router


