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
          customerPhone: 1,
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
      let { jobId, customerName, customerPhone, totalItems } = req.body

      // ✅ Auto-Append Date Suffix (DDMMYY)
      const date = new Date()
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = String(date.getFullYear()).slice(-2)
      const fullYear = date.getFullYear()

      const dateString = `${day}-${month}-${fullYear}` // DD-MM-YYYY
      jobId = `${jobId}-${day}${month}${year}`

      const files = req.files || []


      if (!jobId || !customerName || !customerPhone || !totalItems) {
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

      // ✅ Now move files into job-specific folder with DATE
      const uploadBase = process.env.UPLOAD_PATH || 'uploads'
      // Structure: uploads/jobs/DD-MM-YYYY/JobId
      const jobDir = path.join(uploadBase, 'jobs', dateString, jobId)

      if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true })
      }

      const imagePaths = []

      files.forEach((file) => {
        const filename = path.basename(file.path)
        const newPath = path.join(jobDir, filename)
        fs.renameSync(file.path, newPath)
        // Store relative path for frontend (starting with uploads/)
        imagePaths.push(`uploads/jobs/${dateString}/${jobId}/${filename}`)
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

/**
 * UPDATE JOB (Edit Total Items & Screenshots)
 * Role: PREPRESS
 */
router.patch(
  '/jobs/:jobId',
  auth,
  authorize('PREPRESS'),
  upload.array('screenshots'),
  async (req, res) => {
    try {
      const { totalItems, keptScreenshots: keptJson } = req.body
      const files = req.files || []
      const job = await Job.findOne({ jobId: req.params.jobId, createdBy: req.user._id })

      if (!job) {
        return res.status(404).json({ message: 'Job not found or unauthorized' })
      }

      const keptScreenshots = keptJson ? JSON.parse(keptJson) : []
      const totalCount = keptScreenshots.length + files.length

      if (totalItems !== undefined) {
        job.totalItems = Number(totalItems)
      }

      // Validation: Total images must match totalItems
      if (totalCount !== job.totalItems) {
        return res.status(400).json({
          message: `Expected ${job.totalItems} images, but got ${totalCount} (${keptScreenshots.length} kept + ${files.length} new)`
        })
      }

      // Move new files into job-specific folder
      const uploadBase = process.env.UPLOAD_PATH || 'uploads'

      // 1. Try to find existing Date-Based Folder logic
      const date = new Date(job.createdAt)
      const dateString = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`

      const newStyleDir = path.join(uploadBase, 'jobs', dateString, job.jobId)
      const legacyDir = path.join(uploadBase, 'jobs', job.jobId)

      let finalJobDir = legacyDir
      let finalRelativeBase = `uploads/jobs/${job.jobId}`

      // If new style folder exists, OR if legacy doesn't exist (force new structure for broken/new cases)
      if (fs.existsSync(newStyleDir)) {
        finalJobDir = newStyleDir
        finalRelativeBase = `uploads/jobs/${dateString}/${job.jobId}`
      } else if (!fs.existsSync(legacyDir)) {
        // If neither exists, create new style
        finalJobDir = newStyleDir
        finalRelativeBase = `uploads/jobs/${dateString}/${job.jobId}`
      }

      if (!fs.existsSync(finalJobDir)) {
        fs.mkdirSync(finalJobDir, { recursive: true })
      }

      const newImagePaths = []
      files.forEach((file) => {
        const filename = path.basename(file.path)
        const newPath = path.join(finalJobDir, filename)
        fs.renameSync(file.path, newPath)
        newImagePaths.push(`${finalRelativeBase}/${filename}`)
      })

      // Combine kept screenshots with new ones
      job.itemScreenshots = [...keptScreenshots, ...newImagePaths]

      await job.save()
      res.json({ message: 'Job updated successfully', job })
    } catch (err) {
      console.error('UPDATE JOB ERROR:', err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router
