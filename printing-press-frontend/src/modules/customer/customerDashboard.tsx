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

                <div className="dispatch-table-container">
                    <table className="dispatch-table">
                        <thead>
                            <tr>
                                <th>Job ID</th>
                                <th>Order Date</th>
                                <th>Units</th>
                                <th>Packing Mode</th>
                                <th>Status</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                                        No orders found in this category.
                                    </td>
                                </tr>
                            ) : (
                                jobs.map(job => (
                                    <tr key={job.jobId}>
                                        <td>
                                            <span style={{ fontWeight: 800, color: '#0f172a' }}>#{job.jobId}</span>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                                                {new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontWeight: 800, color: '#0f172a' }}>{job.totalItems}</span>
                                        </td>
                                        <td>
                                            <span className="status-badge" style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>
                                                {job.packingMode || job.packingPreference || 'SINGLE'}
                                            </span>
                                        </td>
                                        <td>
                                            <StatusBadge status={job.jobStatus} />
                                        </td>
                                        <td className="text-right">
                                            <button
                                                onClick={() => navigate(`/customer/packing/${job.jobId}`)}
                                                className="btn-primary"
                                                style={{ padding: '0.375rem 1rem', fontSize: '0.75rem', width: 'auto' }}
                                            >
                                                {job.jobStatus === 'PACKED' || job.jobStatus === 'DISPATCHED' ? 'View Details' : 'Organize'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    )
}
