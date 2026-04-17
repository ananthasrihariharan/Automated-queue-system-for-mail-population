const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const Job = require('../models/Job')
const QueueJob = require('../models/QueueJob')
const User = require('../models/User')

/**
 * GET STAFF PRODUCTIVITY
 * Role: ADMIN
 */
router.get('/staff-productivity', auth, authorize('ADMIN'), async (req, res) => {
    try {
        const { role = 'PREPRESS', timeframe, month, startDate: qStart, endDate: qEnd } = req.query;

        const now = new Date()
        let startDate = new Date()
        let endDate = new Date()

        // 1. Determine Date Range
        if (month) {
            // Format: YYYY-MM
            const [year, monthIdx] = month.split('-').map(Number);
            startDate = new Date(year, monthIdx - 1, 1);
            endDate = new Date(year, monthIdx, 0, 23, 59, 59, 999);
        } else if (qStart && qEnd) {
            startDate = new Date(qStart);
            endDate = new Date(qEnd);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return res.status(400).json({ message: 'Invalid date range' })
            }
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Preset Timeframes
            endDate = new Date();
            if (timeframe === 'today') {
                startDate.setHours(0, 0, 0, 0)
            } else if (timeframe === '7d') {
                startDate.setDate(startDate.getDate() - 7)
            } else if (timeframe === '30d') {
                startDate.setDate(startDate.getDate() - 30)
            } else {
                // Default to today
                startDate.setHours(0, 0, 0, 0)
            }
        }

        // Map roles to their primary "Productivity" field
        let matchField = 'createdBy'; // Prepress
        if (role === 'DISPATCH') matchField = 'dispatchedBy';
        if (role === 'CASHIER') matchField = 'paymentHandledBy';

        // 5. Aggregate with Facets: Staff Productivity + Job Summary
        const [result] = await User.aggregate([
            { $match: { roles: role, isActive: true } },
            {
                $facet: {
                    staff: [
                        {
                            $lookup: {
                                from: 'jobs',
                                let: { userId: '$_id' },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: { $eq: [`$${matchField}`, '$$userId'] },
                                            createdAt: { $gte: startDate, $lte: endDate }
                                        }
                                    },
                                    { $count: 'jobCount' }
                                ],
                                as: 'jobStats'
                            }
                        },
                        {
                            $lookup: {
                                from: 'queuesessions',
                                let: { userId: '$_id' },
                                pipeline: [
                                    { $match: { $expr: { $and: [{ $eq: ['$staffId', '$$userId'] }, { $eq: ['$isActive', true] }] } } }
                                ],
                                as: 'activeSession'
                            }
                        },
                        {
                            $project: {
                                name: 1,
                                lastLoginAt: 1,
                                isActive: { $gt: [{ $size: '$activeSession' }, 0] },
                                jobCount: { $ifNull: [{ $arrayElemAt: ['$jobStats.jobCount', 0] }, 0] }
                            }
                        },
                        { $sort: { jobCount: -1, name: 1 } }
                    ],
                    jobSummary: [
                        // We need a separate pipeline for the jobs in this range
                        // Facets usually run on the input (Users), so we use a $lookup/unwind trick 
                        // or just run a separate query. For clarity and since facets here are on Users, 
                        // let's run a separate query for Job Summary or a very specific facet.
                        // Actually, it's cleaner to run a separate aggregation for Jobs since they don't depend on Users.
                    ]
                }
            }
        ]);

        // Separate Aggregation for Job Summary (more efficient than facet on User input)
        const jobStatsRaw = await Job.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            {
                $group: {
                    _id: '$jobStatus',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const totalJobs = jobStatsRaw.reduce((acc, curr) => acc + curr.count, 0);
        const dispatched = jobStatsRaw.find(s => s._id === 'DISPATCHED')?.count || 0;

        const response = {
            staff: result.staff,
            jobSummary: {
                total: totalJobs,
                dispatched,
                undispatched: totalJobs - dispatched,
                statusBreakdown: jobStatsRaw.map(s => ({
                    status: s._id,
                    count: s.count
                }))
            }
        };

        res.json(response)
    } catch (err) {
        console.error('REPORT ERROR:', err);
        res.status(500).json({ message: 'Server error' })
    }
})

/**
 * GET QUEUE EVENT LOG
 * Role: ADMIN
 */
router.get('/queue-event-log', auth, authorize('ADMIN'), async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        
        // Fetch recent transitions: completions, assignments, pauses
        // We'll use QueueJob directly for now, sorting by updatedAt
        const logs = await QueueJob.find({
            status: { $in: ['COMPLETED', 'ASSIGNED', 'PAUSED', 'IN_PROGRESS'] }
        })
        .sort({ updatedAt: -1 })
        .limit(Number(limit))
        .populate('assignedTo', 'name')
        .select('customerName status updatedAt assignedTo returnReason priorityScore');

        res.json(logs);
    } catch (err) {
        console.error('EVENT LOG ERROR:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
