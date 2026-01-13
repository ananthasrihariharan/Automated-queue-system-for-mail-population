const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const Job = require('../models/Job')
const User = require('../models/User')
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
      const { date } = req.query

      let filter = {}

      if (date) {
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

      const jobs = await Job.find(
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
          defaultDeliveryType: 1
        }
      ).sort({ createdAt: -1 })
        .populate('createdBy', 'name')
        .populate('paymentHandledBy', 'name')
        .populate('dispatchedBy', 'name')
        .populate('customerId', 'isCreditCustomer')

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

/**
 * CUSTOMER MANAGEMENT
 */

// GET ALL CUSTOMERS
router.get('/customers', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const customers = await require('../models/Customer').find().sort({ createdAt: -1 })
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

    const customer = await require('../models/Customer').findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
    res.json(customer)
  } catch (err) {
    res.status(500).json({ message: 'Update failed' })
  }
})

// DELETE CUSTOMER
router.delete('/customers/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    await require('../models/Customer').findByIdAndDelete(req.params.id)
    res.json({ message: 'Customer deleted' })
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' })
  }
})

module.exports = router
