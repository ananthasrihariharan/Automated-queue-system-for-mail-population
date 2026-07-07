const express = require('express')
const router = express.Router()

const auth = require('../../../middleware/auth')
const authorize = require('../../../middleware/authorize')

const { jobRepo } = require('../../../repositories')
const activityTracker = require('../../../middleware/activityTracker')

router.use(activityTracker)

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
            const { status, date, search } = req.query
            const page = parseInt(req.query.page) || 1
            const limit = parseInt(req.query.limit) || 50
            const skip = (page - 1) * limit

            const { jobs, total } = await jobRepo.listJobsForDispatch({
                status,
                date: date || null,
                search: search || null,
                skip,
                take: limit
            })

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
            const job = await jobRepo.findOne({ jobId: req.params.jobId })
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
            const job = await jobRepo.findOne({ jobId: req.params.jobId })
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

            // Update Activity
            req.user.lastLoginAt = new Date()
            await req.user.save()

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
            const { items, rack } = req.body
            
            // Support both new format (items array) and legacy format (single rack)
            if (!items && !rack) {
                return res.status(400).json({ message: 'Items or rack is required' })
            }

            const job = await jobRepo.findOne({ jobId: req.params.jobId })
            if (!job) return res.status(404).json({ message: 'Job not found' })

            const parcel = job.parcels.find(
                p => p.parcelNo === Number(req.params.parcelNo)
            )
            if (!parcel) {
                // Support automatic parcel creation if missing
                if (Number(req.params.parcelNo) === 1) {
                    if (job.parcels.length === 0) {
                        job.parcels.push({
                            parcelNo: 1,
                            itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1),
                            receiverType: 'SELF',
                            receiverName: job.customerName,
                            itemRacks: new Map()
                        })
                    }
                } else {
                    return res.status(404).json({ message: 'Parcel not found' })
                }
            }

            const activeParcel = job.parcels.find(p => p.parcelNo === Number(req.params.parcelNo))

            // Validate all requested items have completed post-press stages (admin bypass)
            const isAdminPack = Array.isArray(req.user.roles) && req.user.roles.includes('ADMIN')
            if (!isAdminPack && items && Array.isArray(items)) {
                for (const reqItem of items) {
                    const jobItem = (job.items || []).find(it => Number(it.itemIndex) === Number(reqItem.itemIndex))
                    if (jobItem && jobItem.activeStage !== 'done') {
                        return res.status(400).json({
                            message: `Item #${reqItem.itemIndex} is not ready for packing — still at ${jobItem.activeStage} stage`
                        })
                    }
                }
            }

            // Initialize itemRacks & itemStatuses if not exists
            if (!activeParcel.itemRacks) {
                activeParcel.itemRacks = new Map()
            }
            if (!activeParcel.itemStatuses) {
                activeParcel.itemStatuses = new Map()
            }
            
            // Handle new format: array of items with individual racks
            if (items && Array.isArray(items)) {
                items.forEach((item) => {
                    if (item.itemIndex !== undefined) {
                        if (item.rack) {
                            activeParcel.itemRacks.set(String(item.itemIndex), item.rack)
                        }
                        // Mark item status as PACKED
                        activeParcel.itemStatuses.set(String(item.itemIndex), {
                            status: 'PACKED'
                        })
                    }
                })
                
                // Set parcel rack to the first item's rack for compatibility
                const firstItem = items[0]
                if (firstItem?.rack) {
                    activeParcel.rack = firstItem.rack
                    activeParcel.rackLocation = firstItem.rack
                }
            } else if (rack) {
                // Legacy format: single rack for entire parcel
                activeParcel.rack = rack
                activeParcel.rackLocation = rack
                
                // Initialize all items with same rack and PACKED status
                if (!activeParcel.itemRacks) {
                    activeParcel.itemRacks = new Map()
                }
                activeParcel.itemIndexes.forEach(idx => {
                    activeParcel.itemRacks.set(String(idx), rack)
                    activeParcel.itemStatuses.set(String(idx), {
                        status: 'PACKED'
                    })
                })
            }
            
            // Only mark parcel as PACKED when ALL items in the parcel have been packed (or dispatched)
            const allItemsPacked = activeParcel.itemIndexes && activeParcel.itemIndexes.length > 0 &&
                activeParcel.itemIndexes.every(idx => {
                    const entry = activeParcel.itemStatuses ? activeParcel.itemStatuses.get(String(idx)) : null
                    const status = entry ? (entry.status || entry.get?.('status')) : null
                    return status === 'PACKED' || status === 'DISPATCHED'
                })

            if (allItemsPacked) {
                activeParcel.packedAt = new Date()
                activeParcel.status = 'PACKED'
                job.packedBy = req.user._id
                job.packedById = Number(req.user._id)
            }

            // Sync top-level rackLocation if it's the first or only parcel
            if ((activeParcel.parcelNo === 1 || job.parcels.length === 1) && activeParcel.status === 'PACKED') {
                job.rackLocation = activeParcel.rack
            }

            job.markModified('parcels')
            await job.save()

            // Check if all parcels are now PACKED (or DISPATCHED)
            const allPacked = job.parcels.length > 0 && job.parcels.every(p => p.status === 'PACKED' || p.status === 'DISPATCHED')
            if (allPacked && job.jobStatus !== 'DISPATCHED') {
                job.jobStatus = 'PACKED'
                await job.save()
            }

            res.json({ message: 'Parcel packed and racks saved', parcel: activeParcel, jobStatus: job.jobStatus })
        } catch (err) {
            console.error('Pack error:', err)
            res.status(500).json({ message: 'Server error' })
        }
    }
)

