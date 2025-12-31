const express = require('express')
const router = express.Router()

const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const Job = require('../models/Job')

/**
 * GET JOBS FOR DISPATCH
 * Role: DISPATCH
 * Shows only required fields
 */
router.get(
    '/jobs',
    auth,
    authorize('DISPATCH'),
    async (req, res) => {
        try {
            const jobs = await Job.find(
                {
                    packingPreference: { $in: ['Single Parcel', 'Multiple Parcels'] }
                },
                {
                    _id: 0,
                    jobId: 1,
                    customerName: 1,
                    packingPreference: 1,
                    paymentStatus: 1
                }
            ).sort({ createdAt: -1 })

            res.json(jobs)
        } catch (err) {
            res.status(500).json({ message: 'Server error' })
        }
    }
)

/**
 * DISPATCH JOB (SINGLE PARCEL FLOW)
 */
router.post(
    '/jobs/:jobId/dispatch',
    auth,
    authorize('DISPATCH'),
    async (req, res) => {
        try {
            const { rackLocation } = req.body

            const job = await Job.findOne({ jobId: req.params.jobId })

            if (!job) {
                return res.status(404).json({ message: 'Job not found' })
            }

            if (
                job.paymentStatus !== 'PAID' &&
                job.paymentStatus !== 'ADMIN_APPROVED'
            ) {
                return res
                    .status(403)
                    .json({ message: 'Payment not completed' })
            }

            job.jobStatus = 'DISPATCHED'
            job.dispatchedAt = new Date()
            job.rackLocation = rackLocation

            await job.save()

            res.json({
                message: 'Job dispatched successfully',
                jobId: job.jobId
            })
        } catch (err) {
            res.status(500).json({ message: 'Server error' })
        }
    }
)

module.exports = router
