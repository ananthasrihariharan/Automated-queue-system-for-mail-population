const express = require('express')
const router = express.Router()

const auth = require('../../../middleware/auth')
const authorize = require('../../../middleware/authorize')

const { jobRepo } = require('../../../repositories')
const { customerRepo } = require('../../../repositories')
const { invalidateCustomerCache } = require('../../../middleware/customerAuth')
const { generateInitialPassword } = require('../../../utils/password')
const activityTracker = require('../../../middleware/activityTracker')

router.use(activityTracker)

/**
 * GET PREPRESS JOBS (LAST 30 DAYS)
 * Role: PREPRESS
 */
router.get(
  '/jobs',
  auth,
  authorize('PREPRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        search = '',
        paymentStatus = 'ALL',
        date = ''
      } = req.query
      const skip = (Number(page) - 1) * Number(limit)

      // ADMIN sees all jobs; PREPRESS only sees their own
      const filter = (req.user.roles || []).includes('ADMIN') ? {} : { createdBy: req.user._id }

      // Apply Search Filter (JobId, Name, or Phone)
      if (search) {
        const searchRegex = { $regex: search.trim(), $options: 'i' }
        filter.$or = [
          { jobId: searchRegex },
          { customerName: searchRegex },
          { customerPhone: searchRegex }
        ]
      }

      // Apply Payment Filter
      if (paymentStatus && paymentStatus !== 'ALL') {
        filter.paymentStatus = paymentStatus
      }

      // Apply Date Filter (Exact day or default to Today)
      if (date) {
        // Robust parsing of YYYY-MM-DD to avoid timezone shifting
        const [y, m, d] = date.split('-').map(Number)
        const startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0)
        const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999)
        filter.createdAt = { $gte: startOfDay, $lte: endOfDay }
      } else {
        // Default to TODAY only (User's specific requirement)
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const endOfToday = new Date()
        endOfToday.setHours(23, 59, 59, 999)
        filter.createdAt = { $gte: startOfToday, $lte: endOfToday }
      }

      const jobs = await jobRepo.find(
        filter,
        {
          _id: 0,
          jobId: 1,
          customerName: 1,
          customerPhone: 1,
          totalItems: 1,
          itemScreenshots: 1,
          items: 1,
          packingPreference: 1,
          paymentStatus: 1,
          jobStatus: 1,
          createdAt: 1,
          defaultDeliveryType: 1,
          contactMe: 1
        }
      )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))

      const total = await jobRepo.countDocuments(filter)

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
 * GET TODAY'S JOBS BY CUSTOMER PHONE
 * Ã¢Å¡Â Ã¯Â¸Â  Must be defined BEFORE /jobs/:jobId to prevent Express matching
 *     "search" as a jobId wildcard.
 * Role: PREPRESS
 */
