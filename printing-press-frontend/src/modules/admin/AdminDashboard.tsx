import { useState } from 'react'
import { api } from '../../services/api'
import EmployeeManager from './EmployeeManager'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import ModuleNavigation from '../../components/ModuleNavigation'
import './AdminDashboard.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdminJobs } from '../../services/api'

type Job = {
  jobId: string
  customerName: string
  paymentStatus: string
  jobStatus: string
  adminApprovalNote?: string
  createdBy?: { name: string }
  paymentHandledBy?: { name: string }
  dispatchedBy?: { name: string }
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [activeTab, setActiveTab] = useState<'jobs' | 'employees'>('jobs')
  const [note, setNote] = useState<Record<string, string>>({})

  // Filtering & Pagination State
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CREATED' | 'PACKED' | 'DISPATCHED'>('ALL')
  const [hideDispatched, setHideDispatched] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const { data: jobs = [], isLoading: loading } = useQuery<Job[]>({
    queryKey: ['admin-jobs'],
    queryFn: fetchAdminJobs,
    refetchInterval: 5000,
    enabled: activeTab === 'jobs',
  })

  const queryClient = useQueryClient()

  const approve = async (jobId: string) => {
    await api.patch(`/api/admin/jobs/${jobId}/approve-dispatch`, {
      note: note[jobId]
    })
    queryClient.invalidateQueries({ queryKey: ['admin-jobs'] })
  }

  // Derived Data: Filtering & Sorting
  const filteredJobs = jobs
    .filter(job => {
      const matchesSearch =
        job.jobId.toLowerCase().includes(search.toLowerCase()) ||
        job.customerName.toLowerCase().includes(search.toLowerCase())
      const matchesPayment = paymentFilter === 'ALL' || job.paymentStatus === paymentFilter || (paymentFilter === 'PAID' && job.paymentStatus === 'ADMIN_APPROVED')
      const matchesStatus = statusFilter === 'ALL' || job.jobStatus === statusFilter
      const isNotDispatched = !hideDispatched || job.jobStatus !== 'DISPATCHED'
      return matchesSearch && matchesPayment && matchesStatus && isNotDispatched
    })
    .sort((a, b) => a.jobId.localeCompare(b.jobId)) // Ascending Sort by Job ID

  // Pagination Logic
  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage)
  const paginatedJobs = filteredJobs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  return (
    <div className="admin-page">
      <div className="admin-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1 style={{ fontWeight: 900, fontSize: '1.5rem', textTransform: 'uppercase', letterSpacing: '-0.05em' }}>Admin</h1>
          <div className="dashboard-tabs" style={{ marginBottom: 0 }}>
            <button
              onClick={() => setActiveTab('jobs')}
              className={`dashboard-tab ${activeTab === 'jobs' ? 'active' : ''}`}
            >
              Jobs
            </button>
            <div style={{ width: '2px', height: '1.5rem', background: '#e5e7eb' }}></div>
            <button
              onClick={() => setActiveTab('employees')}
              className={`dashboard-tab ${activeTab === 'employees' ? 'active' : ''}`}
            >
              Employees
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <ModuleNavigation />
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="logout-btn"
          >
            Logout
          </button>
        </div>
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'jobs' && (
        <>
          {/* Premium Filter Bar */}
          <div className="admin-filters-bar">
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

              <div className="dropdown-wrapper">
                <select
                  className="filter-select"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
                >
                  <option value="ALL">Status: All</option>
                  <option value="PENDING">Pending</option>
                  <option value="CREATED">Created</option>
                  <option value="PACKED">Packed</option>
                  <option value="DISPATCHED">Dispatched</option>
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

          {loading ? (
            <div className="dispatch-loading">
              <div className="dispatch-spinner"></div>
            </div>
          ) : (
            <>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Customer</th>
                    <th>Submitted By</th>
                    <th>Payment By</th>
                    <th>Dispatched By</th>
                    <th>Payment</th>
                    <th>Admin Note</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedJobs.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                        No jobs found matching the filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedJobs.map((job) => (
                      <tr key={job.jobId} className="admin-row">
                        <td>{job.jobId}</td>
                        <td>{job.customerName}</td>
                        <td style={{ fontSize: '0.8rem', color: '#4b5563' }}>{job.createdBy?.name || '—'}</td>
                        <td style={{ fontSize: '0.8rem', color: '#4b5563' }}>{job.paymentHandledBy?.name || '—'}</td>
                        <td style={{ fontSize: '0.8rem', color: '#4b5563' }}>{job.dispatchedBy?.name || '—'}</td>
                        <td>
                          <span className={`status-badge ${(job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED') ? 'status-paid' : 'status-unpaid'}`}>
                            {job.paymentStatus}
                          </span>
                        </td>

                        <td>
                          {job.paymentStatus === 'UNPAID' ? (
                            <input
                              className="form-input"
                              style={{ width: '100%' }}
                              placeholder="Approval note"
                              onChange={(e) =>
                                setNote({
                                  ...note,
                                  [job.jobId]: e.target.value
                                })
                              }
                            />
                          ) : (
                            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                              {job.adminApprovalNote || '—'}
                            </span>
                          )}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          {job.paymentStatus === 'UNPAID' ? (
                            <button
                              className="btn-primary"
                              onClick={() => approve(job.jobId)}
                            >
                              Approve Dispatch
                            </button>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="pagination-container" style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button
                    className="btn-secondary"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
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
                    onClick={() => setCurrentPage(prev => prev + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'employees' && <EmployeeManager />}
    </div>
  )
}
