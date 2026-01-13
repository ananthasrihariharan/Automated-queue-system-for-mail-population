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
            const { status, date } = req.query
            const page = parseInt(req.query.page) || 1
            const limit = parseInt(req.query.limit) || 50
            const skip = (page - 1) * limit

            // Build filter based on status query
            const filter = {
                packingPreference: { $in: ['SINGLE', 'MULTIPLE', 'MIXED'] }
            }

            // Filter by job status if specified
            if (status === 'active') {
                // Strict Active: Only non-dispatched jobs
                filter.jobStatus = { $ne: 'DISPATCHED' }
            } else if (status === 'history') {
                filter.jobStatus = 'DISPATCHED'
            }

            // Date Filtering (Overrides Fresh Daily default)
            if (date) {
                const queryDate = new Date(date)
                const nextDay = new Date(queryDate)
                nextDay.setDate(nextDay.getDate() + 1)

                // If date is present, we strictly filter by that date.
                // For 'active' tab + date, usually means "Find jobs created on this date"
                // For 'history' tab + date, usually means "Find jobs dispatched on this date"

                if (status === 'history') {
                    filter.dispatchedAt = {
                        $gte: queryDate,
                        $lt: nextDay
                    }
                } else {
                    // Reset the $or logic from Fresh Daily if it exists
                    // We want strict creation date
                    delete filter.$or
                    delete filter.jobStatus // Remove default status check if we want pure history?
                    // actually, Active tab + Date probably means "Show me what was created that day"

                    // But if we want to mimic Admin's strict override:
                    filter.createdAt = {
                        $gte: queryDate,
                        $lt: nextDay
                    }

                    // Do we keep the status check?
                    // If I select a date in Active tab, do I want to see Dispatched jobs?
                    // Probably not, they would be in History tab.
                    // So we probably keep basic status checks but remove the specialized $or.

                    if (filter.$or) delete filter.$or; // Remove Fresh Daily complex logic
                    filter.jobStatus = { $ne: 'DISPATCHED' } // Restore basic active check? 
                    // Wait, if I want to see "Active jobs from 3 days ago", this is correct.
                    // But if I want to see "What I did 3 days ago", I'd go to History.
                }
            }

            const total = await Job.countDocuments(filter)

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
                    itemScreenshots: 1,
                    packingMode: 1,
                    packingOverride: 1,
                    createdAt: 1,
                    defaultDeliveryType: 1,
                    customerId: 1 // Include customerId for population
                }
            ).sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('createdBy', 'name')
                .populate('customerId', 'name isCreditCustomer') // Populate credit status

            res.json({
                jobs,
                total,
                page,
                pages: Math.ceil(total / limit)
            })
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
 * REORGANIZE PARCELS (Logical Split by Staff)
 */
