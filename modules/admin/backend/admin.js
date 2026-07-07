const express = require('express')
const router = express.Router()

const auth = require('../../../middleware/auth')
const authorize = require('../../../middleware/authorize')

const { jobRepo } = require('../../../repositories')
const { userRepo } = require('../../../repositories')
const { systemConfigRepo } = require('../../../repositories')
const { customerRepo } = require('../../../repositories')
const { invalidateCustomerCache } = require('../../../middleware/customerAuth')
const {
  generateInitialPassword,
  hashPassword
} = require('../../../utils/password')
const activityTracker = require('../../../middleware/activityTracker')
const processRegistry = require('../../../services/processRegistry')

router.use(activityTracker)

// Ã¢â€â‚¬Ã¢â€â‚¬ Default production timings (in minutes) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Sourced from the process registry (single source of truth). Seeded with the
// former hardcoded values, so behaviour is unchanged.
const DEFAULT_TIMINGS = processRegistry.getTimings()

/**
 * CALCULATE CREASING DURATION BASED ON LAMINATION QTY
 * If lamination qty > 100, add 1 hour (60 minutes) for each 100 qty
 * @param {number} laminationQty - Total lamination quantity
 * @returns {number} - Creasing duration in minutes
 */
function calculateCreasingDuration(laminationQty) {
  const baseCreasingTime = DEFAULT_TIMINGS.creasing // 30 minutes
  
  if (!laminationQty || laminationQty <= 100) {
    return baseCreasingTime
  }
  
  // For qty > 100: add 60 minutes for each complete 100+ bucket
  // qty 101-200 = 1 extra hour, qty 201-300 = 2 extra hours, etc.
  const additionalHours = Math.floor((laminationQty - 1) / 100) * 60
  return baseCreasingTime + additionalHours
}

/**
 * GET PRODUCTION TIMINGS
 */
router.get('/production-timings', auth, async (req, res) => {
  try {
    const doc = await systemConfigRepo.findOne({ key: 'productionTimings' })
    res.json(doc ? doc.value : DEFAULT_TIMINGS)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

/**
 * PUT PRODUCTION TIMINGS (Admin only)
 */
router.put('/production-timings', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const timings = req.body
    await systemConfigRepo.findOneAndUpdate(
      { key: 'productionTimings' },
      { key: 'productionTimings', value: timings, updatedAt: new Date() },
      { upsert: true, new: true }
    )
    res.json({ message: 'Timings updated', timings })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS REGISTRY — admin-configurable products, workflow stages, variants.
// Backed by SystemConfig (key `tenant:<id>:processRegistry`) via processRegistry.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET the full merged registry (defaults overlaid with saved config).
 * Any authenticated user may read it (dropdowns need it).
 */
router.get('/process-registry', auth, async (req, res) => {
  try {
    await processRegistry.refresh()
    res.json(processRegistry.getMergedRegistry())
  } catch (err) {
    console.error('ERROR in GET /process-registry:', err)
    res.status(500).json({ message: 'Server error', error: err.message, stack: err.stack })
  }
})

/**
 * PUT (partial) update to the registry (Admin only). Accepts any subset of
 * { productTypes, postPressStages, finishingStages, laminationVariants, timings }.
 * Validated + versioned inside processRegistry.save().
 */
router.put('/process-registry', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const merged = await processRegistry.save(req.body || {}, { updatedBy: req.user?._id })
    res.json({ message: 'Registry updated', registry: merged })
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message })
    res.status(500).json({ message: 'Server error' })
  }
})

// ── Products (a thin view over registry.productTypes, for the CreateJob dropdown)

