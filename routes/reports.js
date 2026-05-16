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
 * GET ACTIVITY JOURNAL
 * Detailed job lifecycle logs for analytics.
 */
router.get('/activity-journal', auth, authorize('ADMIN'), async (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);

        // Fetch jobs active on this date
        const jobs = await QueueJob.find({
            $or: [
                { createdAt: { $gte: start, $lte: end } },
                { completedAt: { $gte: start, $lte: end } },
                { status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] } } // Include active jobs
            ]
        })
        .populate('assignedTo', 'name')
        .sort({ createdAt: -1 });

        const journal = jobs.map(job => {
            const audit = job.auditLog || [];
            
            // 1. Calculate Durations
            let queueDuration = 0;
            let holdDuration = 0;
            let workDuration = 0;

            const firstAssign = audit.find(l => l.action === 'ASSIGNED');
            const created = new Date(job.createdAt).getTime();
            const completed = job.completedAt ? new Date(job.completedAt).getTime() : null;
            const now = Date.now();

            // Queue Duration (Creation -> First Assignment)
            if (firstAssign) {
                queueDuration = new Date(firstAssign.timestamp).getTime() - created;
            } else {
                queueDuration = now - created; // Still waiting
            }

            // Hold Duration (Sum of Paused segments)
            let pauseStartedAt = null;
            audit.forEach(l => {
                if (l.action === 'PAUSED') {
                    pauseStartedAt = new Date(l.timestamp).getTime();
                } else if (l.action === 'RESUMED' && pauseStartedAt) {
                    holdDuration += (new Date(l.timestamp).getTime() - pauseStartedAt);
                    pauseStartedAt = null;
                }
            });
            if (pauseStartedAt && job.status === 'PAUSED') {
                holdDuration += (now - pauseStartedAt);
            }

            // Work Duration (Assignment -> Completion MINUS holds)
            if (firstAssign) {
                const endPoint = completed || now;
                workDuration = (endPoint - new Date(firstAssign.timestamp).getTime()) - holdDuration;
            }

            // 2. Extract Reassignment History
            const reassignments = audit
                .filter(l => 
                    ['REASSIGNED', 'REASSIGN_REQUESTED', 'PAUSED'].includes(l.action) ||
                    (l.action === 'ASSIGNED' && (l.details.manualPick || l.details.viaFindJob))
                )
                .map(l => {
                    let reason = l.details.notes || l.details.reason || 'No reason provided';
                    
                    // Audit Polish: If it's a PUSH reassignment, label it clearly
                    if (l.action === 'REASSIGNED' && l.details.forceMode === 'PUSH') {
                        reason = `[FORCED PUSH] ${reason}`;
                    }
                    if (l.action === 'PAUSED' && l.details.isInterruption) {
                        reason = `[INTERRUPTED] ${reason}`;
                    }
                    if (l.action === 'ASSIGNED' && (l.details.manualPick || l.details.viaFindJob)) {
                        reason = `[FIND JOB] Staff manually claimed this job from the pool.`;
                    }
                    if (l.action === 'REASSIGNED' && l.details.action === 'TAKEN_BY_OTHER_STAFF') {
                        reason = `[STAFF TAKEOVER] Claimed by ${l.details.toStaffName || 'another staff'} while it was held/pinned by ${l.details.fromStaffName || 'previous staff'}.`;
                    }

                    return {
                        type: l.action,
                        timestamp: l.timestamp,
                        from: l.details.fromStaffName || l.details.requestedByName || 'Pool',
                        to: l.details.toStaffName || l.details.staffName || 'System',
                        reason: reason,
                        forceMode: l.details.forceMode,
                        batchMode: l.details.batchMode
                    };
                });

            return {
                _id: job._id,
                customerEmail: job.customerEmail || 'Walk-in',
                customerName: job.customerName,
                subject: job.emailSubject,
                status: job.status,
                submittedAt: job.createdAt,
                assignedAt: job.assignedAt,
                completedAt: job.completedAt,
                metrics: {
                    queueDuration: Math.max(0, queueDuration),
                    holdDuration: Math.max(0, holdDuration),
                    workDuration: Math.max(0, workDuration)
                },
                reassignments,
                staffName: job.assignedTo?.name || 'Unassigned'
            };
        });

        res.json(journal);
    } catch (err) {
        console.error('ACTIVITY JOURNAL ERROR:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * GET QUEUE EVENT LOG (System Journal)
 * Used by the modal in the Admin Queue Control Center.
 */
router.get('/queue-event-log', auth, authorize('ADMIN'), async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 100;
        
        // Fetch most recent active/modified jobs to build a real-time journal
        const jobs = await QueueJob.find({ isSuperseded: { $ne: true } })
            .sort({ updatedAt: -1 })
            .populate('auditLog.actor', 'name')
            .limit(limit);

        let eventLogs = [];

        jobs.forEach(j => {
            if (j.auditLog && j.auditLog.length > 0) {
                j.auditLog.forEach(log => {
                    let staffName = '—';
                    if (log.actor && log.actor.name) {
                        staffName = log.actor.name;
                    } else if (log.details && log.details.staffName) {
                        staffName = log.details.staffName;
                    } else if (log.details && log.details.requestedByName) {
                         staffName = log.details.requestedByName;
                    }

                    eventLogs.push({
                        _id: j._id + '_' + new Date(log.timestamp).getTime() + '_' + Math.random().toString(36).substr(2, 5),
                        jobId: j._id,
                        customerName: j.customerName,
                        status: log.action, // e.g., QUEUED, ASSIGNED, COMPLETED
                        assignedTo: { name: staffName },
                        updatedAt: log.timestamp,
                        returnReason: log.details && Object.keys(log.details).length > 0 ? (log.details.notes || log.details.reason || JSON.stringify(log.details)) : ''
                    });
                });
            } else {
                // Fallback if no audit log
                eventLogs.push({
                    _id: j._id,
                    jobId: j._id,
                    customerName: j.customerName,
                    status: j.status,
                    assignedTo: j.assignedTo,
                    updatedAt: j.updatedAt,
                    returnReason: j.returnReason
                });
            }
        });

        // Sort globally by timestamp, newest first
        eventLogs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        // Slice to limit
        res.json(eventLogs.slice(0, limit));
    } catch (err) {
        console.error('QUEUE EVENT LOG ERROR:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
