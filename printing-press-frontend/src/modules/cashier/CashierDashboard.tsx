import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { endpoints } from '../../services/endpoints'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import './CashierDashboard.css'

type Job = {
  jobId: string
  customerName: string
  paymentStatus: 'UNPAID' | 'PAID'
}

export default function CashierDashboard() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const { logout } = useAuth()
  const navigate = useNavigate()

  const loadJobs = async () => {
    try {
      const res = await api.get(endpoints.cashierJobs)
      setJobs(res.data)
    } finally {
      setLoading(false)
    }
  }

  const markPaid = async (jobId: string) => {
    if (!window.confirm(`Mark Job #${jobId} as PAID?`)) return
    try {
      await api.patch(endpoints.markPaid(jobId))
      loadJobs()
    } catch (err) {
      alert('Failed to update payment status')
    }
  }

  useEffect(() => {
    loadJobs()
  }, [])

  if (loading) {
    return (
      <div className="dispatch-loading">
        <div className="dispatch-spinner"></div>
      </div>
    )
  }

  return (
    <div className="cashier-page">
      <div className="cashier-container">
        <nav className="cashier-navbar">
          <div className="cashier-logo">
            <div className="cashier-logo-icon">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="cashier-title">Cashier</h1>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="btn-outline"
          >
            Logout
          </button>
        </nav>

        <main>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Pending Payments</h2>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Collect payments and authorize jobs for dispatch.</p>
          </div>

          <table className="cashier-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Customer Name</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-state">
                    No pending payments found
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.jobId} className="cashier-row">
                    <td style={{ fontWeight: 700 }}>#{job.jobId}</td>
                    <td>{job.customerName}</td>
                    <td>
                      <span className={`status-badge ${job.paymentStatus === 'PAID' ? 'status-paid' : 'status-unpaid'}`}>
                        {job.paymentStatus}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {job.paymentStatus === 'UNPAID' ? (
                        <button
                          onClick={() => markPaid(job.jobId)}
                          className="btn-primary"
                        >
                          Collect Payment
                        </button>
                      ) : (
                        <span style={{ color: '#10b981', fontWeight: 700 }}>✓ COMPLETED</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </main>
      </div>
    </div>
  )
}
