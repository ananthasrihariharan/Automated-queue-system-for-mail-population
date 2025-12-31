const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const Job = require('../models/Job')

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
      const { jobId, customerName, totalItems } = req.body
      const files = req.files || []

      console.log('Received Job Creation Request:', { body: req.body, filesCount: files.length });

      if (!jobId || !customerName || !totalItems) {
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
        customerName,
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