/** GET the product-type list. Any authenticated user (job creation needs it). */
router.get('/products', auth, async (req, res) => {
  try {
    await processRegistry.refresh()
    res.json(processRegistry.getProductTypes())
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

/** POST add a product type (Admin only). Body: { name, productId, template }. */
router.post('/products', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const productId = String(req.body?.productId || '').trim()
    const template = req.body?.template ? String(req.body.template).trim() : 'none'
    const openingDirection = req.body?.openingDirection ? String(req.body.openingDirection).trim() : (template === 'booklet' ? 'portrait' : 'none')
    const bindingSide = req.body?.bindingSide ? String(req.body.bindingSide).trim() : (template === 'booklet' ? 'left' : 'none')
    const bindingMargin = req.body?.bindingMargin !== undefined ? Number(req.body.bindingMargin) : (template === 'booklet' ? 10 : 0)

    if (!name) return res.status(400).json({ message: 'name is required' })
    const current = processRegistry.getProductTypes()
    if (current.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ message: 'Product already exists' })
    }
    if (productId && current.some((p) => p.id.toLowerCase() === productId.toLowerCase())) {
      return res.status(409).json({ message: 'Product ID already exists' })
    }

    if (template === 'booklet') {
      if (!['portrait', 'landscape', 'none'].includes(openingDirection)) {
        return res.status(400).json({ message: "openingDirection must be 'portrait', 'landscape', or 'none'" })
      }
      if (!['left', 'right', 'top', 'bottom', 'none'].includes(bindingSide)) {
        return res.status(400).json({ message: "bindingSide must be 'left', 'right', 'top', 'bottom', or 'none'" })
      }
      if (!Number.isFinite(bindingMargin) || bindingMargin < 0) {
        return res.status(400).json({ message: "bindingMargin must be a non-negative number" })
      }
    }

    const newProduct = {
      id: productId || `P${String(current.length + 1).padStart(3, '0')}`,
      name,
      template,
      openingDirection,
      bindingSide,
      bindingMargin
    }
    const merged = await processRegistry.save({ productTypes: [...current, newProduct] }, { updatedBy: req.user?._id })
    res.status(201).json({ message: 'Product added', products: merged.productTypes })
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message })
    res.status(500).json({ message: 'Server error' })
  }
})

/** DELETE remove a product type by name (Admin only). */
router.delete('/products/:name', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const name = String(req.params.name || '').trim()
    const current = processRegistry.getProductTypes()
    const next = current.filter((p) => p.name.toLowerCase() !== name.toLowerCase())
    if (next.length === current.length) {
      return res.status(404).json({ message: 'Product not found' })
    }
    const merged = await processRegistry.save({ productTypes: next }, { updatedBy: req.user?._id })
    res.json({ message: 'Product removed', products: merged.productTypes })
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message })
    res.status(500).json({ message: 'Server error' })
  }
})

// ── Printable Margin ──────────────────────────────────────────────────────────
// Company-wide printable margin (mm per side) used by the UPS calculator when
// computing the printable area of a sheet. Backed by SystemConfig.
const DEFAULT_PRINTABLE_MARGIN = 5

