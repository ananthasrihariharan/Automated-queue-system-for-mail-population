const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const Job = require('../models/Job')
const User = require('../models/User')

/**
 * CREATE JOB (PREPRESS)
 */
router.post(
  '/jobs',
  auth,
  authorize('PREPRESS'),
  async (req, res) => {
    try {
      const {
        jobId,
        customerId,
        totalItems,
        itemScreenshots = []
      } = req.body

      // basic validation
      if (!jobId || !customerId || !totalItems) {
        return res.status(400).json({
          message: 'jobId, customerId and totalItems are required'
        })
      }

      // check duplicate job
      const existingJob = await Job.findOne({ jobId })
      if (existingJob) {
        return res.status(409).json({
          message: 'Job ID already exists'
        })
      }

      // validate customer
      const customer = await User.findById(customerId)
      if (!customer || customer.role !== 'CUSTOMER') {
        return res.status(400).json({
          message: 'Invalid customer'
        })
      }

      // create job
      const job = await Job.create({
        jobId,
        customerId,
        customerName: customer.name,
        totalItems,
        itemScreenshots,
        createdBy: req.user._id
      })

      return res.status(201).json({
        message: 'Job created successfully',
        job
      })

    } catch (err) {
      console.error(err)
      return res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router