router.patch(
    '/jobs/:jobId/reorganize',
    auth,
    authorize('DISPATCH', 'ADMIN'),
    async (req, res) => {
        try {
            const { parcels, packingMode, overrideReason } = req.body
            const job = await Job.findOne({ jobId: req.params.jobId })
            if (!job) return res.status(404).json({ message: 'Job not found' })

            // Validate all items are covered
            const allItems = [...new Set(parcels.flatMap(p => p.itemIndexes))]
            if (allItems.length !== job.totalItems) {
                return res.status(400).json({ message: 'All items must be assigned to parcels' })
            }

            // Check for override
            if (packingMode !== job.packingPreference) {
                job.packingOverride = {
                    overridden: true,
                    reason: overrideReason,
                    overriddenBy: req.user._id,
                    overriddenAt: new Date()
                }
            }

            job.parcels = parcels
            job.packingMode = packingMode

            // Re-evaluate job status based on new parcels
            const allPacked = job.parcels.length > 0 && job.parcels.every(p => p.status === 'PACKED' || p.status === 'DISPATCHED')
            const allDispatched = job.parcels.length > 0 && job.parcels.every(p => p.status === 'DISPATCHED')

            if (allDispatched) {
                job.jobStatus = 'DISPATCHED'
            } else if (allPacked) {
                job.jobStatus = 'PACKED'
            } else {
                job.jobStatus = 'PENDING'
            }

            await job.save()
            res.json({ message: 'Parcels reorganized successfully', job })
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

            // Check if all parcels are now PACKED (or DISPATCHED)
            const allPacked = job.parcels.length > 0 && job.parcels.every(p => p.status === 'PACKED' || p.status === 'DISPATCHED')
            if (allPacked && job.jobStatus !== 'DISPATCHED') {
                job.jobStatus = 'PACKED'
                await job.save()
            }

            res.json({ message: 'Parcel packed and rack saved', parcel: activeParcel, jobStatus: job.jobStatus })
        } catch (err) {
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
 * DISPATCH INDIVIDUAL PARCEL (OR HAND OVER)
 */
router.patch(
    '/jobs/:jobId/parcels/:parcelNo/dispatch',
    auth,
    authorize('DISPATCH', 'ADMIN'),
    async (req, res) => {
        try {
            const { adminApproval = false } = req.body
            const { jobId, parcelNo } = req.params

            const job = await Job.findOne({ jobId }).populate('customerId')
            if (!job) return res.status(404).json({ message: 'Job not found' })

            // Allow if PAID, Admin Approved, OR Credit Customer
            const isCredit = job.customerId && job.customerId.isCreditCustomer
            if (job.paymentStatus !== 'PAID' && !adminApproval && job.paymentStatus !== 'ADMIN_APPROVED' && !isCredit) {
                return res.status(403).json({
                    message: 'Payment pending. Admin approval required.'
                })
            }

            const parcel = job.parcels.find(
                p => p.parcelNo === Number(parcelNo)
            )

            if (!parcel) {
                // Support automatic creation for SINGLE if missing
                // Check if job preference or defaultDeliveryType implies WALK_IN
                if (job.packingPreference === 'SINGLE' && Number(parcelNo) === 1) {
                    if (job.parcels.length === 0) {
                        const isWalkIn = job.defaultDeliveryType === 'WALK_IN'
                        job.parcels.push({
                            parcelNo: 1,
                            itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1),
                            receiverType: 'SELF',
                            receiverName: job.customerName,
                            deliveryType: isWalkIn ? 'WALK_IN' : 'COURIER',
                            status: 'DISPATCHED', // Set immediately to DISPATCHED
                            dispatchedAt: new Date(),
                            dispatchedBy: req.user && req.user.roles && req.user.roles.includes('ADMIN') ? 'ADMIN' : 'DISPATCH'
                        })
                    }
                } else {
                    return res.status(404).json({ message: 'Parcel not found' })
                }
            }

            // Re-fetch parcel after potential creation
            const activeParcel = job.parcels.find(p => p.parcelNo === Number(parcelNo))

            // Should already be dispatched if we just created it, but ensure it valid for existing ones
            if (activeParcel.status !== 'DISPATCHED') {
                activeParcel.status = 'DISPATCHED'
                activeParcel.dispatchedAt = new Date()
                activeParcel.dispatchedBy = req.user && req.user.roles && req.user.roles.includes('ADMIN')
                    ? 'ADMIN'
                    : 'DISPATCH'
            }

            // Sync top-level fields for visibility
            if (activeParcel.parcelNo === 1 || job.parcels.length === 1) {
                job.dispatchedAt = activeParcel.dispatchedAt
            }

            job.markModified('parcels')

            // Check if all parcels are dispatched
            const allDispatched = job.parcels.every(p => p.status === 'DISPATCHED')
            if (allDispatched) {
                job.jobStatus = 'DISPATCHED'
                job.dispatchedAt = new Date()
                job.dispatchedBy = req.user._id
            }

            await job.save()
            res.json({ message: 'Parcel dispatched (Handover/Courier)', parcelNo, jobStatus: job.jobStatus })
        } catch (err) {
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

            const job = await Job.findOne({ jobId: req.params.jobId }).populate('customerId')

            if (!job) {
                return res.status(404).json({ message: 'Job not found' })
            }

            const isCredit = job.customerId && job.customerId.isCreditCustomer
            if (
                job.paymentStatus !== 'PAID' &&
                job.paymentStatus !== 'ADMIN_APPROVED' &&
                !isCredit
            ) {
                return res
                    .status(403)
                    .json({ message: 'Payment not completed' })
            }

            job.jobStatus = 'DISPATCHED'
            job.dispatchedAt = new Date()
            job.dispatchedBy = req.user._id
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
