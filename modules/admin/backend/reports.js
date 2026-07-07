const express = require('express')
const router = express.Router()
const auth = require('../../../middleware/auth')
const authorize = require('../../../middleware/authorize')
const prisma = require('../../../lib/prisma')
const { adaptJobToLegacyShape } = require('../../../lib/responseAdapters')

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

        {
            const targetRoles = [role];
            if (role === 'FINISHING') {
                targetRoles.push('FINISHING_CUTTING', 'FINISHING_DIE_CUTTING', 'FINISHING_CREASING', 'FINISHING_CORNER_CUT');
            }
            const searchRoles = [...targetRoles, 'ADMIN'];

            const dbUsers = await prisma.user.findMany({
                where: { isActive: true, isDeleted: false }
            });

            const filteredUsers = dbUsers.filter(u => {
                const rawRoles = Array.isArray(u.rawRoles) ? u.rawRoles : [];
                const roles = rawRoles.length > 0 ? rawRoles : (u.role ? [u.role] : []);
                return roles.some(r => searchRoles.includes(r));
            });

            const activeSessions = await prisma.queueSession.findMany({
                where: { isActive: true, isDeleted: false },
                select: { staffId: true }
            });
            const activeStaffIds = new Set(activeSessions.map(s => s.staffId));

            const filteredUserIds = filteredUsers.map(u => u.id);
            let jobCountMap = {};

            if (['PRESS', 'POST_PRESS', 'FINISHING'].includes(role)) {
                const targetModule = role === 'PRESS' ? 'press' : role === 'POST_PRESS' ? 'post_press' : 'finishing';
                const logGroups = await prisma.jobTaskLog.groupBy({
                    by: ['staffId', 'jobId'],
                    where: {
                        staffId: { in: filteredUserIds },
                        module: targetModule,
                        completedAt: { gte: startDate, lte: endDate }
                    }
                });
                // Count distinct jobIds per staffId
                const jobsPerStaff = {};
                for (const row of logGroups) {
                    if (!jobsPerStaff[row.staffId]) jobsPerStaff[row.staffId] = new Set();
                    jobsPerStaff[row.staffId].add(row.jobId);
                }
                for (const [staffId, jobSet] of Object.entries(jobsPerStaff)) {
                    jobCountMap[staffId] = jobSet.size;
                }
            } else {
                let matchField = 'createdById';
                if (role === 'DISPATCH') matchField = 'dispatchedById';
                if (role === 'CASHIER') matchField = 'paymentHandledById';
                const jobCounts = await prisma.job.groupBy({
                    by: [matchField],
                    where: {
                        [matchField]: { in: filteredUserIds },
                        createdAt: { gte: startDate, lte: endDate }
                    },
                    _count: { id: true }
                });
                for (const row of jobCounts) {
                    jobCountMap[row[matchField]] = row._count.id;
                }
            }

            const staffList = [];
            for (const user of filteredUsers) {
                const jobCount = jobCountMap[user.id] || 0;
                const rawRoles = Array.isArray(user.rawRoles) ? user.rawRoles : [];
                const roles = rawRoles.length > 0 ? rawRoles : (user.role ? [user.role] : []);
                const isTargetRole = roles.some(r => targetRoles.includes(r));

                if (isTargetRole || jobCount > 0) {
                    staffList.push({
                        _id: String(user.id),
                        name: user.name,
                        roles: roles,
                        lastLoginAt: user.lastLoginAt,
                        isActive: activeStaffIds.has(user.id),
                        jobCount
                    });
                }
            }

            staffList.sort((a, b) => b.jobCount - a.jobCount || a.name.localeCompare(b.name));

            const jobStatsRaw = await prisma.job.groupBy({
                by: ['jobStatus'],
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate
                    }
                },
                _count: {
                    id: true
                }
            });

            const totalJobs = jobStatsRaw.reduce((acc, curr) => acc + curr._count.id, 0);
            const dispatched = jobStatsRaw.find(s => s.jobStatus === 'DISPATCHED')?._count.id || 0;

            const response = {
                staff: staffList,
                jobSummary: {
                    total: totalJobs,
                    dispatched,
                    undispatched: totalJobs - dispatched,
                    statusBreakdown: jobStatsRaw.map(s => ({
                        status: s.jobStatus,
                        count: s._count.id
                    }))
                }
            };

            return res.json(response);
        }
    } catch (err) {
        console.error('REPORT ERROR:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * GET STAFF JOBS DRILL-DOWN
 * Role: ADMIN
 */
router.get('/staff-jobs', auth, authorize('ADMIN'), async (req, res) => {
    try {
        const { staffId, role = 'PREPRESS', timeframe, month, startDate: qStart, endDate: qEnd } = req.query;
        if (!staffId) {
            return res.status(400).json({ message: 'Staff ID is required' });
        }

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

        {
            const numericStaffId = Number(staffId);
            let staffUser = null;
            if (isNaN(numericStaffId)) {
                staffUser = await prisma.user.findFirst({
                    where: { legacyMongoId: String(staffId) }
                });
            } else {
                staffUser = await prisma.user.findUnique({
                    where: { id: numericStaffId }
                });
            }

            if (!staffUser) {
                return res.json([]);
            }

            const userId = staffUser.id;
            let dbJobs = [];

            if (['PRESS', 'POST_PRESS', 'FINISHING'].includes(role)) {
                const targetModule = role === 'PRESS' ? 'press' : role === 'POST_PRESS' ? 'post_press' : 'finishing';
                const taskLogs = await prisma.jobTaskLog.findMany({
                    where: {
                        staffId: userId,
                        module: targetModule,
                        completedAt: {
                            gte: startDate,
                            lte: endDate
                        }
                    },
                    select: { jobId: true }
                });
                const jobIds = [...new Set(taskLogs.map(log => log.jobId))];
                
                dbJobs = await prisma.job.findMany({
                    where: {
                        id: { in: jobIds }
                    },
                    include: {
                        jobItems: {
                            include: {
                                laminationSpec:    true,
                                bindingSpec:       true,
                                creasingSpec:      true,
                                cuttingSpec:       true,
                                dieCuttingSpec:    { include: { rows: true } },
                                cornerCuttingSpec: true,
                                foilSpec:          true,
                                idCardSpec:        true,
                                workflowSteps:     true
                            }
                        },
                        jobParcels: {
                            include: {
                                parcelItems: true
                            }
                        },
                        taskLogs: true,
                        packingOverride: true,
                        screenshots: true
                    },
                    orderBy: { createdAt: 'desc' }
                });
            } else {
                let matchField = 'createdById';
                if (role === 'DISPATCH') matchField = 'dispatchedById';
                if (role === 'CASHIER') matchField = 'paymentHandledById';

                dbJobs = await prisma.job.findMany({
                    where: {
                        [matchField]: userId,
                        createdAt: {
                            gte: startDate,
                            lte: endDate
                        }
                    },
                    include: {
                        jobItems: {
                            include: {
                                laminationSpec:    true,
                                bindingSpec:       true,
                                creasingSpec:      true,
                                cuttingSpec:       true,
                                dieCuttingSpec:    { include: { rows: true } },
                                cornerCuttingSpec: true,
                                foilSpec:          true,
                                idCardSpec:        true,
                                workflowSteps:     true
                            }
                        },
                        jobParcels: {
                            include: {
                                parcelItems: true
                            }
                        },
                        taskLogs: true,
                        packingOverride: true,
                        screenshots: true
                    },
                    orderBy: { createdAt: 'desc' }
                });
            }

            const adapted = dbJobs.map(j => adaptJobToLegacyShape(j));
            return res.json(adapted);
        }
    } catch (err) {
        console.error('STAFF JOBS ERROR:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

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

        {
            const jobs = await prisma.queueJob.findMany({
                where: {
                    OR: [
                        { createdAt: { gte: start, lte: end } },
                        { completedAt: { gte: start, lte: end } },
                        { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED'] } }
                    ]
                },
                orderBy: { createdAt: 'desc' }
            });

            // Get all user IDs to resolve in memory
            const userIds = new Set();
            jobs.forEach(job => {
                if (job.assignedToId) userIds.add(job.assignedToId);
                const audit = Array.isArray(job.auditLog) ? job.auditLog : [];
                audit.forEach(l => {
                    if (l.actor) {
                        if (typeof l.actor === 'number') {
                            userIds.add(l.actor);
                        } else if (typeof l.actor === 'string' && !isNaN(Number(l.actor))) {
                            userIds.add(Number(l.actor));
                        } else if (l.actor.id) {
                            userIds.add(Number(l.actor.id));
                        }
                    }
                });
            });

            // Fetch those users
            const users = await prisma.user.findMany({
                where: { id: { in: [...userIds] }, isDeleted: false },
                select: { id: true, name: true, legacyMongoId: true }
            });
            const userMap = new Map(users.map(u => [u.id, u]));
            const legacyMongoUserMap = new Map(users.map(u => [u.legacyMongoId, u]));

            const journal = jobs.map(job => {
                const audit = Array.isArray(job.auditLog) ? job.auditLog : [];
                
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

                // Helper to resolve actor name
                const getActorName = (actor) => {
                    if (!actor) return 'System';
                    if (typeof actor === 'number') {
                        return userMap.get(actor)?.name || 'System';
                    }
                    if (typeof actor === 'string') {
                        const num = Number(actor);
                        if (!isNaN(num)) {
                            return userMap.get(num)?.name || 'System';
                        }
                        return legacyMongoUserMap.get(actor)?.name || actor || 'System';
                    }
                    if (typeof actor === 'object') {
                        if (actor.name) return actor.name;
                        if (actor.id) {
                            const num = Number(actor.id);
                            return userMap.get(num)?.name || 'System';
                        }
                    }
                    return 'System';
                };

                // 2. Extract Reassignment History
                const reassignments = audit
                    .filter(l => ['REASSIGNED', 'REASSIGN_REQUESTED', 'PAUSED'].includes(l.action))
                    .map(l => {
                        let reason = l.details?.notes || l.details?.reason || 'No reason provided';
                        
                        // Audit Polish: If it's a PUSH reassignment, label it clearly
                        if (l.action === 'REASSIGNED' && l.details?.forceMode === 'PUSH') {
                            reason = `[FORCED PUSH] ${reason}`;
                        }
                        if (l.action === 'PAUSED' && l.details?.isInterruption) {
                            reason = `[INTERRUPTED] ${reason}`;
                        }

                        // Resolve names from IDs if they are present
                        const fromName = l.details?.fromStaffName || getActorName(l.details?.requestedBy || l.details?.actor);
                        const toName = l.details?.toStaffName || getActorName(l.details?.toStaff);

                        return {
                            type: l.action,
                            timestamp: l.timestamp,
                            from: fromName || 'System',
                            to: toName || 'Pool',
                            reason: reason,
                            forceMode: l.details?.forceMode,
                            batchMode: l.details?.batchMode
                        };
                    });

                const formatDurationMs = (ms) => {
                    if (!ms || ms < 1000) return '0s';
                    const s = Math.floor((ms / 1000) % 60);
                    const m = Math.floor((ms / (1000 * 60)) % 60);
                    const h = Math.floor(ms / (1000 * 60 * 60));
                    const parts = [];
                    if (h > 0) parts.push(`${h}h`);
                    if (m > 0) parts.push(`${m}m`);
                    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
                    return parts.join(' ');
                };

                const sortedAudit = [...audit].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                let lastStateTime = null;
                let lastState = null;

                // 3. Formatted Audit Log for Detailed Visual Timeline
                const eventTimeline = sortedAudit.map(log => {
                    let description = '';
                    const actorName = getActorName(log.actor);
                    const logTime = new Date(log.timestamp).getTime();
                    let durationStr = '';

                    if (lastStateTime) {
                        const durationMs = logTime - lastStateTime;
                        if (durationMs >= 1000) {
                            if (lastState === 'PAUSED' && log.action === 'RESUMED') {
                                durationStr = ` (Hold Duration: ${formatDurationMs(durationMs)})`;
                            } else if ((lastState === 'ASSIGNED' || lastState === 'RESUMED') && (log.action === 'PAUSED' || log.action === 'COMPLETED' || log.action === 'REASSIGNED')) {
                                durationStr = ` (Work Duration: ${formatDurationMs(durationMs)})`;
                            } else if (lastState === 'CREATED' && log.action === 'ASSIGNED') {
                                durationStr = ` (Queue Wait: ${formatDurationMs(durationMs)})`;
                            } else if (lastState === 'REASSIGN_REQUESTED') {
                                durationStr = ` (Wait time: ${formatDurationMs(durationMs)})`;
                            } else {
                                durationStr = ` (Duration: ${formatDurationMs(durationMs)})`;
                            }
                        }
                    }
                    
                    lastStateTime = logTime;
                    lastState = log.action;
                    
                    switch (log.action) {
                        case 'CREATED':
                            if (log.details?.action === 'PIN') {
                                description = `Job pinned to ${log.details.pinnedToName || 'staff member'}`;
                            } else if (log.details?.action === 'UNPIN') {
                                description = `Job unpinned`;
                            } else if (log.details?.action === 'REORDER') {
                                description = `Queue priority reordered by admin`;
                            } else if (log.details?.action === 'BATCH_RESERVED') {
                                description = `Job auto-reserved in sequential batch for staff`;
                            } else {
                                description = `Job created in queue`;
                            }
                            break;
                        case 'ASSIGNED':
                            if (log.details?.action === 'WALKIN_APPROVED') {
                                description = `Walk-in job approved and assigned to ${actorName}`;
                            } else if (log.details?.manualPick || log.details?.viaFindJob) {
                                description = `Manually claimed via Find Job by ${actorName}`;
                            } else {
                                description = `Assigned to ${actorName}`;
                            }
                            break;
                        case 'PAUSED':
                            description = `Placed on hold: "${log.details?.reason || log.details?.notes || 'No reason specified'}" by ${actorName}`;
                            break;
                        case 'RESUMED':
                            description = `Resumed by ${actorName}`;
                            break;
                        case 'REASSIGN_REQUESTED':
                            description = `Reassignment requested by ${actorName}. Reason: "${log.details?.reason || 'No reason'}"`;
                            break;
                        case 'REASSIGNED':
                            if (log.details?.action === 'TAKEN_BY_OTHER_STAFF') {
                                description = `Taken by ${log.details.toStaffName || 'another staff'} via Find Job (previously held by ${log.details.fromStaffName || 'previous staff'})`;
                            } else if (log.details?.action === 'REASSIGN_APPROVED') {
                                description = `Reassignment request approved. Moved to ${log.details.targetStaffName || 'new staff'}`;
                            } else {
                                description = `Reassigned from ${log.details.fromStaffName || 'Pool'} to ${log.details.toStaffName || 'Pool'}. Reason: "${log.details.notes || 'None'}"`;
                            }
                            break;
                        case 'COMPLETED':
                            if (log.details?.action === 'ADMIN_DELETED') {
                                description = `Deleted from queue by admin`;
                            } else {
                                description = `Completed by ${actorName}`;
                            }
                            break;
                        default:
                            description = `${log.action} event triggered`;
                    }

                    if (durationStr) description += durationStr;

                    return {
                        action: log.action,
                        timestamp: log.timestamp,
                        actorName,
                        description,
                        details: log.details
                    };
                });

                // 4. Calculate Chronological Work/Hold segments per staff
                const segments = [];
                let currentSegment = null;

                sortedAudit.forEach(log => {
                    const logTime = new Date(log.timestamp);
                    const staffName = getActorName(log.actor);

                    if (log.action === 'ASSIGNED') {
                        if (currentSegment) {
                            currentSegment.endTime = logTime;
                            currentSegment.durationMs = Math.max(0, logTime.getTime() - new Date(currentSegment.startTime).getTime());
                            segments.push(currentSegment);
                        }
                        currentSegment = {
                            type: 'WORK',
                            staffName,
                            startTime: log.timestamp,
                            details: log.details
                        };
                    } else if (log.action === 'PAUSED') {
                        if (currentSegment) {
                            currentSegment.endTime = logTime;
                            currentSegment.durationMs = Math.max(0, logTime.getTime() - new Date(currentSegment.startTime).getTime());
                            segments.push(currentSegment);
                        }
                        currentSegment = {
                            type: 'HOLD',
                            staffName,
                            startTime: log.timestamp,
                            reason: log.details?.reason || log.details?.notes || 'Manual Hold'
                        };
                    } else if (log.action === 'RESUMED') {
                        if (currentSegment) {
                            currentSegment.endTime = logTime;
                            currentSegment.durationMs = Math.max(0, logTime.getTime() - new Date(currentSegment.startTime).getTime());
                            segments.push(currentSegment);
                        }
                        currentSegment = {
                            type: 'WORK',
                            staffName,
                            startTime: log.timestamp
                        };
                    } else if (log.action === 'REASSIGNED' || log.action === 'REASSIGN_REQUESTED') {
                        if (currentSegment) {
                            currentSegment.endTime = logTime;
                            currentSegment.durationMs = Math.max(0, logTime.getTime() - new Date(currentSegment.startTime).getTime());
                            segments.push(currentSegment);
                            currentSegment = null;
                        }
                        if (log.action === 'REASSIGNED' && log.details?.toStaffName && log.details.toStaffName !== 'Pool') {
                            currentSegment = {
                                type: 'WORK',
                                staffName: log.details.toStaffName,
                                startTime: log.timestamp,
                                reason: log.details.notes
                            };
                        }
                    } else if (log.action === 'COMPLETED') {
                        if (currentSegment) {
                            currentSegment.endTime = logTime;
                            currentSegment.durationMs = Math.max(0, logTime.getTime() - new Date(currentSegment.startTime).getTime());
                            segments.push(currentSegment);
                            currentSegment = null;
                        }
                    }
                });

                if (currentSegment && !['COMPLETED', 'DUPLICATE', 'JUNK'].includes(job.status)) {
                    const nowTime = new Date();
                    currentSegment.endTime = nowTime;
                    currentSegment.durationMs = Math.max(0, nowTime.getTime() - new Date(currentSegment.startTime).getTime());
                    currentSegment.isOngoing = true;
                    segments.push(currentSegment);
                }

                const assignedUser = job.assignedToId ? userMap.get(job.assignedToId) : null;

                return {
                    _id: String(job.id),
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
                    staffName: assignedUser?.name || 'Unassigned',
                    eventTimeline,
                    segments
                };
            });

            return res.json(journal);
        }
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
        {
            const limit = Number(req.query.limit) || 100;
            
            // Fetch most recent active/modified jobs to build a real-time journal
            const jobs = await prisma.queueJob.findMany({
                where: { isSuperseded: false, isDeleted: false },
                orderBy: { updatedAt: 'desc' },
                take: limit
            });

            // Gather all user IDs from audit logs to resolve names
            const userIds = new Set();
            jobs.forEach(j => {
                if (j.assignedToId) userIds.add(j.assignedToId);
                const audit = Array.isArray(j.auditLog) ? j.auditLog : [];
                audit.forEach(log => {
                    if (log.actor) {
                        if (typeof log.actor === 'number') userIds.add(log.actor);
                        else if (typeof log.actor === 'string' && !isNaN(Number(log.actor))) userIds.add(Number(log.actor));
                        else if (log.actor.id) userIds.add(Number(log.actor.id));
                    }
                });
            });

            const users = await prisma.user.findMany({
                where: { id: { in: [...userIds] }, isDeleted: false },
                select: { id: true, name: true, legacyMongoId: true }
            });
            const userMap = new Map(users.map(u => [u.id, u]));
            const legacyMongoUserMap = new Map(users.map(u => [u.legacyMongoId, u]));

            const getActorName = (actor) => {
                if (!actor) return '—';
                if (typeof actor === 'number') {
                    return userMap.get(actor)?.name || '—';
                }
                if (typeof actor === 'string') {
                    const num = Number(actor);
                    if (!isNaN(num)) {
                        return userMap.get(num)?.name || '—';
                    }
                    return legacyMongoUserMap.get(actor)?.name || actor;
                }
                if (typeof actor === 'object') {
                    if (actor.name) return actor.name;
                    if (actor.id) {
                        const num = Number(actor.id);
                        return userMap.get(num)?.name || '—';
                    }
                }
                return '—';
            };

            let eventLogs = [];

            jobs.forEach(j => {
                const audit = Array.isArray(j.auditLog) ? j.auditLog : [];
                if (audit.length > 0) {
                    audit.forEach(log => {
                        let staffName = '—';
                        if (log.actor) {
                            staffName = getActorName(log.actor);
                        } else if (log.details && log.details.staffName) {
                            staffName = log.details.staffName;
                        } else if (log.details && log.details.requestedByName) {
                             staffName = log.details.requestedByName;
                        }

                        eventLogs.push({
                            _id: j.id + '_' + new Date(log.timestamp).getTime() + '_' + Math.random().toString(36).substr(2, 5),
                            jobId: String(j.id),
                            customerName: j.customerName,
                            status: log.action, // e.g., QUEUED, ASSIGNED, COMPLETED
                            assignedTo: { name: staffName },
                            updatedAt: log.timestamp,
                            returnReason: log.details && Object.keys(log.details).length > 0 ? (log.details.notes || log.details.reason || JSON.stringify(log.details)) : ''
                        });
                    });
                } else {
                    // Fallback if no audit log
                    const assignedUser = j.assignedToId ? userMap.get(j.assignedToId) : null;
                    eventLogs.push({
                        _id: String(j.id),
                        jobId: String(j.id),
                        customerName: j.customerName,
                        status: j.status,
                        assignedTo: assignedUser ? { name: assignedUser.name } : null,
                        updatedAt: j.updatedAt,
                        returnReason: j.returnReason
                    });
                }
            });

            // Sort globally by timestamp, newest first
            eventLogs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

            // Slice to limit
            return res.json(eventLogs.slice(0, limit));
        }
    } catch (err) {
        console.error('QUEUE EVENT LOG ERROR:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

function computeItemActiveStageForReport(item, job) {
    function hasTask(val) { return val && val !== 'NONE'; }
    function isDone(taskVal, statusVal) {
        if (!taskVal || taskVal === 'NONE') return true;
        return statusVal === 'COMPLETED';
    }

    // Press is complete when explicitly marked, print confirmed, or job already past press
    const pressComplete =
        item.pressStatus === 'COMPLETED' ||
        item.printConfirmed === true ||
        (job && ['PRINTED', 'PACKED', 'DISPATCHED', 'PARTIAL_DISPATCH', 'RECEIVED'].includes(job.jobStatus));
    if (!pressComplete) return 'press';

    const isIdCard     = item.idCard === true;
    const isPouchLam   = item.pouchLamination === true;
    const hasLam       = hasTask(item.lamination);
    const hasCreasing  = hasTask(item.creasing);
    const hasBinding   = hasTask(item.binding);
    const hasCutting   = hasTask(item.cutting);
    const hasDieCut    = hasTask(item.dieCutting);
    const hasCornerCut = hasTask(item.cornerCutting);
    const hasFusing    = hasTask(item.fusing);
    const hasFoil      = hasTask(item.foil);
    const hasCutting2  = hasTask(item.cutting2);
    const hasHoles     = hasTask(item.holes);

    const lamDone       = isDone(item.lamination,    item.laminationStatus);
    const creasingDone  = isDone(item.creasing,      item.creasingStatus);
    const bindingDone   = isDone(item.binding,       item.bindingStatus);
    const cuttingDone   = isDone(item.cutting,       item.cuttingStatus);
    const dieCutDone    = isDone(item.dieCutting,    item.dieCuttingStatus);
    const cornerCutDone = isDone(item.cornerCutting, item.cornerCuttingStatus);
    const fusingDone    = isDone(item.fusing,        item.fusingStatus);
    const foilDone      = isDone(item.foil,          item.foilStatus);
    const cutting2Done  = isDone(item.cutting2,      item.cutting2Status);
    const holesDone     = isDone(item.holes,         item.holesStatus);

    // ID Card flow: cutting -> fusing -> cutting2 -> cornerCutting -> holes -> done
    if (isIdCard) {
        if (hasCutting   && !cuttingDone)   return 'cutting';
        if (hasFusing    && !fusingDone)    return 'fusing';
        if (hasCutting2  && !cutting2Done)  return 'cutting2';
        if (hasCornerCut && !cornerCutDone) return 'cornerCutting';
        if (hasHoles     && !holesDone)     return 'holes';
        return 'done';
    }

    // Pouch lam: cutting -> binding -> done
    if (isPouchLam) {
        if (hasCutting && !cuttingDone) return 'cutting';
        if (hasBinding && !bindingDone) return 'binding';
        return 'done';
    }

    // Foil flows
    if (hasFoil) {
        if (hasBinding) {
            if (hasLam       && !lamDone)       return 'lamination';
            if (hasFoil      && !foilDone)      return 'foil';
            if (hasBinding   && !bindingDone)   return 'binding';
            if (hasCutting   && !cuttingDone)   return 'cutting';
            if (hasCornerCut && !cornerCutDone) return 'cornerCutting';
            return 'done';
        }
        if (hasLam       && !lamDone)       return 'lamination';
        if (hasFoil      && !foilDone)      return 'foil';
        if (hasCutting   && !cuttingDone)   return 'cutting';
        if (hasCornerCut && !cornerCutDone) return 'cornerCutting';
        return 'done';
    }

    // Corner cut: lamination -> cutting -> binding -> cornerCutting -> done
    if (hasCornerCut) {
        if (hasLam       && !lamDone)       return 'lamination';
        if (hasCutting   && !cuttingDone)   return 'cutting';
        if (hasBinding   && !bindingDone)   return 'binding';
        if (hasCornerCut && !cornerCutDone) return 'cornerCutting';
        return 'done';
    }

    // Die cut: lamination -> cutting -> creasing -> dieCutting -> done
    if (hasDieCut) {
        if (hasLam      && !lamDone)      return 'lamination';
        if (hasCutting  && !cuttingDone)  return 'cutting';
        if (hasCreasing && !creasingDone) return 'creasing';
        if (hasDieCut   && !dieCutDone)   return 'dieCutting';
        return 'done';
    }

    // Normal binding: lamination -> creasing -> binding -> cutting -> done
    if (hasBinding) {
        if (hasLam      && !lamDone)      return 'lamination';
        if (hasCreasing && !creasingDone) return 'creasing';
        if (hasBinding  && !bindingDone)  return 'binding';
        if (hasCutting  && !cuttingDone)  return 'cutting';
        return 'done';
    }

    // Creasing-only / cutting-only
    if (hasLam      && !lamDone)      return 'lamination';
    if (hasCutting  && !cuttingDone)  return 'cutting';
    if (hasCreasing && !creasingDone) return 'creasing';
    return 'done';
}

/**
 * GET LIVE PRODUCTION WORKLOADS
 * Role: ADMIN
 * Computes the active stage dynamically from item status fields (never trusts
 * the stale item.activeStage stored value which defaults to 'press').
 */
router.get('/production-workloads', auth, authorize('ADMIN'), async (req, res) => {
    try {
        const dbJobs = await prisma.job.findMany({
            where: {
                isDeleted: false,
                jobStatus: {
                    notIn: ['DISPATCHED', 'PACKED']
                }
            },
            include: {
                createdBy: {
                    select: { name: true }
                },
                jobItems: {
                    include: {
                        laminationSpec:    true,
                        bindingSpec:       true,
                        creasingSpec:      true,
                        cuttingSpec:       true,
                        dieCuttingSpec:    { include: { rows: true } },
                        cornerCuttingSpec: true,
                        foilSpec:          true,
                        idCardSpec:        true,
                        workflowSteps:     true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        const jobs = dbJobs.map(j => {
            const adapted = adaptJobToLegacyShape(j);
            if (j.createdBy) {
                adapted.createdBy = { name: j.createdBy.name };
            }
            return adapted;
        });

        const stages = [
            'press', 'lamination', 'foil', 'binding', 
            'fusing', 'holes', 'cutting', 'creasing', 
            'dieCutting', 'cornerCutting', 'cutting2'
        ];

        const workloads = {};
        stages.forEach(stage => {
            workloads[stage] = { stage, jobCount: 0, itemCount: 0, jobs: [] };
        });

        jobs.forEach(job => {
            const items = job.items || [];
            const activeStagesInJob = new Set();

            items.forEach((item, itemIdx) => {
                // Compute the true current stage dynamically Ã¢â‚¬â€ never trust item.activeStage
                const stage = computeItemActiveStageForReport(item, job);
                
                // Skip items that are fully done or at an unknown stage
                if (!stage || stage === 'done' || !workloads[stage]) return;

                workloads[stage].itemCount += 1;
                activeStagesInJob.add(stage);

                // Upsert job record for this stage
                let jobEntry = workloads[stage].jobs.find(j => j._id.toString() === job._id.toString());
                if (!jobEntry) {
                    jobEntry = {
                        _id: job._id,
                        jobId: job.jobId,
                        customerName: job.customerName,
                        createdAt: job.createdAt,
                        jobStatus: job.jobStatus,
                        items: []
                    };
                    workloads[stage].jobs.push(jobEntry);
                }

                jobEntry.items.push({
                    itemIndex: itemIdx,
                    orderDescription: item.orderDescription,
                    size: item.size,
                    qty: item.qty,
                    paperType: item.paperType,
                    lamination: item.lamination,
                    laminationQty: item.laminationQty,
                    binding: item.binding,
                    bindingQty: item.bindingQty,
                    creasing: item.creasing,
                    creasingQty: item.creasingQty,
                    cuttingValue: item.cuttingValue,
                    cuttingSizes: item.cuttingSizes,
                    dieCutting: item.dieCutting,
                    dieCuttingQty: item.dieCuttingQty,
                    dieCuttingRows: item.dieCuttingRows,
                    cornerCutting: item.cornerCutting,
                    cornerCuttingQty: item.cornerCuttingQty,
                    cornerCuttingValue: item.cornerCuttingValue,
                    cornerCuttingCorners: item.cornerCuttingCorners,
                    foil: item.foil,
                    foilQty: item.foilQty,
                    fusing: item.fusing,
                    fusingQty: item.fusingQty,
                    holes: item.holes,
                    cutting2: item.cutting2,
                    cutting2Value: item.cutting2Value,
                    idCard: item.idCard,
                    idCardQty: item.idCardQty,
                    idCardStatus: item.idCardStatus,
                    // Press-specific fields for the press workload card
                    pressStatus: item.pressStatus,
                    printConfirmed: item.printConfirmed,
                    machineType: item.machineType,
                    plateColour: item.plateColour
                });
            });

            activeStagesInJob.forEach(stage => {
                if (workloads[stage]) workloads[stage].jobCount += 1;
            });
        });

        res.json(Object.values(workloads));
    } catch (err) {
        console.error('PRODUCTION WORKLOADS ERROR:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * GET PRODUCTION ACTIVITY JOURNAL
 * Role: ADMIN
 */
router.get('/production-journal', auth, authorize('ADMIN'), async (req, res) => {
    try {
        const { date, module: selectedModule } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        
        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);

        const taskLogs = await prisma.jobTaskLog.findMany({
            where: {
                completedAt: { gte: start, lte: end },
                ...(selectedModule ? { module: selectedModule } : {})
            },
            include: {
                job: { select: { jobId: true, customerName: true } }
            },
            orderBy: { completedAt: 'desc' }
        });

        const journal = taskLogs.map(log => ({
            _id: `${log.jobId}_${log.id}_${log.completedAt?.getTime()}`,
            jobId: log.job.jobId,
            customerName: log.job.customerName,
            task: log.task,
            itemIndex: log.itemIndex,
            module: log.module,
            staffName: log.staffName || 'Unknown Staff',
            startedAt: log.startedAt,
            completedAt: log.completedAt,
            durationMs: log.durationMs || (log.completedAt && log.startedAt ? log.completedAt.getTime() - log.startedAt.getTime() : 0)
        }));

        res.json(journal);
    } catch (err) {
        console.error('PRODUCTION JOURNAL ERROR:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;


