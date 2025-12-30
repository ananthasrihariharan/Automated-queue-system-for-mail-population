const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const Job = require('../models/Job')
const Parcel = require('../models/Parcel')

/**
 * GET CUSTOMER JOBS (LAST 30 DAYS)
 * Role: CUSTOMER
 */
router.get(
  '/jobs',
  auth,
  authorize('CUSTOMER'),
  async (req, res) => {
    try {
      const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const jobs = await Job.find({
        customerId: req.user._id,
        createdAt: { $gte: last30Days }
      }).sort({ createdAt: -1 })

      res.json(jobs)
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * SET PACKING PREFERENCE
 * Role: CUSTOMER
 */
router.patch(
  '/jobs/:jobId/packing-preference',
  auth,
  authorize('CUSTOMER'),
  async (req, res) => {
    try {
      const { packingPreference } = req.body

      if (!['YES', 'NO'].includes(packingPreference)) {
        return res.status(400).json({ message: 'Invalid packing preference' })
      }

      const job = await Job.findOne({
        jobId: req.params.jobId,
        customerId: req.user._id
      })

      if (!job) {
        return res.status(404).json({ message: 'Job not found' })
      }

      job.packingPreference = packingPreference
      await job.save()

      res.json({ message: 'Packing preference updated', job })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

/**
 * CREATE PARCEL (CUSTOMER PACKING)
 * Role: CUSTOMER
 */
router.post(
  '/jobs/:jobId/parcels',
  auth,
  authorize('CUSTOMER'),
  async (req, res) => {
    try {
      const {
        parcelId,
        itemCount,
        receiverType,
        receiverName,
        receiverPhone
      } = req.body

      if (!parcelId || !itemCount || !receiverType) {
        return res.status(400).json({ message: 'Missing required fields' })
      }

      const job = await Job.findOne({
        jobId: req.params.jobId,
        customerId: req.user._id
      })

      if (!job) {
        return res.status(404).json({ message: 'Job not found' })
      }

      if (job.packingPreference !== 'YES') {
        return res.status(400).json({
          message: 'Packing preference not enabled for this job'
        })
      }

      const parcel = await Parcel.create({
        parcelId,
        jobId: job.jobId,
        itemCount,
        receiverType,
        receiverName:
          receiverType === 'SELF' ? req.user.name : receiverName,
        receiverPhone:
          receiverType === 'SELF' ? req.user.phone : receiverPhone,
        qrPayload: {
          jobId: job.jobId,
          parcelId,
          itemCount,
          receiver:
            receiverType === 'SELF' ? req.user.name : receiverName
        }
      })

      res.status(201).json({
        message: 'Parcel created successfully',
        parcel
      })
    } catch (err) {
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router
