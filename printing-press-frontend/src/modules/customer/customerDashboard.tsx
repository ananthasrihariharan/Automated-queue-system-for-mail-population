import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import './CustomerDashboard.css'
import { useQuery } from '@tanstack/react-query'
import { fetchCustomerJobs } from '../../services/api'

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
    const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
    const navigate = useNavigate()
    const { logout } = useAuth()

    const { data: jobs = [], isLoading: loading } = useQuery<any[]>({
        queryKey: ['customer-jobs', viewMode],
        queryFn: () => fetchCustomerJobs(viewMode),
        refetchInterval: 5000,
    })

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

                    <div className="stats-header">
                        <div className="stats-card">
                            <span className="stats-card-label">Total Jobs</span>
                            <span className="stats-card-value text-blue-600">{stats.total}</span>
                        </div>
                        <div className="stats-card">
                            <span className="stats-card-label">Active</span>
                            <span className="stats-card-value text-orange-600">{stats.inProgress}</span>
                        </div>
                        <div className="stats-card">
                            <span className="stats-card-label">Collected</span>
                            <span className="stats-card-value text-emerald-600">{stats.completed}</span>
                        </div>
                    </div>
                </header>

                <div className="job-grid">
                    {jobs.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">
                                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0l-8 4-8-4m8 4v6"></path></svg>
                            </div>
                            <h3 className="empty-state-title">No orders found</h3>
                            <p className="empty-state-text">
                                {viewMode === 'active' ? 'Your active orders will appear here.' : 'Your order history is currently empty.'}
                            </p>
                        </div>
                    ) : (
                        jobs.map(job => (
                            <JobCard
                                key={job.jobId}
                                job={job}
                                onClick={() => navigate(`/customer/packing/${job.jobId}`)}
                            />
                        ))
                    )}
                </div>
            </main>
        </div>
    )
}
