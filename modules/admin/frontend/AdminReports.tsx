import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchStaffProductivity, fetchActivityJournal, fetchProductionWorkloads, fetchProductionJournal, fetchStaffJobs } from '@core/services/api'
import WorkflowJobDetailsModal from '@core/components/WorkflowJobDetailsModal'
import './AdminReports.css'
import './ActivityJournal.css'

type StaffStats = {
    _id: string
    name: string
    roles: string[]
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
    eventTimeline?: {
        action: string
        timestamp: string
        actorName: string
        description: string
        details?: any
    }[]
    segments?: {
        type: 'WORK' | 'HOLD'
        staffName: string
        startTime: string
        endTime: string
        durationMs: number
        reason?: string
        isOngoing?: boolean
    }[]
}

const STAFF_ROLES = [
    { id: 'PREPRESS',   label: 'Prepress' },
    { id: 'DISPATCH',   label: 'Dispatch' },
    { id: 'CASHIER',    label: 'Cashier' },
]

const PRODUCTION_ROLES = [
    { id: 'PRESS',      label: ' Press',      color: '#6366f1' },
    { id: 'POST_PRESS', label: ' Post Press',  color: '#f59e0b' },
    { id: 'FINISHING',  label: ' Finishing',   color: '#10b981' },
]

const TIMEFRAMES = [
    { id: 'today', label: 'Today' },
    { id: '7d',    label: '7D' },
    { id: '30d',   label: '30D' },
    { id: 'month', label: 'Month' },
    { id: 'range', label: 'Range' },
]

const PROD_ROLE_IDS = PRODUCTION_ROLES.map(r => r.id)

type WorkloadItem = {
    itemIndex: number
    orderDescription?: string
    size?: any
    lamination?: string
    laminationQty?: number
    cutting?: string
    cuttingValue?: string
    cuttingStatus?: string
    cutting2?: string
    cutting2Value?: string
    cutting2Status?: string
    creasing?: string
    creasingQty?: number
    creasingStatus?: string
    perforation?: string
    perforationQty?: number
    perforationStatus?: string
    halfCutting?: string
    halfCuttingQty?: number
    halfCuttingStatus?: string
}

type WorkloadJob = {
    _id: string
    jobId: number
    customerName: string
    jobStatus: string
    createdAt: string
    items: WorkloadItem[]
}

type StageWorkload = {
    stage: string
    jobCount: number
    itemCount: number
    jobs: WorkloadJob[]
}

type ProductionJournalEntry = {
    _id: string
    jobId: number
    customerName: string
    task: string
    itemIndex: number
    module: string
    staffName: string
    startedAt: string
    completedAt: string
    durationMs: number
}

const STAGE_META: Record<string, { label: string; icon: string; color: string }> = {
    press:         { label: 'Press',          icon: '🖨️', color: '#6366f1' },
    lamination:    { label: 'Lamination',     icon: '✨', color: '#8b5cf6' },
    foil:          { label: 'Foil',           icon: '🌟', color: '#d97706' },
    binding:       { label: 'Binding',        icon: '📚', color: '#0891b2' },
    fusing:        { label: 'Fusing',         icon: '🔥', color: '#dc2626' },
    holes:         { label: 'Holes',          icon: '⭕', color: '#64748b' },
    cutting:       { label: 'Cutting',        icon: '✂️', color: '#059669' },
    creasing:      { label: 'Creasing',       icon: '📐', color: '#7c3aed' },
    dieCutting:    { label: 'Die Cutting',    icon: '🔲', color: '#be185d' },
    cornerCutting: { label: 'Corner Cut',     icon: '📏', color: '#0d9488' },
    cutting2:      { label: 'Final Cutting',  icon: '🔪', color: '#ea580c' },
}

const JOURNAL_MODULES = [
    { id: 'prepress', label: 'Prepress (Queue)' },
    { id: 'press',    label: 'Press' },
    { id: 'post_press', label: 'Post Press' },
    { id: 'finishing',   label: 'Finishing' },
]

const safeFormatDate = (dateVal: any, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) => {
    if (!dateVal) return '--'
    const d = new Date(dateVal)
    if (isNaN(d.getTime())) return '--'
    return d.toLocaleString('en-IN', options)
}

const safeFormatTime = (dateVal: any, options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }) => {
    if (!dateVal) return '--'
    const d = new Date(dateVal)
    if (isNaN(d.getTime())) return '--'
    return d.toLocaleTimeString('en-IN', options)
}

const getItemStageSpecs = (item: WorkloadItem, stage: string) => {
    const specs: string[] = []
    if (stage === 'press' && item.lamination) {
        specs.push(`Lamination: ${item.lamination}`)
    }
    if (stage === 'post_press') {
        if (item.lamination) specs.push(`Lamination: ${item.lamination}`)
    }
    if (stage === 'finishing') {
        if (item.cutting && item.cutting !== 'NONE') specs.push(`Cutting: ${item.cuttingValue || item.cutting}`)
        if (item.cutting2 && item.cutting2 !== 'NONE') specs.push(`Final Cut: ${item.cutting2Value || item.cutting2}`)
        if (item.creasing && item.creasing !== 'NONE') specs.push(`Creasing: ${item.creasingQty || 'Yes'}`)
        if (item.perforation && item.perforation !== 'NONE') specs.push(`Perforation: ${item.perforationQty || 'Yes'}`)
        if (item.halfCutting && item.halfCutting !== 'NONE') specs.push(`Half Cut: ${item.halfCuttingQty || 'Yes'}`)
    }
    return specs
}

const getItemSizeText = (sizeObj?: any) => {
    if (!sizeObj) return ''
    if (typeof sizeObj === 'string') return sizeObj
    const parts = [sizeObj.h, sizeObj.w].filter(Boolean).join(' × ')
    return parts || sizeObj.defaultVal || ''
}