/** GET the printable margin. Any authenticated user (CreateJob needs it). */
router.get('/printable-margin', auth, async (req, res) => {
  try {
    const doc = await systemConfigRepo.findOne({ key: 'printableMargin' })
    const value = doc && doc.value != null ? Number(doc.value) : DEFAULT_PRINTABLE_MARGIN
    res.json({ printableMargin: isFinite(value) ? value : DEFAULT_PRINTABLE_MARGIN })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

/** PUT the printable margin (Admin only). Body: { printableMargin }. */
router.put('/printable-margin', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const value = Number(req.body?.printableMargin)
    if (!isFinite(value) || value < 0) {
      return res.status(400).json({ message: 'printableMargin must be a non-negative number' })
    }
    await systemConfigRepo.findOneAndUpdate(
      { key: 'printableMargin' },
      { key: 'printableMargin', value, description: 'Printable margin in mm per side (UPS calculator)', updatedAt: new Date() },
      { upsert: true, new: true }
    )
    res.json({ printableMargin: value })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})



/**
 * GET JOBS FOR ADMIN (LAST 30 DAYS)
 */
router.get(
  '/jobs',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, date, search, paymentStatus, status, process, hideDispatched, submittedBy } = req.query
      console.log('[ADMIN /jobs] req.query:', req.query)
      const skip = (Number(page) - 1) * Number(limit)

      let filter = {}

      const hasSearch = search && search.trim() !== ''
      const hasSubmittedBy = submittedBy && submittedBy.trim() !== ''

      if (hasSearch || hasSubmittedBy) {
        // Global Search: Ignore date boundary and query across all dates
        if (hasSearch) {
          // Match job ID prefix (the number before the date dash) OR full jobId OR customer name
          // jobId format: "12-150626" Ã¢â‚¬â€ search "12" should match jobs starting with "12-"
          const trimmed = search.trim()
          const jobIdRegex = /^\d+$/.test(trimmed)
            ? new RegExp(`^${trimmed}-`, 'i')   // numeric-only Ã¢â€ â€™ match prefix "12-..."
            : new RegExp(trimmed, 'i')            // non-numeric Ã¢â€ â€™ substring match
          const nameRegex = new RegExp(trimmed, 'i')
          filter.$or = [
            { jobId: jobIdRegex },
            { customerName: nameRegex }
          ]
        }
        if (hasSubmittedBy) {
          const ids = String(submittedBy).split(',').map(s => s.trim()).filter(Boolean)
          filter.createdBy = { $in: ids }
        }
      } else if (date) {
        // Historical View: Strict Date Filter
        const queryDate = new Date(date)
        const nextDay = new Date(queryDate)
        nextDay.setDate(nextDay.getDate() + 1)

        filter.createdAt = {
          $gte: queryDate,
          $lt: nextDay
        }
      } else {
        // Fresh Daily Logic (Default)
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)

        filter.$or = [
          { jobStatus: { $ne: 'DISPATCHED' } }, // Backlog
          { jobStatus: 'DISPATCHED', dispatchedAt: { $gte: startOfToday } } // Today's Done
        ]
      }

      // Secondary Filters
      if (paymentStatus && paymentStatus !== 'ALL') {
        if (paymentStatus === 'PAID') {
          filter.paymentStatus = { $in: ['PAID', 'ADMIN_APPROVED'] }
        } else {
          filter.paymentStatus = paymentStatus
        }
      }

      if (status && status !== 'ALL') {
        filter.jobStatus = status
      }

      if (hideDispatched === 'true') {
        if (filter.jobStatus) {
          if (typeof filter.jobStatus === 'object' && filter.jobStatus.$ne) {
            // Already $ne, leave it
          } else if (filter.jobStatus === 'DISPATCHED') {
            // Conflicting filter: requested status is DISPATCHED but active only is checked.
            // In this case, we allow DISPATCHED since it is explicitly requested by status filter.
          }
        } else {
          filter.jobStatus = { $ne: 'DISPATCHED' }
        }
      }

      if (process && process !== 'ALL') {
        filter[`items.${process}`] = { $exists: true, $ne: 'NONE', $nin: ['', null] }
      }

      const jobs = await jobRepo.find(
        filter,
        {
          jobId: 1,
          customerName: 1,
          paymentStatus: 1,
          packingPreference: 1,
          jobStatus: 1,
          createdAt: 1,
          adminApprovalNote: 1,
          customerId: 1,
          defaultDeliveryType: 1,
          contactMe: 1,
          packedBy: 1,
          items: 1,
          ppsCompletedAt: 1,
          finishingCompletedAt: 1,
          dispatchedAt: 1,
          taskLog: 1,
        }
      ).sort({ createdAt: -1 })
        .populate('createdBy', 'name')
        .populate('paymentHandledBy', 'name')
        .populate('dispatchedBy', 'name')
        .populate('packedBy', 'name')
        .populate('customerId', 'isCreditCustomer')
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
 * ADMIN APPROVE UNPAID DISPATCH
 */
router.patch(
  '/jobs/:jobId/approve-dispatch',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const { note } = req.body

      const job = await jobRepo.findOne({ jobId: req.params.jobId })
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
      job.paymentHandledBy = req.user._id
      job.paymentHandledById = Number(req.user._id)

      await job.save()

      // Update Activity
      req.user.lastLoginAt = new Date()
      await req.user.save()

      res.json({
        message: 'Dispatch approved by admin',
        jobId: job.jobId
      })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * ADMIN ITEM STATUS OVERRIDE
 * Allows admin to manually set any workflow task status on a specific item.
 */
router.patch(
  '/jobs/:jobId/items/:itemIndex/override',
  auth,
  authorize('ADMIN'),
  async (req, res) => {
    try {
      const { task, status } = req.body
      const VALID_TASKS = ['press', 'lamination', 'creasing', 'binding', 'dieCutting', 'cornerCutting', 'cutting', 'foil', 'fusing', 'holes', 'cutting2']
      const VALID_STATUSES = ['PENDING', 'COMPLETED', 'NONE']
      if (!task || !VALID_TASKS.includes(task)) return res.status(400).json({ message: 'Invalid task' })
      if (!status || !VALID_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' })

      const job = await jobRepo.findOne({ jobId: req.params.jobId })
      if (!job) return res.status(404).json({ message: 'Job not found' })

      const idx = Number(req.params.itemIndex)
      const item = job.items && job.items[idx]
      if (!item) return res.status(404).json({ message: 'Item not found' })

      if (task === 'press') {
        item.pressStatus = status
        item.printConfirmed = status === 'COMPLETED'
      } else {
        item[`${task}Status`] = status
      }

      const { computeItemActiveStage } = require('../../../services/jobWorkflow')
      item.activeStage = computeItemActiveStage(item, job)

      job.markModified('items')
      await job.save()

      res.json({ message: `Item #${idx} ${task} set to ${status}`, activeStage: item.activeStage })
    } catch (err) {
      console.error('Admin override error:', err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * CUSTOMER MANAGEMENT
 */

// GET ALL CUSTOMERS
router.get('/customers', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const customers = await customerRepo.find({ isDeleted: false }).sort({ createdAt: -1 })
    res.json(customers)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// UPDATE CUSTOMER
router.patch('/customers/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { name, phone, isCreditCustomer } = req.body
    const updateData = {}
    if (name) updateData.name = name
    if (phone) updateData.phone = phone
    if (isCreditCustomer !== undefined) updateData.isCreditCustomer = isCreditCustomer

    const customer = await customerRepo.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
    invalidateCustomerCache(req.params.id)
    res.json(customer)
  } catch (err) {
    res.status(500).json({ message: 'Update failed' })
  }
})

// DELETE CUSTOMER
router.delete('/customers/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    await customerRepo.findByIdAndDelete(req.params.id)
    invalidateCustomerCache(req.params.id)
    res.json({ message: 'Customer deleted' })
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' })
  }
})

// Ã¢â€â‚¬Ã¢â€â‚¬ TIME LOG ENDPOINT - Get time metrics and logs for a job Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
router.get('/jobs/:jobId/time-log', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const job = await jobRepo.findOne({ jobId: req.params.jobId })
    if (!job) {
      return res.status(404).json({ message: 'Job not found' })
    }

    const { getTimeLogMetrics } = require('../../../services/jobWorkflow')
    const metrics = getTimeLogMetrics(job)

    res.json({
      jobId: job.jobId,
      customerName: job.customerName,
      createdAt: job.createdAt,
      jobStatus: job.jobStatus,
      metrics,
      summary: {
        pressTimeMin: Math.round(metrics.pressTime / 60000),
        postPressTimeMin: Math.round(metrics.postPressTime / 60000),
        finishingTimeMin: Math.round(metrics.finishingTime / 60000),
        totalTimeMin: Math.round(metrics.totalTime / 60000),
        pressToPostPressLagMin: metrics.pressToPostPressLagMs ? Math.round(metrics.pressToPostPressLagMs / 60000) : null,
        postPressToFinishingLagMin: metrics.postPressToFinishingLagMs ? Math.round(metrics.postPressToFinishingLagMs / 60000) : null,
      }
    })
  } catch (err) {
    console.error('[Admin Time Log Error]:', err)
    res.status(500).json({ message: err.message || 'Failed to get time log' })
  }
})

module.exports = router
module.exports.calculateCreasingDuration = calculateCreasingDuration
module.exports.DEFAULT_TIMINGS = DEFAULT_TIMINGS

// --- LAMINATION PRODUCTS STOCK MANAGEMENT ---

const { laminationProductRepo } = require('../../../repositories')
const prisma = require('../../../lib/prisma')

// GET lamination products (with total qty consumed from job specs)
router.get('/lamination-products', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const list = await laminationProductRepo.find({ deleted: false })

    // Aggregate total qty used from LaminationSpec for each roll
    const specs = await prisma.laminationSpec.findMany({
      where: {
        AND: [
          { laminationProduct: { not: null } },
          { laminationProduct: { not: '' } }
        ]
      },
      select: { laminationProduct: true, quantity: true }
    })
    const qtyMap = {}
    for (const s of specs) {
      if (!qtyMap[s.laminationProduct]) qtyMap[s.laminationProduct] = 0
      qtyMap[s.laminationProduct] += s.quantity || 0
    }

    const result = list.map(r => ({
      ...r,
      totalQtyUsed: qtyMap[r.productName] || 0
    }))

    res.json(result)
  } catch (err) {
    console.error('[Admin GET Lamination Products Error]:', err)
    res.status(500).json({ message: 'Failed to load lamination products' })
  }
})

