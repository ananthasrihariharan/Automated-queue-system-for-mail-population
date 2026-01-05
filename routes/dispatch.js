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
            const { status } = req.query

            // Build filter based on status query
            const filter = {
                packingPreference: { $in: ['SINGLE', 'MULTIPLE'] }
            }

            // Filter by job status if specified
            if (status === 'active') {
                filter.jobStatus = { $ne: 'DISPATCHED' }
            } else if (status === 'history') {
                filter.jobStatus = 'DISPATCHED'
            }

            const jobs = await Job.find(
                filter,
                {
                    _id: 1,
                    jobId: 1,
                    customerName: 1,
                    packingPreference: 1,
                    paymentStatus: 1,
                    totalItems: 1,
                    parcels: 1,
                    approvalRequested: 1,
                    jobStatus: 1,
                    dispatchedAt: 1,
                    rackLocation: 1,
                    itemScreenshots: 1
                }
            ).sort({ createdAt: -1 })

            res.json(jobs)
        } catch (err) {
            res.status(500).json({ message: 'Server error' })
        }
    }
)

/**
 * REQUEST ADMIN APPROVAL
 */
router.patch(
    '/jobs/:jobId/request-approval',
    auth,
    authorize('DISPATCH'),
    async (req, res) => {
        try {
            const job = await Job.findOne({ jobId: req.params.jobId })
            if (!job) return res.status(404).json({ message: 'Job not found' })

            if (job.paymentStatus === 'PAID') {
                return res.status(400).json({ message: 'Payment already completed' })
            }

            job.approvalRequested = true
            await job.save()

            res.json({ message: 'Approval requested from admin' })
        } catch (err) {
            res.status(500).json({ message: 'Server error' })
        }
    }
)

/**
 * PACK PARCEL & ASSIGN RACK
 */
router.patch(
    '/jobs/:jobId/parcels/:parcelNo/pack',
    auth,
    authorize('DISPATCH', 'ADMIN'),
    async (req, res) => {
        try {
            const { rack } = req.body
            if (!rack) {
                return res.status(400).json({ message: 'Rack is required' })
            }

            const job = await Job.findOne({ jobId: req.params.jobId })
            if (!job) return res.status(404).json({ message: 'Job not found' })

            const parcel = job.parcels.find(
                p => p.parcelNo === Number(req.params.parcelNo)
            )
            if (!parcel) {
                // Support automatic parcel creation for SINGLE if missing
                if (job.packingPreference === 'SINGLE' && Number(req.params.parcelNo) === 1) {
                    if (job.parcels.length === 0) {
                        job.parcels.push({
                            parcelNo: 1,
                            itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1),
                            receiverType: 'SELF',
                            receiverName: job.customerName
                        })
                    }
                } else {
                    return res.status(404).json({ message: 'Parcel not found' })
                }
            }

            const activeParcel = job.parcels.find(p => p.parcelNo === Number(req.params.parcelNo))
            activeParcel.rack = rack
            activeParcel.rackLocation = rack
            activeParcel.packedAt = new Date()
            activeParcel.status = 'PACKED'

            // Sync top-level rackLocation if it's the first or only parcel
            if (activeParcel.parcelNo === 1 || job.parcels.length === 1) {
                job.rackLocation = rack
            }

            await job.save()
            res.json({ message: 'Parcel packed and rack saved', parcel: activeParcel, jobStatus: job.jobStatus })
        } catch (err) {
            console.error('PACK ERROR:', err)
            res.status(500).json({ message: 'Server error' })
        }
    }
)

/**
 * SCAN PARCEL (Retrieve details for verification)
 */
router.post(
    '/scan',
    auth,
    authorize('DISPATCH', 'ADMIN'),
    async (req, res) => {
        try {
            const { jobId, parcelNo } = req.body

            const job = await Job.findOne({ jobId })
            if (!job) return res.status(404).json({ message: 'Job not found' })

            const parcel = job.parcels.find(p => p.parcelNo === Number(parcelNo))
            if (!parcel) return res.status(404).json({ message: 'Parcel not found' })

            res.json({
                jobId,
                parcelNo,
                rack: parcel.rack,
                receiverName: parcel.receiverName,
                receiverPhone: parcel.receiverPhone,
                paymentStatus: job.paymentStatus,
                status: parcel.status,
                customerName: job.customerName
            })
        } catch (err) {
            res.status(500).json({ message: 'Server error' })
        }
    }
)

/**
 * DISPATCH INDIVIDUAL PARCEL
 */
router.patch(
    '/jobs/:jobId/parcels/:parcelNo/dispatch',
    auth,
    authorize('DISPATCH', 'ADMIN'),
    async (req, res) => {
        try {
            const { adminApproval = false } = req.body
            const { jobId, parcelNo } = req.params

            const job = await Job.findOne({ jobId })
            if (!job) return res.status(404).json({ message: 'Job not found' })

            if (job.paymentStatus !== 'PAID' && !adminApproval && job.paymentStatus !== 'ADMIN_APPROVED') {
                return res.status(403).json({
                    message: 'Payment pending. Admin approval required.'
                })
            }

            const parcel = job.parcels.find(
                p => p.parcelNo === Number(parcelNo)
            )

            if (!parcel) {
                // Support automatic creation for SINGLE if missing
                if (job.packingPreference === 'SINGLE' && Number(parcelNo) === 1) {
                    if (job.parcels.length === 0) {
                        job.parcels.push({
                            parcelNo: 1,
                            itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1),
                            receiverType: 'SELF',
                            receiverName: job.customerName
                        })
                    }
                } else {
                    return res.status(404).json({ message: 'Parcel not found' })
                }
            }

            const activeParcel = job.parcels.find(p => p.parcelNo === Number(parcelNo))
            activeParcel.status = 'DISPATCHED'
            activeParcel.dispatchedAt = new Date()

            // Sync top-level fields for visibility
            if (activeParcel.parcelNo === 1 || job.parcels.length === 1) {
                job.dispatchedAt = activeParcel.dispatchedAt
            }

            // req.user comes from auth middleware, check roles
            activeParcel.dispatchedBy = req.user && req.user.roles && req.user.roles.includes('ADMIN')
                ? 'ADMIN'
                : 'DISPATCH'

            // Check if all parcels are dispatched
            const allDispatched = job.parcels.every(p => p.status === 'DISPATCHED')
            if (allDispatched) {
                job.jobStatus = 'DISPATCHED'
                job.dispatchedAt = new Date()
            }

            await job.save()
            res.json({ message: 'Parcel dispatched', parcelNo, jobStatus: job.jobStatus })
        } catch (err) {
            console.error('DISPATCH ERROR:', err)
            res.status(500).json({ message: 'Server error' })
        }
    }
)

/**
 * DISPATCH JOB (LEGACY SINGLE PARCEL FLOW)
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

            // Also mark first parcel as dispatched if SINGLE
            if (job.packingPreference === 'SINGLE' && job.parcels.length > 0) {
                job.parcels[0].status = 'DISPATCHED'
                job.parcels[0].dispatchedAt = new Date()
                job.parcels[0].rackLocation = rackLocation
            }

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
