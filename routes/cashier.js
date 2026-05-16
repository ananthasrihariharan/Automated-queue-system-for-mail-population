const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const Job = require('../models/Job')
const activityTracker = require('../middleware/activityTracker')

router.use(activityTracker)

/**
 * GET JOBS FOR CASHIER (LAST 30 DAYS)
 * Role: CASHIER
 */
router.get(
  '/jobs',
  auth,
  authorize('CASHIER'),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, search = '', paymentStatus = 'ALL', hideDispatched = 'true', date = '' } = req.query
      const skip = (Number(page) - 1) * Number(limit)

      // Build the $and conditions array to be ultra-explicit
      const conditions = []

      // 1. Date Filter (Default to Today if missing or invalid)
      let targetDateStr = (date && date !== 'undefined' && date !== 'null') ? date : new Date().toISOString().split('T')[0]
      
      const startOfDay = new Date(targetDateStr)
      startOfDay.setUTCHours(0, 0, 0, 0)
      const endOfDay = new Date(targetDateStr)
      endOfDay.setUTCHours(23, 59, 59, 999)

      if (!isNaN(startOfDay.getTime())) {
        conditions.push({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
      } else {
        // Fallback to today if the date string was totally broken
        const todayStr = new Date().toISOString().split('T')[0]
        const s = new Date(todayStr); s.setUTCHours(0,0,0,0)
        const e = new Date(todayStr); e.setUTCHours(23,59,59,999)
        conditions.push({ createdAt: { $gte: s, $lte: e } })
        targetDateStr = todayStr
      }
      
      console.log(`[CASHIER] Query: page=${page}, limit=${limit}, date=${targetDateStr}`)

      // 2. Search Filter
      if (search && search.trim() !== '') {
        conditions.push({
          $or: [
            { jobId: { $regex: search, $options: 'i' } },
            { customerName: { $regex: search, $options: 'i' } }
          ]
        })
      }

      // 3. Payment Status Filter
      if (paymentStatus !== 'ALL') {
        conditions.push({ paymentStatus })
      }

      // 4. Active Only (Hide Dispatched) Filter
      if (hideDispatched === 'true') {
        conditions.push({ jobStatus: { $ne: 'DISPATCHED' } })
      }

      const filter = conditions.length > 0 ? { $and: conditions } : {}
      console.log(`[CASHIER] Final Filter: ${JSON.stringify(filter)}`)

      // Payment Status Filter
      if (paymentStatus !== 'ALL') {
        filter.paymentStatus = paymentStatus
      }

      // Active Only (Hide Dispatched) Filter
      if (hideDispatched === 'true') {
        filter.jobStatus = { $ne: 'DISPATCHED' }
      }

      const jobs = await Job.find(filter, {
        _id: 0,
        jobId: 1,
        customerName: 1,
        paymentStatus: 1,
        jobStatus: 1,
        createdAt: 1,
        customerId: 1
      }
      ).sort({ createdAt: -1 })
        .populate('customerId', 'isCreditCustomer')
        .skip(skip)
        .limit(Number(limit))

      const total = await Job.countDocuments(filter)

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
 * MARK PAYMENT AS PAID
 * Role: CASHIER
 */
router.patch(
  '/jobs/:jobId/payment',
  auth,
  authorize('CASHIER'),
  async (req, res) => {
    try {
      const { paymentMode } = req.body

      const job = await Job.findOne({ jobId: req.params.jobId })

      if (!job) {
        return res.status(404).json({ message: 'Job not found' })
      }

      if (job.paymentStatus === 'PAID') {
        return res.status(400).json({ message: 'Payment already marked as PAID' })
      }

      job.paymentStatus = 'PAID'
      job.paymentHandledBy = req.user._id
      // job.paymentMode = paymentMode || 'CASH'
      await job.save()

      res.json({
        message: 'Payment marked as PAID',
        job
      })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router