/**
 * UPDATE ITEM RACKS (Without triggering Pack status)
 */
router.patch(
    '/jobs/:jobId/parcels/:parcelNo/rack',
    auth,
    authorize('DISPATCH', 'ADMIN'),
    async (req, res) => {
        try {
            const { items, rack } = req.body
            
            if (!items && !rack) {
                return res.status(400).json({ message: 'Items or rack is required' })
            }

            const job = await jobRepo.findOne({ jobId: req.params.jobId })
            if (!job) return res.status(404).json({ message: 'Job not found' })

            const parcel = job.parcels.find(
                p => p.parcelNo === Number(req.params.parcelNo)
            )
            if (!parcel) {
                // Support automatic parcel creation if missing
                if (Number(req.params.parcelNo) === 1) {
                    if (job.parcels.length === 0) {
                        job.parcels.push({
                            parcelNo: 1,
                            itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1),
                            receiverType: 'SELF',
                            receiverName: job.customerName,
                            itemRacks: new Map()
                        })
                    }
                } else {
                    return res.status(404).json({ message: 'Parcel not found' })
                }
            }

            const activeParcel = job.parcels.find(p => p.parcelNo === Number(req.params.parcelNo))

            // Initialize itemRacks if not exists
            if (!activeParcel.itemRacks) {
                activeParcel.itemRacks = new Map()
            }
            
            // Handle new format: array of items with individual racks
            if (items && Array.isArray(items)) {
                items.forEach((item) => {
                    if (item.itemIndex !== undefined && item.rack !== undefined) {
                        activeParcel.itemRacks.set(String(item.itemIndex), item.rack)
                    }
                })
                
                // Set parcel rack to the first item's rack for compatibility
                const firstItem = items[0]
                if (firstItem?.rack) {
                    activeParcel.rack = firstItem.rack
                    activeParcel.rackLocation = firstItem.rack
                }
            } else if (rack) {
                // Legacy format: single rack for entire parcel
                activeParcel.rack = rack
                activeParcel.rackLocation = rack
                
                activeParcel.itemIndexes.forEach(idx => {
                    activeParcel.itemRacks.set(String(idx), rack)
                })
            }

            // Sync top-level rackLocation if it's the first or only parcel
            if (activeParcel.parcelNo === 1 || job.parcels.length === 1) {
                job.rackLocation = activeParcel.rack
            }

            job.markModified('parcels')
            await job.save()

            res.json({ message: 'Racks updated successfully', parcel: activeParcel })
        } catch (err) {
            console.error('Rack update error:', err)
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

            const job = await jobRepo.findOne({ jobId })
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

            const job = await jobRepo.findOne({ jobId }).populate('customerId')
            if (!job) return res.status(404).json({ message: 'Job not found' })

            // Payment check - admin can bypass, non-admin must have payment cleared
            const isAdmin = Array.isArray(req.user.roles) && req.user.roles.includes('ADMIN')
            const isCredit = job.customerId && job.customerId.isCreditCustomer
            if (!isAdmin && job.paymentStatus !== 'PAID' && job.paymentStatus !== 'ADMIN_APPROVED' && !isCredit) {
                return res.status(403).json({
                    message: 'Payment pending. Mark job as paid or use Admin Approve before dispatching.'
                })
            }

            const parcel = job.parcels.find(p => p.parcelNo === Number(parcelNo))

            if (!parcel) {
                // Support automatic creation for ANY packingPreference if missing
                if (Number(parcelNo) === 1 && job.parcels.length === 0) {
                    const isWalkIn = job.defaultDeliveryType === 'WALK_IN'
                    // Walk-in parcels don't require packing — skip pack check
                    if (!isWalkIn) {
                        return res.status(400).json({ message: 'Parcel must be packed before dispatching.' })
                    }
                    job.parcels.push({
                        parcelNo: 1,
                        itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1),
                        receiverType: 'SELF',
                        receiverName: job.customerName,
                        deliveryType: 'WALK_IN',
                        status: 'DISPATCHED',
                        dispatchedAt: new Date(),
                        dispatchedBy: req.user && req.user.roles && req.user.roles.includes('ADMIN') ? 'ADMIN' : 'DISPATCH'
                    })
                } else {
                    return res.status(404).json({ message: 'Parcel not found' })
                }
            } else {
                // Parcel exists - enforce pack requirement for non-walk-in
                if (parcel.deliveryType !== 'WALK_IN' && parcel.status !== 'PACKED' && parcel.status !== 'DISPATCHED') {
                    return res.status(400).json({ message: 'Parcel must be packed before dispatching.' })
                }
            }

            // Re-fetch parcel after potential creation
            const activeParcel = job.parcels.find(p => p.parcelNo === Number(parcelNo))

            // For walk-in parcels, validate activeStage since no prior pack step enforces it (admin bypass)
            if (activeParcel.deliveryType === 'WALK_IN' && !isAdmin) {
                const notReadyIdx = (activeParcel.itemIndexes || []).find(idx => {
                    const jobItem = (job.items || []).find(it => Number(it.itemIndex) === idx)
                    return jobItem && jobItem.activeStage !== 'done'
                })
                if (notReadyIdx !== undefined) {
                    const jobItem = (job.items || []).find(it => Number(it.itemIndex) === notReadyIdx)
                    return res.status(400).json({
                        message: `Item #${notReadyIdx} is not ready for dispatch — still at ${jobItem?.activeStage || 'unknown'} stage`
                    })
                }
            }

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
                job.dispatchedById = Number(req.user._id)
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
    authorize('DISPATCH', 'ADMIN'),
    async (req, res) => {
        try {
            const { rackLocation } = req.body

            const job = await jobRepo.findOne({ jobId: req.params.jobId }).populate('customerId')

            if (!job) {
                return res.status(404).json({ message: 'Job not found' })
            }

            const isAdmin = Array.isArray(req.user.roles) && req.user.roles.includes('ADMIN')
            const isCredit = job.customerId && job.customerId.isCreditCustomer
            if (
                !isAdmin &&
                job.paymentStatus !== 'PAID' &&
                job.paymentStatus !== 'ADMIN_APPROVED' &&
                !isCredit
            ) {
                return res
                    .status(403)
                    .json({ message: 'Payment not completed' })
            }

            // Enforce pack requirement for courier jobs
            if (job.defaultDeliveryType !== 'WALK_IN') {
                const hasPackedParcel = job.parcels.some(p => p.status === 'PACKED' || p.status === 'DISPATCHED')
                if (!hasPackedParcel && job.parcels.length > 0) {
                    return res.status(400).json({ message: 'Parcel must be packed before dispatching.' })
                }
            }

            job.jobStatus = 'DISPATCHED'
            job.dispatchedAt = new Date()
            job.dispatchedBy = req.user._id
            job.dispatchedById = Number(req.user._id)
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

/**
 * DISPATCH INDIVIDUAL ITEM
 * Dispatches a single item within a parcel without affecting other items.
 * Job moves to PARTIAL_DISPATCH until all items are dispatched.
 */
router.patch(
    '/jobs/:jobId/items/:itemIndex/dispatch',
    auth,
    authorize('DISPATCH', 'ADMIN'),
    async (req, res) => {
        try {
            const { adminApproval = false } = req.body
            const { jobId, itemIndex } = req.params
            const itemIdx = Number(itemIndex)

            const job = await jobRepo.findOne({ jobId }).populate('customerId')
            if (!job) return res.status(404).json({ message: 'Job not found' })

            // Payment check - admin can bypass, non-admin must have payment cleared
            const isAdmin = Array.isArray(req.user.roles) && req.user.roles.includes('ADMIN')
            const isCredit = job.customerId && job.customerId.isCreditCustomer
            if (!isAdmin && job.paymentStatus !== 'PAID' && job.paymentStatus !== 'ADMIN_APPROVED' && !isCredit) {
                return res.status(403).json({ message: 'Payment pending. Mark job as paid or use Admin Approve before dispatching.' })
            }

            // Find which parcel contains this item
            let targetParcel = job.parcels.find(p => p.itemIndexes.includes(itemIdx))

            // Auto-create parcel for SINGLE packing if missing
            if (!targetParcel && job.packingPreference === 'SINGLE') {
                if (job.parcels.length === 0) {
                    const isWalkIn = job.defaultDeliveryType === 'WALK_IN'
                    job.parcels.push({
                        parcelNo: 1,
                        itemIndexes: Array.from({ length: job.totalItems }, (_, i) => i + 1),
                        receiverType: 'SELF',
                        receiverName: job.customerName,
                        deliveryType: isWalkIn ? 'WALK_IN' : 'COURIER',
                        status: 'PENDING',
                        itemStatuses: new Map()
                    })
                    targetParcel = job.parcels[0]
                }
            }

            if (!targetParcel) {
                return res.status(404).json({ message: `Item ${itemIdx} not found in any parcel` })
            }

            // Enforce pack requirement for non-walk-in parcels
            if (targetParcel.deliveryType !== 'WALK_IN' && targetParcel.status !== 'PACKED' && targetParcel.status !== 'DISPATCHED') {
                return res.status(400).json({ message: 'Item must be packed before dispatching. Please pack the parcel first.' })
            }

            // Initialize itemStatuses map if needed
            if (!targetParcel.itemStatuses) targetParcel.itemStatuses = new Map()

            // Mark this specific item as dispatched
            const itemDispatchedAt = new Date()
            targetParcel.itemStatuses.set(String(itemIdx), {
                status: 'DISPATCHED',
                dispatchedAt: itemDispatchedAt
            })

            // Stamp parcel.dispatchedAt on the FIRST item dispatch so the history
            // date filter can find partially-dispatched jobs by date.
            if (!targetParcel.dispatchedAt) {
                targetParcel.dispatchedAt = itemDispatchedAt
            }

            // Check if ALL items in this parcel are now dispatched
            const allParcelItemsDispatched = targetParcel.itemIndexes.every(idx => {
                const entry = targetParcel.itemStatuses.get(String(idx))
                return entry && entry.status === 'DISPATCHED'
            })

            if (allParcelItemsDispatched) {
                targetParcel.status = 'DISPATCHED'
                targetParcel.dispatchedAt = new Date()
                targetParcel.dispatchedBy = req.user.roles.includes('ADMIN') ? 'ADMIN' : 'DISPATCH'
            }

            job.markModified('parcels')

            // Check if ALL parcels are dispatched -> full job dispatch
            const allParcelsDispatched = job.parcels.every(p => p.status === 'DISPATCHED')
            if (allParcelsDispatched) {
                job.jobStatus = 'DISPATCHED'
                job.dispatchedAt = new Date()
                job.dispatchedBy = req.user._id
                job.dispatchedById = Number(req.user._id)
            } else {
                // Partial dispatch - job stays visible in active but also in history
                job.jobStatus = 'PARTIAL_DISPATCH'
            }

            await job.save()

            res.json({
                message: `Item ${itemIdx} dispatched successfully`,
                itemIndex: itemIdx,
                parcelNo: targetParcel.parcelNo,
                jobStatus: job.jobStatus,
                allParcelItemsDispatched
            })
        } catch (err) {
            console.error('Item dispatch error:', err)
            res.status(500).json({ message: 'Server error' })
        }
    }
)

module.exports = router


