const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const Job = require('../models/Job')
const Customer = require('../models/Customer')
const { generateInitialPassword } = require('../utils/password')

/**
 * GET PREPRESS JOBS (LAST 30 DAYS)
 * Role: PREPRESS
 */
router.get(
  '/jobs',
  auth,
  authorize('PREPRESS'),
  async (req, res) => {
    try {
      const last30Days = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      )

      const jobs = await Job.find(
        {
          createdBy: req.user._id,          // 🔒 ownership filter
          createdAt: { $gte: last30Days }
        },
        {
          _id: 0,
          jobId: 1,
          customerName: 1,
          totalItems: 1,
          itemScreenshots: 1,
          packingPreference: 1,
          paymentStatus: 1,
          createdAt: 1
        }
      ).sort({ createdAt: -1 })


      res.json(jobs)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * GET CUSTOMER BY PHONE
 * Role: PREPRESS
 */
router.get(
  '/customer/by-phone/:phone',
  auth,
  authorize('PREPRESS'),
  async (req, res) => {
    try {
      const customer = await Customer.findOne({ phone: req.params.phone })
      res.json(customer || null)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * CREATE JOB
 * Role: PREPRESS
 */
const upload = require('../middleware/upload')

const fs = require('fs')
const path = require('path')

router.post(
  '/jobs',
  auth,
  authorize('PREPRESS'),
  upload.array('screenshots'),
  async (req, res) => {
    try {
      const { jobId, customerName, customerPhone, totalItems } = req.body
      const files = req.files || []

      console.log('Received Job Creation Request:', { body: req.body, filesCount: files.length });

      if (!jobId || !customerName || !customerPhone || !totalItems) {
        console.log('Missing fields validation failed');
        return res.status(400).json({ message: 'Missing fields' })
      }

      if (files.length !== Number(totalItems)) {
        return res.status(400).json({
          message: `Upload exactly ${totalItems} screenshots`
        })
      }

      const exists = await Job.findOne({ jobId })
      if (exists) {
        return res.status(400).json({ message: 'Job ID already exists' })
      }

      // ✅ Find or Create Customer
      let customer = await Customer.findOne({ phone: customerPhone })
      if (!customer) {
        customer = await Customer.create({
          name: customerName,
          phone: customerPhone,
          password: generateInitialPassword(customerName, customerPhone)
        })
      }

      // ✅ Now move files into job-specific folder
      const jobDir = `uploads/jobs/${jobId}`
      if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true })
      }

      const imagePaths = []

      files.forEach((file) => {
        const newPath = path.join(jobDir, path.basename(file.path))
        fs.renameSync(file.path, newPath)
        imagePaths.push(newPath)
      })

      const job = await Job.create({
        jobId,
        customerId: customer._id,
        customerName: customer.name,
        customerPhone: customer.phone,
        totalItems: Number(totalItems),
        itemScreenshots: imagePaths,
        packingPreference: req.body.packingPreference,
        paymentStatus: 'UNPAID',
        createdBy: req.user._id
      })

      res.status(201).json(job)
    } catch (err) {
      console.error('CREATE JOB ERROR:', err)
      res.status(500).json({ message: err.message })
    }
  }
)

module.exports = router
