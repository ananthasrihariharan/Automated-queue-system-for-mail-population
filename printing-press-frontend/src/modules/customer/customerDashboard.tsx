import { useEffect, useState, useMemo } from 'react'
import { api } from '../../services/api'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import './CustomerDashboard.css'

function StatusBadge({ status }: { status: string }) {
    const normalizedStatus = status === 'CREATED' ? 'PENDING' : status
    const statusClass = normalizedStatus === 'PENDING' ? 'status-pending' :
        normalizedStatus === 'PACKED' ? 'status-packed' :
            normalizedStatus === 'DISPATCHED' ? 'status-dispatched' : ''

    return (
        <span className={`status-badge ${statusClass}`}>
            {normalizedStatus}
        </span>
    )
}

function JobCard({ job, onClick }: { job: any; onClick: () => void }) {
    const isOut = job.jobStatus === 'DISPATCHED'
    const progress = job.jobStatus === 'DISPATCHED' ? 100 : job.jobStatus === 'PACKED' ? 66 : 33
    const mode = job.packingMode || job.packingPreference || 'SINGLE'

    return (
        <div className="job-card" onClick={onClick}>
            <div className="job-card-header">
                <div>
                    <div className="job-card-id">#{job.jobId}</div>
                    <div className="job-card-date">
                        {new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                </div>
                <StatusBadge status={job.jobStatus} />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <div>
                    <span className="stats-card-label">Items</span>
                    <span style={{ fontWeight: 700 }}>{job.totalItems}</span>
                </div>
                <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                <div>
                    <span className="stats-card-label">Mode</span>
                    <span style={{ fontWeight: 700 }}>{mode}</span>
                </div>
            </div>

            <div className="progress-container">
                <div className="progress-label">
                    <span>Timeline</span>
                    <span>{progress}%</span>
                </div>
                <div className="progress-track">
                    <div
                        className={`progress-bar ${isOut ? 'completed' : ''}`}
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            </div>

            {job.jobStatus === 'PACKED' && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#eff6ff', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 700, color: '#1e40af', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Ready for collection!</span>
                    {job.rackLocation && <span>Rack: {job.rackLocation}</span>}
                </div>
            )}
        </div>
    )
}

export default function CustomerDashboard() {
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
    const navigate = useNavigate()
    const { logout } = useAuth()

    useEffect(() => {
        loadJobs()
    }, [viewMode])

    const loadJobs = async () => {
        try {
            const res = await api.get(`/api/customer/jobs?status=${viewMode}`)
            setJobs(res.data)
        } catch (err) {
            console.error('Failed to load items')
        } finally {
            setLoading(false)
        }
    }

    const stats = useMemo(() => {
        const total = jobs.length
        const inProgress = jobs.filter(j => j.jobStatus !== 'DISPATCHED').length
        const completed = jobs.filter(j => j.jobStatus === 'DISPATCHED').length
        return { total, inProgress, completed }
    }, [jobs])

    if (loading) return (
        <div className="dispatch-loading">
            <div className="dispatch-spinner"></div>
        </div>
    )

    return (
        <div className="customer-page">
            <nav className="customer-nav">
                <div className="customer-logo">
                    <div className="customer-logo-icon">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.05em', lineHeight: 1 }}>Collect</h1>
                        <span style={{ fontSize: '0.625rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Private Access</span>
                    </div>
                </div>
                <button
                    onClick={() => { logout(); navigate('/login'); }}
                    className="logout-btn"
                >
                    Logout
                </button>
            </nav>

            <main className="customer-main">
                <header className="dashboard-header">
                    <div className="dashboard-tabs">
                        <button
                            onClick={() => setViewMode('active')}
                            className={`dashboard-tab ${viewMode === 'active' ? 'active' : ''}`}
                        >
                            Active Orders
                        </button>
                        <div style={{ width: '2px', height: '1.5rem', background: '#e5e7eb' }}></div>
                        <button
                            onClick={() => setViewMode('history')}
                            className={`dashboard-tab ${viewMode === 'history' ? 'active' : ''}`}
                        >
                            History
                        </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                        <p className="dashboard-description">
                            {viewMode === 'active'
                                ? 'Track your printing shipments, manage parcel groups, and access the collection rack instantly.'
                                : 'View your completed orders and past shipments.'}
                        </p>
                        <div className="stats-container">
                            <div className="stats-card">
                                <span className="stats-card-label">Active</span>
                                <span className="stats-card-value">{stats.inProgress}</span>
                            </div>
                            <div className="stats-card dark">
                                <span className="stats-card-label">Total</span>
                                <span className="stats-card-value">{stats.total}</span>
                            </div>
                        </div>
                    </div>
                </header>

                <div>
                    {jobs.length === 0 ? (
                        <div className="empty-state">
                            No orders found
                        </div>
                    ) : (
                        <div className="jobs-grid">
                            {jobs.map(job => (
                                <JobCard
                                    key={job.jobId}
                                    job={job}
                                    onClick={() => navigate(`/customer/${job.jobId}`)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