// POST create lamination product
router.post('/lamination-products', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { laminationType, type, month, year, count } = req.body
    if (!laminationType || !type || !month || !year) {
      return res.status(400).json({ message: 'laminationType, type, month, and year are required' })
    }

    const typeStr = String(laminationType).toUpperCase().trim()
    let prefix = 'O'
    if (typeStr === 'GLOSS' || typeStr === 'GLOSSY') prefix = 'G'
    else if (typeStr === 'MATT' || typeStr === 'MATTE') prefix = 'M'
    else if (typeStr === 'VELVET') prefix = 'V'

    let resolvedCount = Number(count)
    if (isNaN(resolvedCount) || resolvedCount <= 0) {
      // Find the maximum count for this laminationType + type + month + year
      const existing = await prisma.laminationProduct.findMany({
        where: {
          laminationType: typeStr,
          type: String(type),
          month: String(month),
          year: String(year),
          deleted: false
        }
      })
      const maxCount = existing.reduce((max, r) => Math.max(max, r.count || 0), 0)
      resolvedCount = maxCount + 1
    }

    // Auto generate roll code (e.g. G1210626 where count is 1)
    const formattedMonth = String(month).padStart(2, '0')
    const formattedYear = String(year).slice(-2)
    const code = `${prefix}${type}${resolvedCount}${formattedMonth}${formattedYear}`

    const newProduct = await laminationProductRepo.create({
      productName: code,
      laminationType: typeStr,
      type: String(type),
      count: resolvedCount,
      month: String(month),
      year: String(year)
    })

    res.status(201).json(newProduct)
  } catch (err) {
    console.error('[Admin POST Lamination Product Error]:', err)
    res.status(500).json({ message: err.message || 'Failed to create lamination product' })
  }
})