export default function AdminReports() {
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false)
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768)
        window.addEventListener('resize', handler)
        return () => window.removeEventListener('resize', handler)
    }, [])

    const [activeTab, setActiveTab]           = useState<'ANALYTICS' | 'JOURNAL' | 'PRODUCTION'>('ANALYTICS')
    const [selectedRole, setSelectedRole]     = useState('PREPRESS')
    const [selectedTimeframe, setSelectedTimeframe] = useState('today')
    const [selectedMonth, setSelectedMonth]   = useState(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    const [dateRange, setDateRange]           = useState({
        start: new Date().toISOString().split('T')[0],
        end:   new Date().toISOString().split('T')[0],
    })
    const [showOnlyManualPicks, setShowOnlyManualPicks] = useState(false)
    const [journalSearch, setJournalSearch]   = useState('')
    const [selectedJournalJob, setSelectedJournalJob] = useState<JournalEntry | null>(null)
    const [detailActiveTab, setDetailActiveTab] = useState<'TIMELINE' | 'SEGMENTS'>('TIMELINE')
    const [selectedStage, setSelectedStage] = useState<string | null>(null)
    const [workloadPage, setWorkloadPage] = useState(1)
    const [workloadRowsPerPage, setWorkloadRowsPerPage] = useState(10)
    const [journalModule, setJournalModule] = useState('prepress')
    const [journalDate, setJournalDate] = useState(() => new Date().toISOString().split('T')[0])
    const [journalPage, setJournalPage] = useState(1)
    const [journalRowsPerPage, setJournalRowsPerPage] = useState(20)
    const [prodJournalSearch, setProdJournalSearch] = useState('')

    // Quick Hub search and stats states
    const [selectedJob, setSelectedJob] = useState<any | null>(null)

    // Staff drill-down modal
    const [selectedStaff, setSelectedStaff] = useState<{ _id: string; name: string } | null>(null)

    const { data: workloadsData, isLoading: isWorkloadsLoading } = useQuery<StageWorkload[]>({
        queryKey:        ['production-workloads'],
        queryFn:         fetchProductionWorkloads,
        enabled:         true,
        refetchInterval: 15000,
        staleTime:       10000,
    })

    const isProductionRole = PROD_ROLE_IDS.includes(selectedRole)

    const formatDuration = (ms: number) => {
        if (!ms || ms <= 0) return '0s'
        const seconds = Math.floor((ms / 1000) % 60)
        const minutes = Math.floor((ms / (1000 * 60)) % 60)
        const hours   = Math.floor(ms / (1000 * 60 * 60))
        const parts: string[] = []
        if (hours   > 0) parts.push(`${hours}h`)
        if (minutes > 0) parts.push(`${minutes}m`)
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
        return parts.join(' ')
    }

    const monthOptions = useMemo(() => {
        const options: { val: string; label: string }[] = []
        const now = new Date()
        for (let i = 0; i < 12; i++) {
            const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            options.push({ val, label: d.toLocaleString('default', { month: 'long', year: 'numeric' }) })
        }
        return options
    }, [])

    // ── Staff productivity (All Roles) ─────────────────
    const { data: reportData, isLoading } = useQuery<ReportData>({
        queryKey: ['staff-productivity', selectedRole, selectedTimeframe, selectedMonth, dateRange],
        queryFn:  () => fetchStaffProductivity(
            selectedRole,
            selectedTimeframe,
            selectedTimeframe === 'month' ? selectedMonth : undefined,
            selectedTimeframe === 'range' ? dateRange.start : undefined,
            selectedTimeframe === 'range' ? dateRange.end   : undefined,
        ),
        enabled:          activeTab === 'ANALYTICS',
        refetchInterval:  30000,
        staleTime:        60000,
        placeholderData:  (prev: any) => prev,
    })

    // ── Journal ─────────────────────────────────────────────────────────────
    const { data: journalData, isLoading: isJournalLoading } = useQuery<JournalEntry[]>({
        queryKey:        ['activity-journal', journalDate],
        queryFn:         () => fetchActivityJournal(journalDate),
        enabled:         activeTab === 'JOURNAL' && journalModule === 'prepress',
        refetchInterval: 60000,
    })



    // ── Production Journal ──────────────────────────────────────────────────
    const { data: prodJournalData, isLoading: isProdJournalLoading } = useQuery<ProductionJournalEntry[]>({
        queryKey:        ['production-journal', journalDate, journalModule],
        queryFn:         () => fetchProductionJournal(journalDate, journalModule),
        enabled:         activeTab === 'JOURNAL' && journalModule !== 'prepress',
        refetchInterval: 60000,
    })

    // ── Staff Job Drill-down ────────────────────────────────────────────────
    const { data: staffJobsData, isLoading: isStaffJobsLoading } = useQuery<any[]>({
        queryKey: ['staff-jobs', selectedStaff?._id, selectedRole, selectedTimeframe, selectedMonth, dateRange],
        queryFn: () => fetchStaffJobs(
            selectedStaff!._id,
            selectedRole,
            selectedTimeframe,
            selectedTimeframe === 'month' ? selectedMonth : undefined,
            selectedTimeframe === 'range' ? dateRange.start : undefined,
            selectedTimeframe === 'range' ? dateRange.end : undefined,
        ),
        enabled: !!selectedStaff,
    })

    const filteredJournal = useMemo(() => {
        if (!journalData) return []
        let list = journalData
        if (showOnlyManualPicks) list = list.filter(j => j.reassignments.some(r => r.reason.includes('[FIND JOB]')))
        if (journalSearch.trim()) {
            const q = journalSearch.toLowerCase().trim()
            list = list.filter(j =>
                (j.customerEmail && j.customerEmail.toLowerCase().includes(q)) ||
                (j.customerName  && j.customerName.toLowerCase().includes(q))
            )
        }
        return list
    }, [journalData, showOnlyManualPicks, journalSearch])

    const filteredProdJournal = useMemo(() => {
        if (!prodJournalData) return []
        let list = prodJournalData
        if (prodJournalSearch.trim()) {
            const q = prodJournalSearch.toLowerCase().trim()
            list = list.filter(j =>
                (j.customerName && j.customerName.toLowerCase().includes(q)) ||
                (j.task && j.task.toLowerCase().includes(q)) ||
                (j.jobId && String(j.jobId).includes(q)) ||
                (j.staffName && j.staffName.toLowerCase().includes(q))
            )
        }
        return list
    }, [prodJournalData, prodJournalSearch])

    const totalJournalLogs = filteredJournal?.length || 0;
    const totalJournalPages = Math.ceil(totalJournalLogs / journalRowsPerPage) || 1;
    const safeJournalPage = Math.min(journalPage, totalJournalPages) || 1;
    const paginatedJournal = useMemo(() => {
        if (!filteredJournal) return [];
        const start = (safeJournalPage - 1) * journalRowsPerPage;
        return filteredJournal.slice(start, start + journalRowsPerPage);
    }, [filteredJournal, safeJournalPage, journalRowsPerPage]);

    const totalProdJournalLogs = filteredProdJournal?.length || 0;
    const totalProdJournalPages = Math.ceil(totalProdJournalLogs / journalRowsPerPage) || 1;
    const safeProdJournalPage = Math.min(journalPage, totalProdJournalPages) || 1;
    const paginatedProdJournal = useMemo(() => {
        if (!filteredProdJournal) return [];
        const start = (safeProdJournalPage - 1) * journalRowsPerPage;
        return filteredProdJournal.slice(start, start + journalRowsPerPage);
    }, [filteredProdJournal, safeProdJournalPage, journalRowsPerPage]);

    const manualPickCount = useMemo(() =>
        (journalData || []).filter(j => j.reassignments.some(r => r.reason.includes('[FIND JOB]'))).length,
    [journalData])

    const staffData  = reportData?.staff || []
    const jobSummary = reportData?.jobSummary

    const getStatus = (lastLoginAt: string | null) => {
        if (!lastLoginAt) return { label: 'Offline', color: '#cbd5e1', pulse: false }
        const diff = (Date.now() - new Date(lastLoginAt).getTime()) / 60000
        if (diff <= 15) return { label: 'Active Now',        color: '#22c55e', pulse: true  }
        if (diff <= 60) return { label: 'Recently Active',   color: '#f59e0b', pulse: false }
        return { label: 'Offline', color: '#cbd5e1', pulse: false }
    }

    const roleClass = selectedRole.toLowerCase()
    const prodRoleMeta = PRODUCTION_ROLES.find(r => r.id === selectedRole)

    // Show "Total Cutting" column for ADMIN, FINISHING_CUTTING, or any FINISHING* role
    // when viewing the FINISHING productivity tab
    const selectedStaffRoles = staffData.find(s => s._id === selectedStaff?._id)?.roles || []
    const isCuttingWorker = selectedRole === 'FINISHING' && (
        selectedStaffRoles.includes('FINISHING_CUTTING') ||
        selectedStaffRoles.includes('FINISHING') ||
        selectedStaffRoles.includes('ADMIN')
    )

    return (
        <div className="admin-reports-page">
            {/* ── Header: Tab Navbar only ────────────────────────────────── */}
            <div className="reports-premium-header">
                {/* Desktop topnav tabs */}
                <div className="reports-topnav">
                    <div className="reports-topnav-tabs">
                        <button className={`role-tab ${activeTab === 'ANALYTICS' ? 'active' : ''}`} onClick={() => setActiveTab('ANALYTICS')}>
                            📊 Productivity Analytics
                        </button>
                        <button
                            className={`role-tab ${activeTab === 'PRODUCTION' ? 'active' : ''}`}
                            onClick={() => setActiveTab('PRODUCTION')}
                            style={activeTab === 'PRODUCTION' ? { background: '#6366f1', borderColor: '#6366f1' } : {}}
                        >
                            ⚡ Live Workloads
                        </button>
                        <button className={`role-tab ${activeTab === 'JOURNAL' ? 'active' : ''}`} onClick={() => setActiveTab('JOURNAL')}>
                            📋 Activity Journal
                        </button>
                    </div>
                </div>

                {/* Mobile Tab Switcher (hidden on desktop via CSS) */}
                <div className="mobile-reports-switcher">
                    <div className="reports-dashboard-tabs">
                        <button className={`reports-dashboard-tab ${activeTab === 'ANALYTICS' ? 'active' : ''}`} onClick={() => setActiveTab('ANALYTICS')}>
                            📊 Analytics
                        </button>
                        <button className={`reports-dashboard-tab ${activeTab === 'PRODUCTION' ? 'active' : ''}`} onClick={() => setActiveTab('PRODUCTION')}>
                            ⚡ Live
                        </button>
                        <button className={`reports-dashboard-tab ${activeTab === 'JOURNAL' ? 'active' : ''}`} onClick={() => setActiveTab('JOURNAL')}>
                            📋 Journal
                        </button>
                    </div>
                </div>
            </div>

            {/* ── ANALYTICS TAB ──────────────────────────────────────────── */}
            {activeTab === 'ANALYTICS' && (
                <>
                    {/* Timeframe filter (Desktop) */}
                    <div className="reports-controls-bar desktop-filters-bar" style={{ marginTop: '1.5rem', background: 'white', padding: '1rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                        <div className="filter-pill-group">
                            {TIMEFRAMES.map(tf => (
                                <button key={tf.id} onClick={() => setSelectedTimeframe(tf.id)} className={`filter-pill ${selectedTimeframe === tf.id ? 'active' : ''}`}>
                                    {tf.label}
                                </button>
                            ))}
                        </div>
                        {selectedTimeframe === 'month' && (
                            <div className="advanced-filter-controls">
                                <select className="reports-select" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                                    {monthOptions.map(opt => <option key={opt.val} value={opt.val}>{opt.label}</option>)}
                                </select>
                            </div>
                        )}
                        {selectedTimeframe === 'range' && (
                            <div className="advanced-filter-controls">
                                <div className="reports-input-group">
                                    <input type="date" className="reports-date-input" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} />
                                    <span className="arrow-separator">→</span>
                                    <input type="date" className="reports-date-input" value={dateRange.end}   onChange={e => setDateRange(p => ({ ...p, end:   e.target.value }))} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Timeframe & Department Dropdown Filters (Mobile) */}
                    <div className="mobile-filter-bar" style={{ marginTop: '1rem' }}>
                        <div className="mobile-filter-row" style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                            <div className="mobile-filter-col" style={{ flex: 1 }}>
                                <select
                                    className="reports-select department-select-mobile"
                                    value={selectedRole}
                                    onChange={(e) => setSelectedRole(e.target.value)}
                                    style={{ width: '100%', height: '40px', padding: '0 0.75rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.78rem' }}
                                >
                                    {[...STAFF_ROLES, ...PRODUCTION_ROLES].map((role) => (
                                        <option key={role.id} value={role.id}>
                                            {role.label.trim()}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="mobile-filter-col" style={{ flex: 1 }}>
                                <select
                                    className="reports-select timeframe-select-mobile"
                                    value={selectedTimeframe}
                                    onChange={(e) => setSelectedTimeframe(e.target.value)}
                                    style={{ width: '100%', height: '40px', padding: '0 0.75rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.78rem' }}
                                >
                                    {TIMEFRAMES.map((tf) => (
                                        <option key={tf.id} value={tf.id}>
                                            {tf.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedTimeframe === 'month' && (
                            <div className="mobile-filter-date-row" style={{ marginTop: '0.5rem' }}>
                                <select className="reports-select mobile-date-input" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ width: '100%', height: '40px', padding: '0 0.75rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.78rem' }}>
                                    {monthOptions.map(opt => <option key={opt.val} value={opt.val}>{opt.label}</option>)}
                                </select>
                            </div>
                        )}
                        {selectedTimeframe === 'range' && (
                            <div className="mobile-filter-date-row range" style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                    type="date"
                                    className="reports-date-input mobile-date-input"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))}
                                    style={{ flex: 1, height: '40px', padding: '0 0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.75rem' }}
                                />
                                <span className="arrow-separator" style={{ fontWeight: 800, color: '#94a3b8' }}>→</span>
                                <input
                                    type="date"
                                    className="reports-date-input mobile-date-input"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))}
                                    style={{ flex: 1, height: '40px', padding: '0 0.5rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.75rem' }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Job overview stat cards */}
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

                    {/* Role selector — all tabs together, no divider labels */}
                    <div className="role-selector-bar" style={{ marginTop: '2rem' }}>
                        {STAFF_ROLES.map(role => (
                            <button key={role.id} onClick={() => setSelectedRole(role.id)} className={`role-tab ${selectedRole === role.id ? 'active' : ''}`}>
                                <span className="role-tab-label">{role.label}</span>
                            </button>
                        ))}
                        {PRODUCTION_ROLES.map(role => (
                            <button
                                key={role.id}
                                onClick={() => setSelectedRole(role.id)}
                                className={`role-tab ${selectedRole === role.id ? 'active' : ''}`}
                                style={selectedRole === role.id ? { background: role.color, borderColor: role.color } : {}}
                            >
                                <span className="role-tab-label">{role.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* ── Staff performance table ── */}
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
                            <>
                                {/* Desktop Table */}
                                <div className="desktop-reports-table-container">
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
                                            ) : staffData.map(staff => {
                                                const status     = getStatus(staff.lastLoginAt)
                                                const maxCount   = Math.max(...staffData.map(s => s.jobCount), 1)
                                                const percentage = (staff.jobCount / maxCount) * 100
                                                return (
                                                    <tr key={staff._id} className="reports-row" style={{ cursor: 'pointer' }} onClick={() => setSelectedStaff({ _id: staff._id, name: staff.name })}>
                                                        <td>
                                                            <div className="member-cell">
                                                                <div className="member-avatar" style={isProductionRole ? { background: prodRoleMeta?.color } : {}}>{staff.name.charAt(0).toUpperCase()}</div>
                                                                <span className="member-name">{staff.name}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="status-indicator">
                                                                <div className="status-dot" style={{ background: status.color, boxShadow: status.pulse ? `0 0 0 4px ${status.color}20` : 'none', animation: status.pulse ? 'pulse 2s infinite' : 'none' }} />
                                                                <span className="status-text" style={{ color: status.pulse ? status.color : '#64748b' }}>{status.label}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600 }}>
                                                                {staff.lastLoginAt ? new Date(staff.lastLoginAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <div 
                                                                className={`count-badge ${roleClass}`}
                                                                style={isProductionRole ? { background: `${prodRoleMeta?.color}15`, color: prodRoleMeta?.color } : {}}
                                                            >
                                                                {staff.jobCount}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="contribution-track">
                                                                <div 
                                                                    className={`contribution-bar ${roleClass}`} 
                                                                    style={{ width: `${percentage}%`, ...(isProductionRole ? { background: prodRoleMeta?.color } : {}) }} 
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Staff Cards */}
                                <div className="mobile-staff-cards-container">
                                    {staffData.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8', fontWeight: 600, fontSize: '0.875rem' }}>
                                            No productivity data found for this selection.
                                        </div>
                                    ) : (
                                        <div className="mobile-staff-cards" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
                                            {staffData.map(staff => {
                                                const status = getStatus(staff.lastLoginAt)
                                                return (
                                                    <div 
                                                        key={staff._id} 
                                                        className="mobile-staff-card" 
                                                        onClick={() => setSelectedStaff({ _id: staff._id, name: staff.name })}
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', background: '#ffffff', cursor: 'pointer' }}
                                                    >
                                                        <div className="staff-card-left" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                                                            <div className="member-avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 800, color: 'white', background: isProductionRole ? prodRoleMeta?.color : '#0f172a', flexShrink: 0 }}>
                                                                {staff.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="staff-card-info" style={{ minWidth: 0 }}>
                                                                <div className="staff-card-name" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{staff.name}</div>
                                                                <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.1rem' }}>
                                                                    <div className="status-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: status.color, boxShadow: status.pulse ? `0 0 0 4px ${status.color}20` : 'none', animation: status.pulse ? 'pulse 2s infinite' : 'none', flexShrink: 0 }} />
                                                                    <span className="status-text" style={{ fontSize: '0.68rem', color: status.pulse ? status.color : '#64748b', fontWeight: 600 }}>{status.label}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="staff-card-right" style={{ flexShrink: 0 }}>
                                                            <div className="jobs-done-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: isProductionRole ? `${prodRoleMeta?.color}12` : '#f1f5f9', color: isProductionRole ? prodRoleMeta?.color : '#0f172a', padding: '0.25rem 0.5rem', borderRadius: '0.5rem', minWidth: '45px' }}>
                                                                <span className="jobs-done-count" style={{ fontSize: '0.85rem', fontWeight: 850 }}>{staff.jobCount}</span>
                                                                <span className="jobs-done-label" style={{ fontSize: '0.55rem', fontWeight: 800, textTransform: 'uppercase', opacity: 0.8 }}>jobs</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── Staff Job Drill-down Modal ── */}
                    {selectedStaff && (
                        <div
                            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                            onClick={() => setSelectedStaff(null)}
                        >
                            <div
                                style={{ background: 'white', borderRadius: '1.25rem', width: '100%', maxWidth: '820px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
                                onClick={e => e.stopPropagation()}
                            >
                                {/* Modal Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            Jobs by {selectedStaff.name}
                                            {isCuttingWorker && staffJobsData && staffJobsData.length > 0 && (() => {
                                                const total = staffJobsData.reduce((acc: number, job: any) => {
                                                    if (!job.items) return acc
                                                    const done = ['COMPLETED', 'DONE']
                                                    for (const item of job.items) {
                                                        if (item.cutting && item.cutting !== 'NONE' && done.includes(item.cuttingStatus))
                                                            acc += parseInt(item.cuttingValue || '0', 10) || 0
                                                        if (item.cutting2 && item.cutting2 !== 'NONE' && done.includes(item.cutting2Status))
                                                            acc += parseInt(item.cutting2Value || '0', 10) || 0
                                                    }
                                                    return acc
                                                }, 0)
                                                return total > 0 ? (
                                                    <span style={{
                                                        fontSize: '0.82rem', fontWeight: 800,
                                                        background: '#d1fae5', color: '#059669',
                                                        padding: '2px 10px', borderRadius: '999px',
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                                    }}>
                                                        ✂️ {total.toLocaleString()}
                                                    </span>
                                                ) : null
                                            })()}
                                        </h3>
                                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                            {selectedRole} · {selectedTimeframe === 'month' ? selectedMonth : selectedTimeframe.toUpperCase()}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedStaff(null)}
                                        style={{ border: 'none', background: '#f1f5f9', color: '#64748b', width: 32, height: 32, borderRadius: '50%', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
                                    >
                                        ×
                                    </button>
                                </div>

                                {/* Modal Body */}
                                <div style={{ overflowY: 'auto', flex: 1, padding: '0 1.5rem 1.5rem' }}>
                                    {isStaffJobsLoading ? (
                                        <div style={{ padding: '4rem', textAlign: 'center' }}>
                                            <div className="dispatch-spinner" style={{ margin: '0 auto' }} />
                                        </div>
                                    ) : !staffJobsData || staffJobsData.length === 0 ? (
                                        <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                                            No jobs found for this period.
                                        </div>
                                    ) : (
                                        <>
                                            {/* Desktop Table View */}
                                            <div className="desktop-drilldown-table">
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '1rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                            <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>#</th>
                                                            <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Job ID</th>
                                                            <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customer</th>
                                                            <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                                                            <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</th>
                                                            {isCuttingWorker && (
                                                                <th style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 700, color: '#059669', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Cutting</th>
                                                            )}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {staffJobsData.map((job: any, idx: number) => {
                                                            let totalCutting: number | null = null
                                                            if (isCuttingWorker && job.items && job.items.length > 0) {
                                                                let sum = 0
                                                                let hasCutting = false
                                                                const doneStatuses = ['COMPLETED', 'DONE']
                                                                for (const item of job.items) {
                                                                    if (item.cutting && item.cutting !== 'NONE' && doneStatuses.includes(item.cuttingStatus)) {
                                                                        const v = parseInt(item.cuttingValue || '0', 10)
                                                                        if (!isNaN(v)) { sum += v; hasCutting = true }
                                                                    }
                                                                    if (item.cutting2 && item.cutting2 !== 'NONE' && doneStatuses.includes(item.cutting2Status)) {
                                                                        const v = parseInt(item.cutting2Value || '0', 10)
                                                                        if (!isNaN(v)) { sum += v; hasCutting = true }
                                                                    }
                                                                }
                                                                totalCutting = hasCutting ? sum : null
                                                            }
                                                            return (
                                                            <tr key={job._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontWeight: 600, fontSize: '0.78rem' }}>{idx + 1}</td>
                                                                <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: '#0f172a' }}>#{job.jobId}</td>
                                                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#475569' }}>{job.customerName || '--'}</td>
                                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: job.jobStatus === 'DISPATCHED' ? '#dcfce7' : job.jobStatus === 'PRINTED' ? '#dbeafe' : '#f1f5f9', color: job.jobStatus === 'DISPATCHED' ? '#16a34a' : job.jobStatus === 'PRINTED' ? '#1d4ed8' : '#475569' }}>
                                                                        {job.jobStatus || 'PENDING'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontWeight: 600, fontSize: '0.78rem' }}>
                                                                    {job.createdAt ? new Date(job.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--'}
                                                                </td>
                                                                {isCuttingWorker && (
                                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                                        {totalCutting !== null ? (
                                                                            <span style={{ fontWeight: 800, color: '#059669', fontSize: '0.85rem', background: '#d1fae5', padding: '2px 10px', borderRadius: '10px' }}>{totalCutting}</span>
                                                                        ) : (
                                                                            <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.78rem' }}>--</span>
                                                                        )}
                                                                    </td>
                                                                )}
                                                            </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Mobile List View */}
                                            <div className="mobile-drilldown-list" style={{ display: 'none', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                                                {staffJobsData.map((job: any, idx: number) => {
                                                    let totalCutting: number | null = null
                                                    if (isCuttingWorker && job.items && job.items.length > 0) {
                                                        let sum = 0
                                                        let hasCutting = false
                                                        const doneStatuses = ['COMPLETED', 'DONE']
                                                        for (const item of job.items) {
                                                            if (item.cutting && item.cutting !== 'NONE' && doneStatuses.includes(item.cuttingStatus)) {
                                                                const v = parseInt(item.cuttingValue || '0', 10)
                                                                if (!isNaN(v)) { sum += v; hasCutting = true }
                                                            }
                                                            if (item.cutting2 && item.cutting2 !== 'NONE' && doneStatuses.includes(item.cutting2Status)) {
                                                                const v = parseInt(item.cutting2Value || '0', 10)
                                                                if (!isNaN(v)) { sum += v; hasCutting = true }
                                                            }
                                                        }
                                                        totalCutting = hasCutting ? sum : null
                                                    }
                                                    return (
                                                        <div key={job._id} className="mobile-drilldown-item" style={{ border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '0.6rem 0.75rem', background: '#f8fafc' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a' }}>
                                                                    {idx + 1}. #{job.jobId}
                                                                </span>
                                                                <span style={{
                                                                    fontSize: '0.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                                                                    background: job.jobStatus === 'DISPATCHED' ? '#dcfce7' : job.jobStatus === 'PRINTED' ? '#dbeafe' : '#f1f5f9',
                                                                    color: job.jobStatus === 'DISPATCHED' ? '#16a34a' : job.jobStatus === 'PRINTED' ? '#1d4ed8' : '#475569',
                                                                }}>
                                                                    {job.jobStatus || 'PENDING'}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.75rem', color: '#475569' }}>
                                                                <div>
                                                                    <span style={{ fontWeight: 600, color: '#94a3b8', marginRight: '0.25rem' }}>Customer:</span>
                                                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{job.customerName || '--'}</span>
                                                                </div>
                                                                <div>
                                                                    <span style={{ fontWeight: 600, color: '#94a3b8', marginRight: '0.25rem' }}>Date:</span>
                                                                    <span style={{ fontWeight: 600, color: '#475569' }}>{job.createdAt ? new Date(job.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                                                                </div>
                                                                {totalCutting !== null && (
                                                                    <div style={{ marginTop: '0.2rem', padding: '0.35rem', background: '#ecfdf5', borderRadius: '0.375rem', border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <span style={{ fontWeight: 700, color: '#047857', fontSize: '0.72rem' }}>Total Cutting:</span>
                                                                        <span style={{ fontWeight: 850, color: '#065f46', fontSize: '0.72rem' }}>✂️ {totalCutting.toLocaleString()}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ── PRODUCTION TAB ─────────────────────────────────────────── */}
            {activeTab === 'PRODUCTION' && (
                <div className="production-workloads-section animate-fade-in">
                    {isWorkloadsLoading ? (
                        <div style={{ padding: '5rem', textAlign: 'center' }}>
                            <div className="dispatch-spinner" style={{ margin: '0 auto' }}></div>
                            <p style={{ marginTop: '1rem', color: '#64748b', fontWeight: 600 }}>Loading workloads...</p>
                        </div>
                    ) : (
                        <>
                            {/* Live Workloads Stat Strip */}
                            <div className="workloads-stat-strip">
                                <div className="workloads-stat-strip-item">
                                    <span className="wss-icon">⚡</span>
                                    <div className="wss-text">
                                        <span className="wss-value">{workloadsData?.reduce((acc, w) => acc + w.jobCount, 0) || 0}</span>
                                        <span className="wss-label">Active Jobs</span>
                                    </div>
                                </div>
                                <div className="wss-divider" />
                                <div className="workloads-stat-strip-item">
                                    <span className="wss-icon">📦</span>
                                    <div className="wss-text">
                                        <span className="wss-value">{workloadsData?.reduce((acc, w) => acc + w.itemCount, 0) || 0}</span>
                                        <span className="wss-label">Total Items</span>
                                    </div>
                                </div>
                                <div className="wss-divider" />
                                <div className="workloads-stat-strip-item">
                                    <span className="wss-icon">🏭</span>
                                    <div className="wss-text">
                                        <span className="wss-value">{Object.keys(STAGE_META).filter(k => (workloadsData?.find(w => w.stage === k)?.jobCount || 0) > 0).length}</span>
                                        <span className="wss-label">Active Stations</span>
                                    </div>
                                </div>
                                <div className="wss-live-badge">● LIVE</div>
                            </div>

                            {/* Grid of Station Cards */}
                            <div className="workloads-grid">
                                {Object.keys(STAGE_META).map(key => {
                                    const meta = STAGE_META[key]
                                    const data = workloadsData?.find(w => w.stage === key)
                                    const jobCount = data?.jobCount || 0
                                    const itemCount = data?.itemCount || 0
                                    const isActive = selectedStage === key

                                    return (
                                        <div
                                            key={key}
                                            className={`workload-card ${isActive ? 'active' : ''} ${jobCount > 0 ? 'has-jobs' : 'empty'}`}
                                            onClick={() => { setSelectedStage(isActive ? null : key); setWorkloadPage(1) }}
                                            style={isActive ? { borderLeft: `4px solid ${meta.color}`, boxShadow: `0 4px 12px ${meta.color}15` } : {}}
                                        >
                                            <div className="workload-card-icon-wrapper" style={{ background: `${meta.color}12`, color: meta.color }}>
                                                <span className="workload-card-icon">{meta.icon}</span>
                                            </div>
                                            <div className="workload-card-details">
                                                <span className="workload-card-title">{meta.label}</span>
                                                <div className="workload-card-counts">
                                                    <span className="workload-count-pill jobs">{jobCount} Job{jobCount !== 1 ? 's' : ''}</span>
                                                    <span className="workload-count-pill items">{itemCount} Item{itemCount !== 1 ? 's' : ''}</span>
                                                </div>
                                            </div>
                                            {jobCount > 0 && <span className="workload-card-indicator" style={{ background: meta.color }} />}
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Stage Details Section */}
                            {selectedStage && (() => {
                                const stageData = workloadsData?.find(w => w.stage === selectedStage)
                                const meta = STAGE_META[selectedStage]
                                const allJobs = stageData?.jobs || []
                                const totalWorkloadJobs = allJobs.length
                                const totalWorkloadPages = Math.ceil(totalWorkloadJobs / workloadRowsPerPage) || 1
                                const safeWorkloadPage = Math.min(workloadPage, totalWorkloadPages)
                                const jobsList = isMobile ? allJobs : allJobs.slice((safeWorkloadPage - 1) * workloadRowsPerPage, safeWorkloadPage * workloadRowsPerPage)

                                return (
                                    <div 
                                        className="prod-detail-section animate-fade-in" 
                                        style={{ marginTop: '2rem', background: 'white', borderRadius: '1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}
                                        onClick={() => setSelectedStage(null)}
                                    >
                                        <div 
                                            className="prod-detail-section-content"
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}
                                        >
                                            <div className="prod-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', padding: '1.5rem', paddingBottom: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <span style={{ fontSize: '1.75rem' }}>{meta.icon}</span>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: '#0f172a' }}>
                                                            {meta.label} Workload Details
                                                        </h3>
                                                        <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                                            Currently processing {totalWorkloadJobs} job{totalWorkloadJobs !== 1 ? 's' : ''} ({stageData?.itemCount || 0} items)
                                                        </p>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => setSelectedStage(null)}
                                                    style={{ border: 'none', background: '#f1f5f9', color: '#64748b', padding: '0.5rem 1rem', borderRadius: '0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                                                    onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a' }}
                                                    onMouseOut={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b' }}
                                                >
                                                    Deselect Station
                                                </button>
                                            </div>

                                            {totalWorkloadJobs === 0 ? (
                                                <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                                                    No jobs currently at this station.
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Desktop Table View */}
                                                    {!isMobile && (
                                                        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '50vh', padding: '0 1.5rem' }}>
                                                            <table className="prod-detail-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                                <thead>
                                                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>Job ID</th>
                                                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>Customer</th>
                                                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>Job Status</th>
                                                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>Queued Since</th>
                                                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.025em' }}>Station Items & Specs</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {jobsList.map(job => (
                                                                        <tr key={job._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                            <td style={{ padding: '1rem', fontWeight: 800, color: '#0f172a' }}>#{job.jobId}</td>
                                                                            <td style={{ padding: '1rem', fontWeight: 700, color: '#475569' }}>{job.customerName}</td>
                                                                            <td style={{ padding: '1rem' }}>
                                                                                <span className={`status-badge status-${(job.jobStatus || 'PENDING').toLowerCase()}`} style={{ fontSize: '0.7rem' }}>
                                                                                    {job.jobStatus || 'PENDING'}
                                                                                </span>
                                                                            </td>
                                                                            <td style={{ padding: '1rem', color: '#64748b', fontWeight: 600, fontSize: '0.8rem' }}>
                                                                                {safeFormatDate(job.createdAt)}
                                                                            </td>
                                                                            <td style={{ padding: '1rem' }}>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                                    {job.items.map(item => {
                                                                                        const specs = getItemStageSpecs(item, selectedStage)
                                                                                        return (
                                                                                            <div key={item.itemIndex} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                                    <span style={{ fontWeight: 700, color: '#1e293b' }}>
                                                                                                        Item #{item.itemIndex + 1}
                                                                                                    </span>
                                                                                                    {getItemSizeText(item.size) && (
                                                                                                        <span style={{ fontSize: '0.7rem', background: '#e2e8f0', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                                                                            {getItemSizeText(item.size)}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
                                                                                                    {item.orderDescription || 'No description'}
                                                                                                </p>
                                                                                                {specs.length > 0 && (
                                                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
                                                                                                        {specs.map((spec, idx) => (
                                                                                                            <span 
                                                                                                                key={idx} 
                                                                                                                style={{ fontSize: '0.68rem', background: `${meta.color}10`, color: meta.color, border: `1px solid ${meta.color}20`, padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}
                                                                                                            >
                                                                                                                {spec}
                                                                                                            </span>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        )
                                                                                    })}
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}

                                                    {/* Mobile Card List View */}
                                                    {isMobile && (
                                                        <div className="mobile-workload-jobs-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0 1rem 1rem 1rem', overflowY: 'auto', flex: 1 }}>
                                                            {jobsList.map(job => (
                                                                <div key={job._id} className="mobile-workload-job-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '0.75rem' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.85rem' }}>#{job.jobId}</span>
                                                                        <span className={`status-badge status-${(job.jobStatus || 'PENDING').toLowerCase()}`} style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
                                                                            {job.jobStatus || 'PENDING'}
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.6rem' }}>
                                                                        <div><strong style={{ color: '#64748b' }}>Customer:</strong> <span style={{ fontWeight: 700, color: '#0f172a' }}>{job.customerName}</span></div>
                                                                        <div><strong style={{ color: '#64748b' }}>Queued Since:</strong> <span style={{ fontWeight: 650 }}>{safeFormatDate(job.createdAt)}</span></div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                                        {job.items.map(item => {
                                                                            const specs = getItemStageSpecs(item, selectedStage)
                                                                            return (
                                                                                <div key={item.itemIndex} style={{ background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '0.72rem' }}>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#1e293b', marginBottom: '0.15rem' }}>
                                                                                        <span>Item #{item.itemIndex + 1}</span>
                                                                                        {getItemSizeText(item.size) && (
                                                                                            <span style={{ fontSize: '0.65rem', background: '#f1f5f9', color: '#64748b', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                                {getItemSizeText(item.size)}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div style={{ color: '#64748b', marginBottom: '0.25rem', fontWeight: 500 }}>{item.orderDescription || 'No description'}</div>
                                                                                    {specs.length > 0 && (
                                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                                                                                            {specs.map((spec, idx) => (
                                                                                                <span key={idx} style={{ fontSize: '0.6rem', background: `${meta.color}10`, color: meta.color, border: `1px solid ${meta.color}20`, padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>
                                                                                                    {spec}
                                                                                                </span>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Sticky Pagination Footer (Desktop only) */}
                                                    {!isMobile && (
                                                        <div className="workload-detail-footer">
                                                            <div className="pagination-controls-hub">
                                                                <div className="pagination-info">
                                                                    Page {safeWorkloadPage} of {totalWorkloadPages} • {totalWorkloadJobs} total
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                    <button
                                                                        onClick={() => setWorkloadPage(p => Math.max(1, p - 1))}
                                                                        disabled={safeWorkloadPage <= 1}
                                                                        className="btn-page-luxury"
                                                                    >
                                                                        ← PREV
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setWorkloadPage(p => Math.min(totalWorkloadPages, p + 1))}
                                                                        disabled={safeWorkloadPage >= totalWorkloadPages}
                                                                        className="btn-page-luxury"
                                                                    >
                                                                        NEXT →
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="footer-density-controls">
                                                                <div className="density-row">
                                                                    <span className="density-label">Rows per page:</span>
                                                                    <select
                                                                        className="density-select"
                                                                        value={workloadRowsPerPage}
                                                                        onChange={(e) => { setWorkloadRowsPerPage(Number(e.target.value)); setWorkloadPage(1) }}
                                                                    >
                                                                        <option value={10}>10</option>
                                                                        <option value={20}>20</option>
                                                                        <option value={50}>50</option>
                                                                        <option value={100}>100</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )
                            })()}
                        </>
                    )}
                </div>
            )}

            {/* ── JOURNAL TAB ────────────────────────────────────────────── */}
            {activeTab === 'JOURNAL' && (
                <div className="journal-section animate-fade-in">
                    <div className="journal-header-area" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Desktop View Switcher & Date */}
                        {!isMobile && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                <div className="journal-module-selector" style={{ background: '#f8fafc', padding: '0.375rem', borderRadius: '0.875rem', display: 'inline-flex', gap: '0.25rem', border: '1px solid #e2e8f0' }}>
                                    {JOURNAL_MODULES.map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => { setJournalModule(m.id); setJournalPage(1); }}
                                            className={`filter-pill ${journalModule === m.id ? 'active' : ''}`}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                                
                                <div className="advanced-filter-controls" style={{ background: 'white', padding: '0.5rem 1rem', borderRadius: '1rem', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Date:</span>
                                    <input type="date" className="reports-date-input" value={journalDate} onChange={e => { setJournalDate(e.target.value); setJournalPage(1); }} />
                                </div>
                            </div>
                        )}

                        {/* Mobile View Switcher Dropdown & Date */}
                        {isMobile && (
                            <div className="mobile-journal-filters-row" style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                <div style={{ flex: 1 }}>
                                    <select
                                        value={journalModule}
                                        onChange={(e) => { setJournalModule(e.target.value); setJournalPage(1); }}
                                        style={{ width: '100%', height: '40px', padding: '0 0.75rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.78rem' }}
                                    >
                                        {JOURNAL_MODULES.map(m => (
                                            <option key={m.id} value={m.id}>{m.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <input 
                                        type="date" 
                                        className="reports-date-input mobile-journal-date" 
                                        value={journalDate} 
                                        onChange={e => { setJournalDate(e.target.value); setJournalPage(1); }} 
                                        style={{ width: '100%', height: '40px', padding: '0 0.75rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.78rem' }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Desktop Search and Filters */}
                        {!isMobile && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    {journalModule === 'prepress' ? (
                                        <>
                                            <div style={{ background: 'white', padding: '0.65rem 1rem', borderRadius: '1rem', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', width: '280px' }}>
                                                <span>🔍</span>
                                                <input type="text" placeholder="Search email or name..." value={journalSearch} onChange={e => { setJournalSearch(e.target.value); setJournalPage(1); }} style={{ border: 'none', outline: 'none', fontSize: '0.8125rem', width: '100%', fontWeight: 600, color: '#1e293b' }} />
                                                {journalSearch && <button onClick={() => { setJournalSearch(''); setJournalPage(1); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>✕</button>}
                                            </div>
                                            <div
                                                className={`manual-pick-toggle ${showOnlyManualPicks ? 'active' : ''}`}
                                                onClick={() => { setShowOnlyManualPicks(!showOnlyManualPicks); setJournalPage(1); }}
                                                style={{ background: showOnlyManualPicks ? '#fef2f2' : 'white', padding: '0.75rem 1.25rem', borderRadius: '1rem', border: `1px solid ${showOnlyManualPicks ? '#ef4444' : '#e2e8f0'}`, display: 'inline-flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: showOnlyManualPicks ? '0 4px 6px -1px rgba(239,68,68,0.1)' : 'none' }}
                                            >
                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 0 4px rgba(239,68,68,0.1)' }} />
                                                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: showOnlyManualPicks ? '#ef4444' : '#64748b' }}>
                                                    {showOnlyManualPicks ? 'Showing Only Manual Picks' : 'Filter Manual Picks'}
                                                </span>
                                                <div style={{ background: showOnlyManualPicks ? '#ef4444' : '#f1f5f9', color: showOnlyManualPicks ? 'white' : '#64748b', padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 800 }}>
                                                    {manualPickCount}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ background: 'white', padding: '0.65rem 1rem', borderRadius: '1rem', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', width: '280px' }}>
                                            <span>🔍</span>
                                            <input type="text" placeholder="Search Job ID, customer, staff, or task..." value={prodJournalSearch} onChange={e => { setProdJournalSearch(e.target.value); setJournalPage(1); }} style={{ border: 'none', outline: 'none', fontSize: '0.8125rem', width: '100%', fontWeight: 600, color: '#1e293b' }} />
                                            {prodJournalSearch && <button onClick={() => { setProdJournalSearch(''); setJournalPage(1); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>✕</button>}
                                        </div>
                                    )}
                                </div>
                                
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
                                    {journalModule === 'prepress' ? (
                                        showOnlyManualPicks ? 'Showing manual "Find Job" interceptions' : `Showing all ${filteredJournal?.length || 0} job logs`
                                    ) : (
                                        `Showing all ${filteredProdJournal?.length || 0} completed tasks`
                                    )} for {safeFormatDate(journalDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                            </div>
                        )}

                        {/* Mobile Search and Filters */}
                        {isMobile && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div className="mobile-journal-search-row" style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                    {journalModule === 'prepress' ? (
                                        <>
                                            <div style={{ flex: 1.2, background: 'white', padding: '0 0.75rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '0.35rem', height: '40px' }}>
                                                <span>🔍</span>
                                                <input 
                                                    type="text" 
                                                    placeholder="Search email..." 
                                                    value={journalSearch} 
                                                    onChange={e => { setJournalSearch(e.target.value); setJournalPage(1); }} 
                                                    style={{ border: 'none', outline: 'none', fontSize: '0.78rem', width: '100%', fontWeight: 600, color: '#1e293b', background: 'transparent' }} 
                                                />
                                                {journalSearch && <button onClick={() => { setJournalSearch(''); setJournalPage(1); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>✕</button>}
                                            </div>
                                            <button
                                                onClick={() => { setShowOnlyManualPicks(!showOnlyManualPicks); setJournalPage(1); }}
                                                style={{ 
                                                    flex: 1, 
                                                    height: '40px',
                                                    background: showOnlyManualPicks ? '#fef2f2' : 'white', 
                                                    borderRadius: '0.75rem', 
                                                    border: `1px solid ${showOnlyManualPicks ? '#ef4444' : '#cbd5e1'}`, 
                                                    display: 'inline-flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center',
                                                    gap: '0.35rem', 
                                                    cursor: 'pointer',
                                                    padding: '0 0.5rem'
                                                }}
                                            >
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: showOnlyManualPicks ? '#ef4444' : '#64748b', whiteSpace: 'nowrap' }}>
                                                    {showOnlyManualPicks ? 'Only Manual' : 'Filter Manual'}
                                                </span>
                                                <span style={{ background: showOnlyManualPicks ? '#ef4444' : '#f1f5f9', color: showOnlyManualPicks ? 'white' : '#64748b', padding: '1px 5px', borderRadius: '10px', fontSize: '0.62rem', fontWeight: 800 }}>
                                                    {manualPickCount}
                                                </span>
                                            </button>
                                        </>
                                    ) : (
                                        <div style={{ flex: 1, background: 'white', padding: '0 0.75rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '0.35rem', height: '40px' }}>
                                            <span>🔍</span>
                                            <input 
                                                type="text" 
                                                placeholder="Search Job ID, customer, staff..." 
                                                value={prodJournalSearch} 
                                                onChange={e => { setProdJournalSearch(e.target.value); setJournalPage(1); }} 
                                                style={{ border: 'none', outline: 'none', fontSize: '0.78rem', width: '100%', fontWeight: 600, color: '#1e293b', background: 'transparent' }} 
                                            />
                                            {prodJournalSearch && <button onClick={() => { setProdJournalSearch(''); setJournalPage(1); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>✕</button>}
                                        </div>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 750, textAlign: 'right' }}>
                                    {journalModule === 'prepress' ? (
                                        showOnlyManualPicks ? 'Manual picks' : `All ${filteredJournal?.length || 0} job logs`
                                    ) : (
                                        `All ${filteredProdJournal?.length || 0} completed tasks`
                                    )} for {safeFormatDate(journalDate, { month: 'short', day: 'numeric' })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="journal-table-wrapper">
                        {journalModule === 'prepress' ? (
                            isJournalLoading ? (
                                <div style={{ padding: '5rem', textAlign: 'center' }}>
                                    <div className="dispatch-spinner" style={{ margin: '0 auto' }}></div>
                                    <p style={{ marginTop: '1rem', color: '#64748b', fontWeight: 600 }}>Compiling Prepress Journal...</p>
                                </div>
                            ) : (
                                <>
                                {!isMobile && (
                                    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '50vh' }}>
                                    <table className="journal-table">
                                        <thead>
                                            <tr>
                                                <th>Customer / Subject</th>
                                                <th>Timeline</th>
                                                <th>Efficiency Metrics</th>
                                                <th>Current Staff</th>
                                                <th>Handoff Log</th>
                                                <th>Details</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {!paginatedJournal || paginatedJournal.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} style={{ textAlign: 'center', padding: '5rem', color: '#94a3b8', fontWeight: 600 }}>
                                                        {showOnlyManualPicks ? 'No manual "Find Job" picks detected for this date.' : 'No activity recorded for this date.'}
                                                    </td>
                                                </tr>
                                            ) : paginatedJournal.map(job => (
                                                <tr key={job._id}>
                                                    <td>
                                                        <span className="email-cell">{job.customerEmail}</span>
                                                        <span className="subject-subtext">{job.subject || job.customerName}</span>
                                                    </td>
                                                    <td>
                                                        <div className="timeline-item">
                                                            <span className="timeline-time">{safeFormatTime(job.submittedAt)}</span>
                                                            <span className="timeline-label">Submitted</span>
                                                        </div>
                                                        {job.assignedAt && (
                                                            <div className="timeline-item" style={{ marginTop: '0.5rem' }}>
                                                                <span className="timeline-time">{safeFormatTime(job.assignedAt)}</span>
                                                                <span className="timeline-label">First Picked</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                            <div className="duration-group">
                                                                <span className="timeline-label">Queue Wait:</span>
                                                                <div className={`duration-badge ${job.metrics.queueDuration > 300 * 60 * 1000 ? 'urgent-highlight' : ''}`}>{formatDuration(job.metrics.queueDuration)}</div>
                                                            </div>
                                                            <div className="duration-group">
                                                                <span className="timeline-label">Work Time:</span>
                                                                <div className="duration-badge working">{formatDuration(job.metrics.workDuration)}</div>
                                                            </div>
                                                            {job.metrics.holdDuration > 0 && (
                                                                <div className="duration-group">
                                                                    <span className="timeline-label">Total Hold:</span>
                                                                    <div className="duration-badge hold">{formatDuration(job.metrics.holdDuration)}</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="member-cell">
                                                            <div className="member-avatar" style={{ width: '24px', height: '24px', fontSize: '0.7rem' }}>
                                                                {(job.staffName || 'Unassigned').charAt(0).toUpperCase()}
                                                            </div>
                                                            <span style={{ fontWeight: 700, color: '#475569' }}>{job.staffName || 'Unassigned'}</span>
                                                        </div>
                                                        <span className={`status-badge status-${(job.status || 'PENDING').toLowerCase()}`} style={{ fontSize: '0.6rem', marginTop: '0.25rem' }}>{job.status || 'PENDING'}</span>
                                                    </td>
                                                    <td>
                                                        <div className="handoff-chain">
                                                            {job.reassignments.length > 0 ? job.reassignments.map((move, idx) => {
                                                                const isPush         = move.reason.includes('[FORCED PUSH]')
                                                                const isInterruption = move.reason.includes('[INTERRUPTED]')
                                                                const isBatch        = move.batchMode
                                                                return (
                                                                    <div key={idx} className={`handoff-step ${isPush ? 'push-alert' : ''}`}>
                                                                        <div className="handoff-header">
                                                                            <span style={{ fontWeight: 800 }}>{move.from} → {move.to}{isBatch && <span className="batch-pill">BATCH</span>}</span>
                                                                            <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{safeFormatTime(move.timestamp)}</span>
                                                                        </div>
                                                                        <div className={`handoff-reason ${isPush ? 'urgent' : isInterruption ? 'interruption' : ''}`}>{move.reason}</div>
                                                                    </div>
                                                                )
                                                            }) : <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '0.75rem' }}>No reassignments</span>}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <button onClick={() => { setSelectedJournalJob(job); setDetailActiveTab('TIMELINE') }} className="view-log-btn">View Log</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    </div>
                                )}

                                {/* Prepress Mobile Card list */}
                                {isMobile && (
                                    <div className="mobile-prepress-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                                        {!paginatedJournal || paginatedJournal.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontWeight: 600 }}>
                                                {showOnlyManualPicks ? 'No manual "Find Job" picks detected for this date.' : 'No activity recorded for this date.'}
                                            </div>
                                        ) : paginatedJournal.map(job => (
                                            <div 
                                                key={job._id} 
                                                className="mobile-prepress-journal-card" 
                                                onClick={() => { setSelectedJournalJob(job); setDetailActiveTab('TIMELINE') }}
                                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '0.75rem', cursor: 'pointer' }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.85rem' }}>{job.subject || 'Walk-in'}</span>
                                                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{job.customerEmail}</span>
                                                    </div>
                                                    <span className={`status-badge status-${(job.status || 'PENDING').toLowerCase()}`} style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: '4px' }}>
                                                        {job.status || 'PENDING'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#475569' }}>
                                                    <div>
                                                        <strong style={{ color: '#64748b' }}>Staff:</strong> <span style={{ fontWeight: 700, color: '#0f172a' }}>{job.staffName || 'Unassigned'}</span>
                                                    </div>
                                                    <div>
                                                        <strong style={{ color: '#64748b' }}>Submitted:</strong> {safeFormatTime(job.submittedAt)}
                                                    </div>
                                                </div>
                                                {job.reassignments.length > 0 && (
                                                    <div style={{ marginTop: '0.4rem', fontSize: '0.65rem', background: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '0.375rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#475569' }}>
                                                        <span>🔄 Handoffs: <strong>{job.reassignments.length}</strong></span>
                                                        <span>Last: {safeFormatTime(job.reassignments[job.reassignments.length - 1].timestamp)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {totalJournalLogs > 0 && (
                                    <div className="workload-detail-footer journal-only">
                                        <div className="pagination-controls-hub">
                                            <div className="pagination-info">
                                                Page {safeJournalPage} of {totalJournalPages} • {totalJournalLogs} total
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button onClick={() => setJournalPage(p => Math.max(1, p - 1))} disabled={safeJournalPage <= 1} className="btn-page-luxury">← PREV</button>
                                                <button onClick={() => setJournalPage(p => Math.min(totalJournalPages, p + 1))} disabled={safeJournalPage >= totalJournalPages} className="btn-page-luxury">NEXT →</button>
                                            </div>
                                        </div>
                                        <div className="footer-density-controls">
                                            <div className="density-row">
                                                <span className="density-label">Rows per page:</span>
                                                <select className="density-select" value={journalRowsPerPage} onChange={(e) => { setJournalRowsPerPage(Number(e.target.value)); setJournalPage(1) }}>
                                                    <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                </>
                            )
                        ) : (
                            isProdJournalLoading ? (
                                <div style={{ padding: '5rem', textAlign: 'center' }}>
                                    <div className="dispatch-spinner" style={{ margin: '0 auto' }}></div>
                                    <p style={{ marginTop: '1rem', color: '#64748b', fontWeight: 600 }}>Compiling Production Journal...</p>
                                </div>
                            ) : (
                                <>
                                {!isMobile && (
                                    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '50vh' }}>
                                    <table className="journal-table">
                                        <thead>
                                            <tr>
                                                <th>Job ID</th>
                                                <th>Customer Name</th>
                                                <th>Task Description</th>
                                                <th style={{ textAlign: 'center' }}>Item No.</th>
                                                <th>Completed By</th>
                                                <th>Active Duration</th>
                                                <th>Time Period</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {!paginatedProdJournal || paginatedProdJournal.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} style={{ textAlign: 'center', padding: '5rem', color: '#94a3b8', fontWeight: 600 }}>
                                                        No production activity recorded for this date.
                                                    </td>
                                                </tr>
                                            ) : (
                                                paginatedProdJournal.map(entry => (
                                                    <tr key={entry._id}>
                                                        <td style={{ fontWeight: 800, color: '#0f172a' }}>#{entry.jobId}</td>
                                                        <td style={{ fontWeight: 700, color: '#475569' }}>{entry.customerName}</td>
                                                        <td>
                                                            <span style={{ fontWeight: 750, color: '#0f172a', textTransform: 'capitalize' }}>
                                                                {(entry.task || '').replace(/([A-Z])/g, ' $1').trim()}
                                                            </span>
                                                            <span style={{ display: 'block', fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 750, marginTop: '2px' }}>
                                                                Module: {(entry.module || '').replace('_', ' ')}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>
                                                                Item #{entry.itemIndex + 1}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="member-cell">
                                                                <div className="member-avatar" style={{ width: '24px', height: '24px', fontSize: '0.7rem' }}>
                                                                    {(entry.staffName || 'Unknown').charAt(0).toUpperCase()}
                                                                </div>
                                                                <span style={{ fontWeight: 700, color: '#475569' }}>{entry.staffName || 'Unknown'}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="duration-badge working">
                                                                {formatDuration(entry.durationMs)}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                                                                    <span style={{ fontWeight: 700, color: '#94a3b8' }}>Start:</span> {safeFormatTime(entry.startedAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                                </div>
                                                                <div style={{ fontSize: '0.72rem', color: '#0f172a', fontWeight: 700 }}>
                                                                    <span style={{ fontWeight: 700, color: '#94a3b8' }}>End:</span> {safeFormatTime(entry.completedAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                    </div>
                                )}

                                {/* Production Mobile Card list */}
                                {isMobile && (
                                    <div className="mobile-prod-journal-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                                        {!paginatedProdJournal || paginatedProdJournal.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontWeight: 600 }}>
                                                No production activity recorded for this date.
                                            </div>
                                        ) : paginatedProdJournal.map(entry => (
                                            <div 
                                                key={entry._id} 
                                                className="mobile-prod-journal-card" 
                                                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '0.75rem' }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <span style={{ fontWeight: 850, color: '#0f172a', fontSize: '0.85rem' }}>#{entry.jobId}</span>
                                                    <span style={{ fontSize: '0.65rem', background: '#ecfdf5', color: '#065f46', padding: '2px 6px', borderRadius: '4px', fontWeight: 750, textTransform: 'capitalize' }}>
                                                        {(entry.task || '').replace(/([A-Z])/g, ' $1').trim()}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.6rem' }}>
                                                    <div><strong style={{ color: '#64748b' }}>Customer:</strong> <span style={{ fontWeight: 700, color: '#0f172a' }}>{entry.customerName}</span></div>
                                                    <div><strong style={{ color: '#64748b' }}>Staff:</strong> <span style={{ fontWeight: 650 }}>{entry.staffName || 'Unknown'}</span></div>
                                                    <div><strong style={{ color: '#64748b' }}>Active Duration:</strong> <span style={{ color: '#059669', fontWeight: 700 }}>{formatDuration(entry.durationMs)}</span></div>
                                                    <div><strong style={{ color: '#64748b' }}>Item No:</strong> <span style={{ background: '#e2e8f0', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 750 }}>Item #{entry.itemIndex + 1}</span></div>
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: '#64748b', background: '#ffffff', padding: '0.35rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span><strong>Start:</strong> {safeFormatTime(entry.startedAt)}</span>
                                                    <span><strong>End:</strong> {safeFormatTime(entry.completedAt)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {totalProdJournalLogs > 0 && (
                                    <div className="workload-detail-footer journal-only">
                                        <div className="pagination-controls-hub">
                                            <div className="pagination-info">
                                                Page {safeProdJournalPage} of {totalProdJournalPages} • {totalProdJournalLogs} total
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button onClick={() => setJournalPage(p => Math.max(1, p - 1))} disabled={safeProdJournalPage <= 1} className="btn-page-luxury">← PREV</button>
                                                <button onClick={() => setJournalPage(p => Math.min(totalProdJournalPages, p + 1))} disabled={safeProdJournalPage >= totalProdJournalPages} className="btn-page-luxury">NEXT →</button>
                                            </div>
                                        </div>
                                        <div className="footer-density-controls">
                                            <div className="density-row">
                                                <span className="density-label">Rows per page:</span>
                                                <select className="density-select" value={journalRowsPerPage} onChange={(e) => { setJournalRowsPerPage(Number(e.target.value)); setJournalPage(1) }}>
                                                    <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                </>
                            )
                        )}
                    </div>
                </div>
            )}

            {/* ── Sliding Drawer ──────────────────────────────────────────── */}
            {selectedJournalJob && (
                <>
                    <div className="drawer-overlay active" onClick={() => setSelectedJournalJob(null)} />
                    <div className="details-drawer active">
                        <div className="drawer-header">
                            <div className="drawer-title-area">
                                <h3>Job Audit Details</h3>
                                <p className="drawer-subtitle">{selectedJournalJob.customerEmail}</p>
                            </div>
                            <button className="close-drawer-btn" onClick={() => setSelectedJournalJob(null)}>✕</button>
                        </div>
                        <div className="drawer-meta-section">
                            <div className="meta-card-grid">
                                <div className="meta-card"><span className="meta-card-label">Subject</span><span className="meta-card-value">{selectedJournalJob.subject || 'Walk-in'}</span></div>
                                <div className="meta-card"><span className="meta-card-label">Customer Name</span><span className="meta-card-value">{selectedJournalJob.customerName || 'N/A'}</span></div>
                                <div className="meta-card"><span className="meta-card-label">Current Status</span><span className={`status-badge status-${(selectedJournalJob.status || 'PENDING').toLowerCase()}`}>{selectedJournalJob.status || 'PENDING'}</span></div>
                                <div className="meta-card"><span className="meta-card-label">Current Staff</span><span className="meta-card-value">{selectedJournalJob.staffName || 'Unassigned'}</span></div>
                            </div>
                        </div>
                        <div className="drawer-tabs">
                            <button className={`drawer-tab-btn ${detailActiveTab === 'TIMELINE' ? 'active' : ''}`} onClick={() => setDetailActiveTab('TIMELINE')}>Event Timeline</button>
                            <button className={`drawer-tab-btn ${detailActiveTab === 'SEGMENTS' ? 'active' : ''}`} onClick={() => setDetailActiveTab('SEGMENTS')}>Timings & Segments</button>
                        </div>
                        <div className="drawer-content-area">
                            {detailActiveTab === 'TIMELINE' && (
                                <div className="timeline-container">
                                    {(!selectedJournalJob.eventTimeline || selectedJournalJob.eventTimeline.length === 0) ? (
                                        <div className="empty-drawer-state">No event history found for this job.</div>
                                    ) : (
                                        <div className="vertical-timeline">
                                            {selectedJournalJob.eventTimeline.map((evt, idx) => {
                                                return (
                                                    <div key={idx} className="vertical-timeline-item">
                                                        <div className={`timeline-node ${(evt.action || '').toLowerCase()}`}>
                                                            {evt.action === 'COMPLETED' ? '✓' : evt.action === 'PAUSED' ? '⏸' : evt.action === 'ASSIGNED' ? '👤' : evt.action === 'RESUMED' ? '▶' : '•'}
                                                        </div>
                                                        <div className="timeline-body">
                                                            <div className="timeline-header-line">
                                                                 <span className="timeline-action-badge">{evt.action}</span>
                                                                 <span className="timeline-date-time">
                                                                     {safeFormatTime(evt.timestamp, { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ({evt.timestamp ? new Date(evt.timestamp).toLocaleDateString() : '--'})
                                                                 </span>
                                                            </div>
                                                            <p className="timeline-desc">{evt.description}</p>
                                                            <span className="timeline-actor-by">By: <strong>{evt.actorName}</strong></span>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                            {detailActiveTab === 'SEGMENTS' && (
                                <div className="segments-container">
                                    <div className="metrics-summary-banner">
                                        <div className="metric-box queue"><span className="metric-val">{formatDuration(selectedJournalJob.metrics.queueDuration)}</span><span className="metric-lbl">Queue Wait</span></div>
                                        <div className="metric-box work"><span className="metric-val">{formatDuration(selectedJournalJob.metrics.workDuration)}</span><span className="metric-lbl">Active Work</span></div>
                                        <div className="metric-box hold"><span className="metric-val">{formatDuration(selectedJournalJob.metrics.holdDuration)}</span><span className="metric-lbl">Total Hold</span></div>
                                    </div>
                                    <h4 className="section-heading">Assignment Segment Logs</h4>
                                    {(!selectedJournalJob.segments || selectedJournalJob.segments.length === 0) ? (
                                        <div className="empty-drawer-state">No assignment duration logs found.</div>
                                    ) : (
                                        <div className="segments-list">
                                            {selectedJournalJob.segments.map((seg, idx) => {
                                                const isWork   = seg.type === 'WORK'
                                                const startStr = safeFormatTime(seg.startTime)
                                                const endStr   = seg.endTime ? safeFormatTime(seg.endTime) : 'Ongoing'
                                                return (
                                                    <div key={idx} className={`segment-card ${(seg.type || '').toLowerCase()} ${seg.isOngoing ? 'ongoing' : ''}`}>
                                                        <div className="segment-indicator" />
                                                        <div className="segment-card-body">
                                                            <div className="segment-card-header">
                                                                <span className="segment-type-label">{isWork ? '⚙ WORK SESSION' : '⏸ HOLD PERIOD'}</span>
                                                                <span className="segment-duration">{formatDuration(seg.durationMs)}</span>
                                                            </div>
                                                            <div className="segment-meta-row">
                                                                <span>Staff: <strong>{seg.staffName || 'Staff'}</strong></span>
                                                                <span>{startStr} – {endStr}</span>
                                                            </div>
                                                            {!isWork && seg.reason && <p className="segment-reason-text">Reason: "{seg.reason}"</p>}
                                                            {seg.isOngoing && <span className="ongoing-badge">Active Now</span>}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {selectedJob && (
                <WorkflowJobDetailsModal
                    job={selectedJob}
                    onClose={() => setSelectedJob(null)}
                    workflowLabel="Job Details"
                    workflowTask={null}
                />
            )}

            <style>{`
                @keyframes pulse {
                    0%   { transform: scale(1);   opacity: 1;   }
                    50%  { transform: scale(1.2); opacity: 0.7; }
                    100% { transform: scale(1);   opacity: 1;   }
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
