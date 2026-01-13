import { useState } from 'react'
import { api } from '../../services/api'
import UserMenu from '../../components/UserMenu'
import EmployeeManager from './EmployeeManager'
import CustomerManager from './CustomerManager'
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
  defaultDeliveryType?: string
}

import DateFilter from '../../components/DateFilter'

// ... imports
import Pagination from '../../components/Pagination'

export default function AdminDashboard() {

  const [activeTab, setActiveTab] = useState<'jobs' | 'employees' | 'customers'>('jobs')

  // Filtering & Pagination State
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CREATED' | 'PACKED' | 'DISPATCHED'>('ALL')
  const [hideDispatched, setHideDispatched] = useState(false)
  const [dateFilter, setDateFilter] = useState('') // Default: Show All (Fresh Daily from Backend)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const { data: jobs = [], isLoading: loading } = useQuery<Job[]>({
    queryKey: ['admin-jobs', dateFilter],
    queryFn: () => fetchAdminJobs(dateFilter),
    refetchInterval: 5000,
    enabled: activeTab === 'jobs',
  })

  // State for inline approval notes
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({})

  const queryClient = useQueryClient()

  const approve = async (jobId: string) => {
    const note = approvalNotes[jobId] || "Approved by Admin"

    try {
      await api.patch(`/api/admin/jobs/${jobId}/approve-dispatch`, { note })
      queryClient.invalidateQueries({ queryKey: ['admin-jobs'] })
      // Clear note after success
      setApprovalNotes(prev => {
        const next = { ...prev }
        delete next[jobId]
        return next
      })
    } catch (err) {
      alert("Failed to approve job")
    }
  }

  // Derived Data: Filtering & Sorting
  const filteredJobs = (jobs || [])
    .filter((job: Job) => {
      const matchesSearch =
        job.jobId.toLowerCase().includes(search.toLowerCase()) ||
        job.customerName.toLowerCase().includes(search.toLowerCase())
      const matchesPayment = paymentFilter === 'ALL' || job.paymentStatus === paymentFilter || (paymentFilter === 'PAID' && job.paymentStatus === 'ADMIN_APPROVED')
      const matchesStatus = statusFilter === 'ALL' || job.jobStatus === statusFilter
      const isNotDispatched = !hideDispatched || job.jobStatus !== 'DISPATCHED'

      // Client-side date filtering is REMOVED because backend handles it now.
      // If dateFilter is present, backend returns only matching range.
      // If dateFilter is empty, backend returns Fresh Daily backlog.

      return matchesSearch && matchesPayment && matchesStatus && isNotDispatched
    })
    .sort((a: Job, b: Job) => a.jobId.localeCompare(b.jobId)) // Ascending Sort by Job ID

  // Pagination Logic
  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage)
  const paginatedJobs = filteredJobs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  return (
    <div className="admin-page">
      <div className="admin-navbar">
        <div className="admin-navbar-left">
          <h1 className="admin-title">Admin</h1>
          <div className="dashboard-tabs">
            <button
              onClick={() => setActiveTab('jobs')}
              className={`dashboard-tab ${activeTab === 'jobs' ? 'active' : ''}`}
              title="Jobs"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
              <span className="tab-label">Jobs</span>
            </button>

            <button
              onClick={() => setActiveTab('employees')}
              className={`dashboard-tab ${activeTab === 'employees' ? 'active' : ''}`}
              title="Employees"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              <span className="tab-label">Team</span>
            </button>

            <button
              onClick={() => setActiveTab('customers')}
              className={`dashboard-tab ${activeTab === 'customers' ? 'active' : ''}`}
              title="Customers"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              <span className="tab-label">Customers</span>
            </button>
          </div>
        </div>

        <div className="admin-navbar-right">
          <ModuleNavigation />
          <UserMenu />
        </div>
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'jobs' && (
        <>
          {/* Premium Filter Bar */}
          <div className="admin-filters-bar">
            {/* ... filters ... */}
            <div className="filter-group">
              <DateFilter value={dateFilter} onChange={(d) => { setDateFilter(d); setCurrentPage(1); }} />
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
              <div className="dispatch-table-container">
                <table className="dispatch-table">
                  <thead>
                    <tr>
                      <th>Job ID</th>
                      <th>Customer</th>
                      <th>Submitted By</th>
                      <th>Payment Status</th>
                      <th>Dispatched By</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedJobs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                          No jobs found matching the filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedJobs.map((job) => (
                        <tr key={job.jobId} className="dispatch-row">
                          <td>
                            <span style={{ fontWeight: 800 }}>#{job.jobId}</span>
                            {job.defaultDeliveryType === 'WALK_IN' && (
                              <span style={{ display: 'block', fontSize: '0.625rem', padding: '0.125rem 0.375rem', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', fontWeight: 700, width: 'fit-content', marginTop: '0.25rem' }}>
                                WALK-IN
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 600, color: (job as any).customerId?.isCreditCustomer ? '#047857' : 'inherit' }}>
                                {job.customerName}
                              </span>
                              {(job as any).customerId?.isCreditCustomer && (
                                <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', background: '#d1fae5', color: '#047857', borderRadius: '4px', fontWeight: 700 }}>
                                  CREDIT
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                              {job.createdBy?.name || '—'}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${(job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED') ? 'status-paid' : 'status-unpaid'}`}>
                              {job.paymentStatus}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                              {job.dispatchedBy?.name || '—'}
                            </span>
                          </td>
                          <td className="text-right">
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                              {job.paymentStatus === 'UNPAID' ? (
                                <>
                                  <input
                                    type="text"
                                    placeholder="Optional Note"
                                    className="form-input"
                                    style={{ fontSize: '0.75rem', padding: '0.25rem', width: '150px', height: '28px' }}
                                    value={approvalNotes[job.jobId] || ''}
                                    onChange={(e) => setApprovalNotes(prev => ({ ...prev, [job.jobId]: e.target.value }))}
                                  />
                                  <button
                                    className="btn-primary"
                                    onClick={() => approve(job.jobId)}
                                    style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', width: 'auto' }}
                                  >
                                    Approve Payment
                                  </button>
                                </>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>COMPLETED</span>
                                  {job.adminApprovalNote && (
                                    <span style={{ fontSize: '0.65rem', color: '#6b7280', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={job.adminApprovalNote}>
                                      "{job.adminApprovalNote}"
                                    </span>
                                  )}
                                </div>
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
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </>
      )}

      {activeTab === 'employees' && <EmployeeManager />}
      {activeTab === 'customers' && <CustomerManager />}
    </div>
  )
}
