import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchStaffProductivity, fetchActivityJournal } from '../../services/api'
import './AdminReports.css'
import './ActivityJournal.css'

type StaffStats = {
    _id: string
    name: string
    lastLoginAt: string | null
    jobCount: number
}

type JobStatusStat = {
    status: string
    count: number
}

type ReportData = {
    staff: StaffStats[]
    jobSummary: {
        total: number
        dispatched: number
        undispatched: number
        statusBreakdown: JobStatusStat[]
    }
}

type JournalEntry = {
    _id: string
    customerEmail: string
    customerName: string
    subject: string
    status: string
    submittedAt: string
    assignedAt: string | null
    completedAt: string | null
    metrics: {
        queueDuration: number
        holdDuration: number
        workDuration: number
    }
    reassignments: {
        type: string
        timestamp: string
        from: string
        to: string
        reason: string
        forceMode?: string
        batchMode?: boolean
    }[]
    staffName: string
}

const ROLES = [
    { id: 'PREPRESS', label: 'Prepress' },
    { id: 'DISPATCH', label: 'Dispatch' },
    { id: 'CASHIER', label: 'Cashier' }
]

const TIMEFRAMES = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: 'month', label: 'Month' },
    { id: 'range', label: 'Range' }
]

export default function AdminReports() {
    const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'JOURNAL'>('ANALYTICS')
    const [selectedRole, setSelectedRole] = useState('PREPRESS')
    const [selectedTimeframe, setSelectedTimeframe] = useState('today')
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    const [dateRange, setDateRange] = useState({
        start: new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    })

    // Formatting durations to "5m 20s" style
    const formatDuration = (ms: number) => {
        if (!ms || ms <= 0) return '0s';
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor(ms / (1000 * 60 * 60));

        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
        
        return parts.join(' ');
    }

    // Generate Month Options for selection
    const monthOptions = useMemo(() => {
        const options = []
        const now = new Date()
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
            options.push({ val, label })
        }
        return options
    }, [])

    const { data: reportData, isLoading } = useQuery<ReportData>({
        queryKey: ['staff-productivity', selectedRole, selectedTimeframe, selectedMonth, dateRange],
        queryFn: () => fetchStaffProductivity(
            selectedRole,
            selectedTimeframe,
            selectedTimeframe === 'month' ? selectedMonth : undefined,
            selectedTimeframe === 'range' ? dateRange.start : undefined,
            selectedTimeframe === 'range' ? dateRange.end : undefined
        ),
        enabled: activeTab === 'ANALYTICS',
        refetchInterval: 30000,
        staleTime: 60000,
        placeholderData: (previousData: any) => previousData,
    })

    const { data: journalData, isLoading: isJournalLoading } = useQuery<JournalEntry[]>({
        queryKey: ['activity-journal', dateRange.start],
        queryFn: () => fetchActivityJournal(dateRange.start),
        enabled: activeTab === 'JOURNAL',
        refetchInterval: 60000
    })

    const staffData = reportData?.staff || []
    const jobSummary = reportData?.jobSummary

    const getStatus = (lastLoginAt: string | null) => {
        if (!lastLoginAt) return { label: 'Offline', color: '#cbd5e1', pulse: false }
        const lastActive = new Date(lastLoginAt)
        const now = new Date()
        const diff = (now.getTime() - lastActive.getTime()) / (1000 * 60)

        if (diff <= 15) return { label: 'Active Now', color: '#22c55e', pulse: true }
        if (diff <= 60) return { label: 'Recently Active', color: '#f59e0b', pulse: false }
        return { label: 'Offline', color: '#cbd5e1', pulse: false }
    }

    const roleClass = selectedRole.toLowerCase()

    return (
        <div className="admin-reports-page">
            <div className="reports-premium-header">
                <div className="reports-title-area">
                    <h2>Admin Insights</h2>
                    <p>Departmental productivity and deep-dive activity tracking.</p>
                </div>

                <div className="tab-navigation-bar" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button 
                        className={`role-tab ${activeTab === 'ANALYTICS' ? 'active' : ''}`}
                        onClick={() => setActiveTab('ANALYTICS')}
                    >
                        Productivity Analytics
                    </button>
                    <button 
                        className={`role-tab ${activeTab === 'JOURNAL' ? 'active' : ''}`}
                        onClick={() => setActiveTab('JOURNAL')}
                    >
                        Activity Journal
                    </button>
                </div>
            </div>

            {activeTab === 'ANALYTICS' && (
                <>
                    <div className="reports-controls-bar" style={{ marginTop: '1.5rem', background: 'white', padding: '1rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                        <div className="filter-pill-group">
                            {TIMEFRAMES.map(tf => (
                                <button
                                    key={tf.id}
                                    onClick={() => setSelectedTimeframe(tf.id)}
                                    className={`filter-pill ${selectedTimeframe === tf.id ? 'active' : ''}`}
                                >
                                    {tf.label}
                                </button>
                            ))}
                        </div>

                        {selectedTimeframe === 'month' && (
                            <div className="advanced-filter-controls">
                                <select
                                    className="reports-select"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                >
                                    {monthOptions.map(opt => (
                                        <option key={opt.val} value={opt.val}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {selectedTimeframe === 'range' && (
                            <div className="advanced-filter-controls">
                                <div className="reports-input-group">
                                    <input
                                        type="date"
                                        className="reports-date-input"
                                        value={dateRange.start}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                    />
                                    <span className="arrow-separator">→</span>
                                    <input
                                        type="date"
                                        className="reports-date-input"
                                        value={dateRange.end}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* JOB OVERVIEW SECTION — standalone, no role dependency */}
                    {!isLoading && jobSummary && (
                        <div className="reports-stat-grid" style={{ marginTop: '1.5rem' }}>
                            <div className="stat-card total">
                                <div className="stat-icon">📊</div>
                                <div className="stat-details">
                                    <span className="stat-label">Total Jobs</span>
                                    <span className="stat-value">{jobSummary.total}</span>
                                </div>
                            </div>
                            <div className="stat-card dispatched">
                                <div className="stat-icon">✅</div>
                                <div className="stat-details">
                                    <span className="stat-label">Dispatched</span>
                                    <span className="stat-value">{jobSummary.dispatched}</span>
                                </div>
                            </div>
                            <div className="stat-card undispatched">
                                <div className="stat-icon">⏳</div>
                                <div className="stat-details">
                                    <span className="stat-label">Undispatched</span>
                                    <span className="stat-value">{jobSummary.undispatched}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STAFF PERFORMANCE SECTION — role tabs apply only here */}
                    <div className="role-selector-bar" style={{ marginTop: '2rem' }}>
                        {ROLES.map(role => (
                            <button
                                key={role.id}
                                onClick={() => setSelectedRole(role.id)}
                                className={`role-tab ${selectedRole === role.id ? 'active' : ''}`}
                            >
                                <span className="role-tab-label">{role.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="reports-data-section">
                        <div className="section-header" style={{ padding: '1.5rem 1.5rem 0' }}>
                            <h3>Team Performance</h3>
                            <p>Individual workload and real-time status.</p>
                        </div>
                        {isLoading ? (
                            <div style={{ padding: '5rem', textAlign: 'center' }}>
                                <div className="dispatch-spinner" style={{ margin: '0 auto' }}></div>
                            </div>
                        ) : (
                            <table className="reports-table">
                                <thead>
                                    <tr>
                                        <th>Team Member</th>
                                        <th>Live Status</th>
                                        <th>Last Recorded Activity</th>
                                        <th style={{ textAlign: 'center' }}>Jobs Processed</th>
                                        <th style={{ width: '200px' }}>Relative Workload</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {staffData.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ textAlign: 'center', padding: '5rem', color: '#94a3b8', fontWeight: 600 }}>
                                                No productivity data found for this selection.
                                            </td>
                                        </tr>
                                    ) : (
                                        staffData.map((staff) => {
                                            const status = getStatus(staff.lastLoginAt)
                                            const maxCount = Math.max(...staffData.map(s => s.jobCount), 1)
                                            const percentage = (staff.jobCount / maxCount) * 100

                                            return (
                                                <tr key={staff._id} className="reports-row">
                                                    <td>
                                                        <div className="member-cell">
                                                            <div className="member-avatar">
                                                                {staff.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="member-name">{staff.name}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="status-indicator">
                                                            <div
                                                                className="status-dot"
                                                                style={{
                                                                    background: status.color,
                                                                    boxShadow: status.pulse ? `0 0 0 4px ${status.color}20` : 'none',
                                                                    animation: status.pulse ? 'pulse 2s infinite' : 'none'
                                                                }}
                                                            />
                                                            <span className="status-text" style={{ color: status.pulse ? status.color : '#64748b' }}>
                                                                {status.label}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>
                                                            {staff.lastLoginAt ? new Date(staff.lastLoginAt).toLocaleString('en-IN', {
                                                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                                            }) : '—'}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <div className={`count-badge ${roleClass}`}>
                                                            {staff.jobCount}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="contribution-track">
                                                            <div
                                                                className={`contribution-bar ${roleClass}`}
                                                                style={{ width: `${percentage}%` }}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'JOURNAL' && (
                <div className="journal-section">
                    <div className="journal-header-area" style={{ marginTop: '1.5rem' }}>
                        <div className="advanced-filter-controls" style={{ background: 'white', padding: '0.75rem 1rem', borderRadius: '1rem', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Date:</span>
                            <input
                                type="date"
                                className="reports-date-input"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            />
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
                            Showing detailed job logs for {new Date(dateRange.start).toLocaleDateString()}
                        </div>
                    </div>

                    <div className="journal-table-wrapper">
                        {isJournalLoading ? (
                            <div style={{ padding: '5rem', textAlign: 'center' }}>
                                <div className="dispatch-spinner" style={{ margin: '0 auto' }}></div>
                                <p style={{ marginTop: '1rem', color: '#64748b', fontWeight: 600 }}>Compiling Journal...</p>
                            </div>
                        ) : (
                            <table className="journal-table">
                                <thead>
                                    <tr>
                                        <th>Customer / Subject</th>
                                        <th>Timeline</th>
                                        <th>Efficiency Metrics</th>
                                        <th>Current Staff</th>
                                        <th>Handoff Log</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!journalData || journalData.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ textAlign: 'center', padding: '5rem', color: '#94a3b8', fontWeight: 600 }}>
                                                No activity recorded for this date.
                                            </td>
                                        </tr>
                                    ) : (
                                        journalData.map((job) => (
                                            <tr key={job._id}>
                                                <td>
                                                    <span className="email-cell">{job.customerEmail}</span>
                                                    <span className="subject-subtext">{job.subject || job.customerName}</span>
                                                </td>
                                                <td>
                                                    <div className="timeline-item">
                                                        <span className="timeline-time">
                                                            {new Date(job.submittedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        <span className="timeline-label">Submitted</span>
                                                    </div>
                                                    {job.assignedAt && (
                                                        <div className="timeline-item" style={{ marginTop: '0.5rem' }}>
                                                            <span className="timeline-time">
                                                                {new Date(job.assignedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            <span className="timeline-label">First Picked</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        <div className="duration-group">
                                                            <span className="timeline-label">Queue Wait:</span>
                                                            <div className={`duration-badge ${job.metrics.queueDuration > 300 * 60 * 1000 ? 'urgent-highlight' : ''}`}>
                                                                {formatDuration(job.metrics.queueDuration)}
                                                            </div>
                                                        </div>
                                                        <div className="duration-group">
                                                            <span className="timeline-label">Work Time:</span>
                                                            <div className="duration-badge working">
                                                                {formatDuration(job.metrics.workDuration)}
                                                            </div>
                                                        </div>
                                                        {job.metrics.holdDuration > 0 && (
                                                            <div className="duration-group">
                                                                <span className="timeline-label">Total Hold:</span>
                                                                <div className="duration-badge hold">
                                                                    {formatDuration(job.metrics.holdDuration)}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="member-cell">
                                                        <div className="member-avatar" style={{ width: '24px', height: '24px', fontSize: '0.7rem' }}>
                                                            {job.staffName.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span style={{ fontWeight: 700, color: '#475569' }}>{job.staffName}</span>
                                                    </div>
                                                    <span className={`status-badge status-${job.status.toLowerCase()}`} style={{ fontSize: '0.6rem', marginTop: '0.25rem' }}>
                                                        {job.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="handoff-chain">
                                                        {job.reassignments.length > 0 ? (
                                                            job.reassignments.map((move, idx) => {
                                                                const isPush = move.reason.includes('[FORCED PUSH]');
                                                                const isInterruption = move.reason.includes('[INTERRUPTED]');
                                                                const isBatch = move.batchMode;

                                                                return (
                                                                    <div key={idx} className={`handoff-step ${isPush ? 'push-alert' : ''}`}>
                                                                        <div className="handoff-header">
                                                                            <span style={{ fontWeight: 800 }}>
                                                                                {move.from} → {move.to}
                                                                                {isBatch && <span className="batch-pill">BATCH</span>}
                                                                            </span>
                                                                            <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                                                                                {new Date(move.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                            </span>
                                                                        </div>
                                                                        <div className={`handoff-reason ${isPush ? 'urgent' : isInterruption ? 'interruption' : ''}`}>
                                                                            {move.reason}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.75rem' }}>No reassignments</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.2); opacity: 0.7; }
                    100% { transform: scale(1); opacity: 1; }
                }
                .duration-group {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1rem;
                }
            `}</style>
        </div>
    )
}