router.get(
  '/jobs/search/today',
  auth,
  authorize('PREPRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const { phone } = req.query
      if (!phone) return res.status(400).json({ message: 'phone is required' })

      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const endOfToday = new Date()
      endOfToday.setHours(23, 59, 59, 999)

      const jobs = await jobRepo.find({
        customerPhone: phone.trim(),
        createdAt: { $gte: startOfToday, $lte: endOfToday }
      }, {
        _id: 1,
        jobId: 1,
        customerName: 1,
        customerPhone: 1,
        jobStatus: 1,
        createdAt: 1
      }).sort({ createdAt: -1 })

      res.json(jobs)
    } catch (err) {
      console.error("[Prepress] Error searching today's jobs:", err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * GET SINGLE JOB STATUS (full items for workflow tracker)
 * Role: PREPRESS, ADMIN
 */
router.get(
  '/jobs/:jobId/status',
  auth,
  authorize('PREPRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const job = await jobRepo.findOne({ jobId: req.params.jobId })
        .populate('createdBy', 'name')
        .populate('dispatchedBy', 'name')
      if (!job) return res.status(404).json({ message: 'Job not found' })
      res.json(job)
    } catch (err) {
      console.error('[Prepress] Error fetching job status:', err)
      res.status(500).json({ message: 'Server error', error: err.message, stack: err.stack })
    }
  }
)

/**
 * GET SINGLE PREPRESS JOB BY ID
 * Role: PREPRESS
 */
router.get(
  '/jobs/:jobId',
  auth,
  authorize('PREPRESS', 'ADMIN'),
  async (req, res) => {
    try {
      // ADMIN can view any job; PREPRESS only their own
      const query = (req.user.roles || []).includes('ADMIN')
        ? { jobId: req.params.jobId }
        : { jobId: req.params.jobId, createdBy: req.user._id }
      const job = await jobRepo.findOne(query, {
        _id: 0,
        jobId: 1,
        customerName: 1,
        customerPhone: 1,
        totalItems: 1,
        itemScreenshots: 1,
        items: 1,
        packingPreference: 1,
        paymentStatus: 1,
        createdAt: 1,
        defaultDeliveryType: 1,
        contactMe: 1
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
 * GET CUSTOMER BY PHONE
 * Role: PREPRESS
 */
router.get(
  '/customer/by-phone/:phone',
  auth,
  authorize('PREPRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const customer = await customerRepo.findOne({
        $or: [
          { phone: req.params.phone },
          { alternatePhones: req.params.phone }
        ]
      })
      res.json(customer || null)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * SEARCH CUSTOMERS BY NAME
 * Role: PREPRESS
 */
router.get(
  '/customers/search',
  auth,
  authorize('PREPRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const { name } = req.query
      if (!name) return res.json([])

      // Escape special characters for regex
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      const customers = await customerRepo.find({
        $or: [
          { name: { $regex: escapedName, $options: 'i' } },
          { phone: { $regex: escapedName, $options: 'i' } },
          { alternatePhones: { $regex: escapedName, $options: 'i' } }
        ]
      }).limit(5)

      res.json(customers)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * GET CUSTOMER BY EMAIL (for mapping lookup on queue job cards)
 * Role: PREPRESS
 * Returns the customer whose emails[] contains the given email, or null.
 */
router.get(
  '/customer-by-email',
  auth,
  authorize('PREPRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const emailNorm = (req.query.email || '').toLowerCase().trim()
      if (!emailNorm) return res.json(null)

      const customer = await customerRepo.findOne({
        emails: emailNorm
      }).select('_id name phone emails')

      res.json(customer || null)
    } catch (err) {
      console.error('[Prepress] customer-by-email error:', err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * MAP EMAIL TO CUSTOMER
 * Role: PREPRESS
 * Adds an email to a customer's emails[] array (idempotent via $addToSet).
 */
router.post(
  '/map-email',
  auth,
  authorize('PREPRESS', 'ADMIN'),
  async (req, res) => {
    try {
      const { customerId, email } = req.body
      if (!customerId || !email) {
        return res.status(400).json({ message: 'customerId and email are required' })
      }

      const customer = await customerRepo.findByIdAndUpdate(
        customerId,
        { $addToSet: { emails: email.toLowerCase().trim() } },
        { new: true }
      ).select('_id name phone emails')

      if (!customer) {
        return res.status(404).json({ message: 'Customer not found' })
      }

      invalidateCustomerCache(customerId)
      res.json({ success: true, customer })
    } catch (err) {
      console.error('[Prepress] map-email error:', err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * CREATE JOB
 * Role: PREPRESS
 */
const upload = require('../../../middleware/upload')

const fs = require('fs')
const path = require('path')
const { getUploadBase } = require('../../../utils/uploadBase')
const { applyJobCardsToItems } = require('../../../utils/applyJobCardsToItems')

const normalizePostPressChoice = (value, allowedValues) => {
  // Strip parenthetical side suffixes like "(SINGLE SIDE)" before matching
  const raw = String(value || 'NONE').trim().toUpperCase().replace(/\s*\(.*\)$/, '').trim()
  return allowedValues.includes(raw) ? raw : 'NONE'
}

const { computeItemActiveStage } = require('../../../services/jobWorkflow')

const normalizePostPressItems = (items) => {
  return items.map((item) => {
    const pouchLamination = item.pouchLamination === true || item.pouchLamination === 'true'
    const lamination = normalizePostPressChoice(item.lamination, ['NONE', 'GLOSS', 'MATTE', 'VELVET'])
    const creasing = normalizePostPressChoice(item.creasing, ['NONE', 'CREASE', 'CREASE_PERF', 'WHEEL_PERF', 'PERFORATION'])
    const binding = normalizePostPressChoice(
      pouchLamination && (!item.binding || item.binding === 'NONE') ? 'POUCH_LAMINATION' : item.binding,
      ['NONE', 'PERFECT_BIND', 'SPIRAL_BIND', 'CENTER_PIN', 'SADDLE_STITCH', 'HALF_FOLD', 'TRI_FOLD', 'POUCH_LAMINATION']
    )
    const dieCutting = normalizePostPressChoice(item.dieCutting, ['NONE', 'HALF_CUT', 'FULL_CUT'])
    const cornerCutting = normalizePostPressChoice(item.cornerCutting, ['NONE', 'CORNER_CUT'])
    const cutting = normalizePostPressChoice(item.cutting, ['NONE', 'AERON_CUT', 'CORNER_CUT', 'HALF_CUT', 'FULL_CUT', 'TRIM'])

    return {
      ...item,
      pouchLamination,
      lamination,
      creasing,
      binding,
      dieCutting,
      cornerCutting,
      cutting,
      laminationStatus: lamination === 'NONE' ? 'NONE' : (item.laminationStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
      creasingStatus: creasing === 'NONE' ? 'NONE' : (item.creasingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
      bindingStatus: binding === 'NONE' ? 'NONE' : (item.bindingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
      dieCuttingStatus: dieCutting === 'NONE' ? 'NONE' : (item.dieCuttingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
      cornerCuttingStatus: cornerCutting === 'NONE' ? 'NONE' : (item.cornerCuttingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
      cuttingStatus: cutting === 'NONE' ? 'NONE' : (item.cuttingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'),
      // activeStage is computed after statuses are set Ã¢â‚¬â€ will be filled below
    }
  }).map(item => ({ ...item, activeStage: computeItemActiveStage(item) }))
}

router.post(
  '/jobs',
  auth,
  authorize('PREPRESS', 'ADMIN'),
  upload.array('screenshots'),
  async (req, res) => {
    try {
      let { jobId, customerName, customerPhone, defaultDeliveryType = 'COURIER', contactMe = false } = req.body
      const baseJobId = jobId
      let items = []
      if (req.body.items) {
        items = JSON.parse(req.body.items)
      }
      const totalItems = items.length

      // Ã¢Å“â€¦ Auto-Append Date Suffix (DDMMYY)
      const date = new Date()
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = String(date.getFullYear()).slice(-2)
      const fullYear = date.getFullYear()

      const dateString = `${day}-${month}-${fullYear}` // DD-MM-YYYY
      jobId = `${jobId}-${day}${month}${year}`

      const files = req.files || []

      if (!jobId || !customerName || !customerPhone || totalItems === 0) {
        return res.status(400).json({ message: 'Missing fields or zero items' })
      }

      // Ã°Å¸â€ºÂ¡Ã¯Â¸Â SANITIZATION CHECK
      if (!/^[a-zA-Z0-9-]+$/.test(jobId)) {
        return res.status(400).json({ message: 'Invalid Job ID format. Use only letters, numbers, and hyphens.' })
      }

      const exists = await jobRepo.findOne({ jobId })
      if (exists) {
        return res.status(400).json({ message: 'Job ID already exists' })
      }

      // Ã¢Å“â€¦ Find or Create Customer
      let customer = await customerRepo.findOne({ phone: customerPhone })
      if (!customer) {
        customer = await customerRepo.create({
          name: customerName,
          phone: customerPhone,
          password: generateInitialPassword(customerName, customerPhone)
        })
      }

      // Ã¢Å“â€¦ Now move files into job-specific folder with DATE
      const uploadBase = getUploadBase()
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

      // Map screenshots + Job Card (PPA) details to each item
      let finalizedItems = normalizePostPressItems(items.map((item) => {
        if (item.newFileIndex !== undefined) {
          item.screenshot = imagePaths[item.newFileIndex] || ''
          delete item.newFileIndex
        }
        return item
      }))

      finalizedItems = normalizePostPressItems(
        await applyJobCardsToItems(baseJobId, finalizedItems)
      )

      // Populate itemScreenshots for backward compatibility with cashiers/dispatch/packaging
      const itemScreenshots = finalizedItems.map(item => item.screenshot || '')

      const resolvedCustomerId = customer._id || customer.id
      const resolvedCustomerName = customer.name || customerName
      const resolvedCustomerPhone = customer.phone || customerPhone

      if (!resolvedCustomerId || !resolvedCustomerName || !resolvedCustomerPhone) {
        return res.status(500).json({
          message: 'Customer repository returned incomplete customer data'
        })
      }

      const job = await jobRepo.create({
        jobId,
        customerId: resolvedCustomerId,
        customerName: resolvedCustomerName,
        customerPhone: resolvedCustomerPhone,
        totalItems: Number(totalItems),
        items: finalizedItems,
        itemScreenshots: itemScreenshots,
        packingPreference: req.body.packingPreference,
        paymentStatus: 'UNPAID',
        jobStatus: 'PENDING',
        createdBy: req.user._id,
        defaultDeliveryType,
        contactMe: contactMe === 'true' || contactMe === true
      })

      // Rename temporary JobCards (e.g., '1_0' -> '1-040626_0') to prevent cross-day pollution
      const { jobCardRepo } = require('../../../repositories')
      for (let i = 0; i < totalItems; i++) {
        const tempCardId = `${baseJobId}_${i}`
        const targetCardId = `${jobId}_${i}`
        await jobCardRepo.findOneAndUpdate(
          { jobId: tempCardId },
          { jobId: targetCardId }
        )
      }

      res.status(201).json(job)
    } catch (err) {
      console.error('CREATE JOB ERROR:', {
        message: err.message,
        code: err.code,
        meta: err.meta,
        stack: err.stack?.split('\n').slice(0, 8).join('\n')
      })
      const message =
        err.code === 'ENOENT'
          ? 'Upload folder is not available. Check UPLOAD_PATH in .env or create the folder on disk.'
          : err.code === 'P2003'
            ? `Foreign key error: ${err.meta?.field_name || err.message}`
            : err.code === 'P2002'
              ? `Duplicate entry: ${err.meta?.target || err.message}`
              : err.name === 'ValidationError'
                ? `Validation failed: ${Object.values(err.errors || {}).map((e) => e.message).join(', ')}`
                : err.message || 'Unknown server error'
      res.status(500).json({ message })
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
      const { defaultDeliveryType, contactMe } = req.body
      const files = req.files || []
      const job = await jobRepo.findOne({ jobId: req.params.jobId, createdBy: req.user._id })

      if (!job) {
        return res.status(404).json({ message: 'Job not found or unauthorized' })
      }

      let items = []
      if (req.body.items) {
        items = JSON.parse(req.body.items)
      }

      job.totalItems = items.length

      if (defaultDeliveryType) {
        job.defaultDeliveryType = defaultDeliveryType
      }

      if (contactMe !== undefined) {
        job.contactMe = contactMe === 'true' || contactMe === true
      }

      // Move new files into job-specific folder
      const uploadBase = getUploadBase()

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

      // Map screenshots + Job Card (PPA) to items
      const existingItems = job.items || []

      let finalizedItems = normalizePostPressItems(items.map((item) => {
        if (item.newFileIndex !== undefined) {
          item.screenshot = newImagePaths[item.newFileIndex] || ''
          delete item.newFileIndex
        }
        return item
      }))

      finalizedItems = normalizePostPressItems(
        await applyJobCardsToItems(job.jobId, finalizedItems)
      )

      // Merge existing completed statuses back — don't reset work already done
      const specMatch = (a, b) => (a || 'NONE') === (b || 'NONE')
      finalizedItems = finalizedItems.map((item, idx) => {
        const ex = existingItems[idx] || {}
        const out = { ...item }
        if (specMatch(item.lamination,    ex.lamination))    out.laminationStatus    = ex.laminationStatus    || item.laminationStatus
        if (specMatch(item.creasing,      ex.creasing))      out.creasingStatus      = ex.creasingStatus      || item.creasingStatus
        if (specMatch(item.binding,       ex.binding))       out.bindingStatus       = ex.bindingStatus       || item.bindingStatus
        if (specMatch(item.dieCutting,    ex.dieCutting))    out.dieCuttingStatus    = ex.dieCuttingStatus    || item.dieCuttingStatus
        if (specMatch(item.cornerCutting, ex.cornerCutting)) out.cornerCuttingStatus = ex.cornerCuttingStatus || item.cornerCuttingStatus
        if (specMatch(item.cutting,       ex.cutting))       out.cuttingStatus       = ex.cuttingStatus       || item.cuttingStatus
        if (ex.pressStatus)                                  out.pressStatus         = ex.pressStatus
        if (ex.printConfirmed !== undefined)                 out.printConfirmed      = ex.printConfirmed
        out.activeStage = computeItemActiveStage(out, job)
        return out
      })

      job.items = finalizedItems
      job.itemScreenshots = finalizedItems.map(item => item.screenshot || '')

      await job.save()

      res.json({ message: 'Job updated successfully', job })
    } catch (err) {
      console.error('UPDATE JOB ERROR:', err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router