// PATCH toggle lamination product availability
router.patch('/lamination-products/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const { isAvailable } = req.body
    if (isAvailable === undefined) {
      return res.status(400).json({ message: 'isAvailable is required' })
    }

    const updated = await laminationProductRepo.findByIdAndUpdate(req.params.id, {
      isAvailable: Boolean(isAvailable)
    }, { new: true })

    if (!updated) return res.status(404).json({ message: 'Roll not found' })
    res.json(updated)
  } catch (err) {
    console.error('[Admin PATCH Lamination Product Error]:', err)
    res.status(500).json({ message: 'Failed to update roll availability' })
  }
})

// DELETE (soft delete) lamination product
router.delete('/lamination-products/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const updated = await laminationProductRepo.findByIdAndUpdate(req.params.id, {
      deleted: true
    }, { new: true })

    if (!updated) return res.status(404).json({ message: 'Roll not found' })
    res.json({ message: 'Lamination product soft-deleted successfully' })
  } catch (err) {
    console.error('[Admin DELETE Lamination Product Error]:', err)
    res.status(500).json({ message: 'Failed to delete lamination product' })
  }
})

// GET roll usage report (detailed log items representing each lamination task event)
router.get('/reports/lamination-roll-usage', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const specs = await prisma.laminationSpec.findMany({
      where: {
        AND: [
          { laminationProduct: { not: null } },
          { laminationProduct: { not: '' } }
        ]
      },
      include: {
        jobItem: {
          include: {
            job: true
          }
        }
      }
    })

    // Fetch all active lamination roll stock records to map sizes/types
    const rolls = await laminationProductRepo.find({ deleted: false })
    const rollsMap = new Map(rolls.map(r => [r.productName, r]))

    const report = specs.map((spec, index) => {
      const roll = rollsMap.get(spec.laminationProduct)
      const jobItem = spec.jobItem
      const job = jobItem?.job

      return {
        id: spec.jobItemId,
        productName: spec.laminationProduct,
        laminationType: spec.variant || (roll ? roll.laminationType : 'UNKNOWN'),
        type: roll ? roll.type : '--',
        side: spec.side || 'SINGLE',
        jobId: job ? job.jobId : 'UNKNOWN',
        itemDescription: jobItem ? (jobItem.orderDescription || `Item #${jobItem.itemIndex}`) : '--',
        sheets: spec.quantity || 0,
        completedAt: job?.ppsCompletedAt || jobItem?.updatedAt || new Date()
      }
    })

    res.json(report)
  } catch (err) {
    console.error('[Admin GET Lamination Roll Usage Error]:', err)
    res.status(500).json({ message: 'Failed to retrieve lamination roll usage report' })
  }
})



