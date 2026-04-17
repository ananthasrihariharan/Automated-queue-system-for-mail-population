const express = require('express')
const router = express.Router()
const customerAuth = require('../middleware/customerAuth')
const QueueSession = require('../models/QueueSession')
const QueueJob = require('../models/QueueJob')
const User = require('../models/User')

/**
 * GET /staff-status
 * Shows all active prepress staff and their current activity level.
 * Role: CUSTOMER (Premium check for pinning capability)
 */
router.get('/staff-status', customerAuth, async (req, res) => {
  try {
    const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000)
    
    // Find active sessions with heartbeat check
    const sessions = await QueueSession.find({
      isActive: true,
      lastSeenAt: { $gte: threeMinsAgo }
    })
      .populate('staffId', 'name')
      .populate('currentQueueJob', 'status')
      .populate('currentWalkinJob', 'status')

    const staffStatus = sessions.map(session => ({
      staffId: session.staffId?._id,
      name: session.staffId?.name || 'Unknown Designer',
      isBusy: !!(session.currentQueueJob || session.currentWalkinJob),
      status: session.isActive ? 'Online' : 'Offline',
    }))

    res.json({
      canAssign: req.customer.isPremium,
      staff: staffStatus
    })
  } catch (err) {
    console.error('MOBILE STAFF STATUS ERROR:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

/**
 * GET /my-jobs
 * Mobile-optimized active jobs list for the dashboard.
 */
router.get('/my-jobs', customerAuth, async (req, res) => {
  try {
    // We match by customer name or phone since jobId/customerId link might be varied
    // Ideally we use customerId if it's consistently set.
    const jobs = await QueueJob.find({
      $or: [
        { customerPhone: req.customer.phone },
        { customerName: req.customer.name }
      ],
      status: { $ne: 'COMPLETED' }
    })
    .sort({ createdAt: -1 })
    .select('customerName emailSubject status createdAt priorityScore queuePosition')

    res.json(jobs)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
