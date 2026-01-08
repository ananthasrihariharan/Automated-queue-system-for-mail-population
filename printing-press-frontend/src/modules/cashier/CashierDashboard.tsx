import { useState } from 'react'
import { api } from '../../services/api'
import { endpoints } from '../../services/endpoints'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import ModuleNavigation from '../../components/ModuleNavigation'
import './CashierDashboard.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCashierJobs } from '../../services/api'

type Job = {
  jobId: string
  customerName: string
  paymentStatus: 'UNPAID' | 'PAID'
  jobStatus?: string
}

export default function CashierDashboard() {
  const queryClient = useQueryClient()
  const { data: jobs = [], isLoading: loading } = useQuery<Job[]>({
    queryKey: ['cashier-jobs'],
    queryFn: fetchCashierJobs,
    refetchInterval: 5000,
  })

  const { logout } = useAuth()
  const navigate = useNavigate()

  // Filtering & Pagination State
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL')
  const [hideDispatched, setHideDispatched] = useState(true) // Default to true for Cashier
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25

  const markPaid = async (jobId: string) => {
    if (!window.confirm(`Mark Job #${jobId} as PAID?`)) return
    try {
      await api.patch(endpoints.markPaid(jobId))
      queryClient.invalidateQueries({ queryKey: ['cashier-jobs'] })
    } catch (err) {
      alert('Failed to update payment status')
    }
  }

  // Derived Data: Filtering & Sorting
  const filteredJobs = jobs
    .filter(job => {
      const matchesSearch =
        job.jobId.toLowerCase().includes(search.toLowerCase()) ||
        job.customerName.toLowerCase().includes(search.toLowerCase())
      const matchesPayment = paymentFilter === 'ALL' || job.paymentStatus === paymentFilter
      const isNotDispatched = !hideDispatched || job.jobStatus !== 'DISPATCHED'
      return matchesSearch && matchesPayment && isNotDispatched
    })
    .sort((a, b) => a.jobId.localeCompare(b.jobId)) // Ascending Sort by Job ID

  // Pagination Logic
  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage)
  const paginatedJobs = filteredJobs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

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
            <h1 className="cashier-title">Cashier</h1>
          </div>

          <div className="flex items-center">
            <ModuleNavigation />
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="logout-btn ml-2"
            >
              Logout
            </button>
          </div>
        </nav>

        <main>
          {/* Premium Filter Bar */}
          <div className="cashier-filters-bar">
            <div className="filter-group">
              <div className="search-wrapper">
                <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search Job ID or Customer..."
                  className="filter-input search"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                />
              </div>

              <div className="dropdown-wrapper">
                <select
                  className="filter-select"
                  value={paymentFilter}
                  onChange={(e) => { setPaymentFilter(e.target.value as any); setCurrentPage(1); }}
                >
                  <option value="ALL">Payment: All</option>
                  <option value="UNPAID">Unpaid Only</option>
                  <option value="PAID">Paid Only</option>
                </select>
              </div>

              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={hideDispatched}
                  onChange={(e) => { setHideDispatched(e.target.checked); setCurrentPage(1); }}
                />
                <span className="toggle-text">Active Only</span>
              </label>
            </div>
          </div>

          <div className="dispatch-table-container">
            <table className="dispatch-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Customer</th>
                  <th className="hide-mobile">Created At</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      No jobs found matching the filters
                    </td>
                  </tr>
                ) : (
                  paginatedJobs.map((job: any) => ( // Changed from 'jobs' to 'paginatedJobs'
                    <tr key={job.jobId} className="dispatch-row"> {/* Changed from job._id to job.jobId */}
                      <td>
                        <span style={{ fontWeight: 800 }}>#{job.jobId}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{job.customerName}</span>
                      </td>
                      <td className="hide-mobile">
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                          {new Date(job.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${job.paymentStatus === 'PAID' ? 'status-paid' : 'status-unpaid'}`}>
                          {job.paymentStatus}
                        </span>
                      </td>
                      <td className="text-right">
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          {job.paymentStatus === 'UNPAID' ? (
                            <button
                              onClick={() => markPaid(job.jobId)}
                              className="btn-primary"
                              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', width: 'auto' }}
                            >
                              Mark Paid
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>COMPLETED</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="pagination-container" style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button
                className="btn-secondary"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev: number) => prev - 1)}
              >
                Previous
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  className={`btn-secondary ${currentPage === i + 1 ? 'active' : ''}`}
                  style={{ minWidth: '2.5rem', background: currentPage === i + 1 ? '#000' : '', color: currentPage === i + 1 ? '#fff' : '' }}
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                className="btn-secondary"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((prev: number) => prev + 1)}
              >
                Next
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
