import { useState } from 'react'
import { api } from '../../services/api'
import { endpoints } from '../../services/endpoints'
import UserMenu from '../../components/UserMenu'
import ModuleNavigation from '../../components/ModuleNavigation'
import './CashierDashboard.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCashierJobs } from '../../services/api'

import DateFilter from '../../components/DateFilter'
import Pagination from '../../components/Pagination'

// ... existing imports

export default function CashierDashboard() {
  const queryClient = useQueryClient()

  // Filtering & Pagination State - MOVE BEFORE useQuery to avoid hoisting error
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL')
  const [hideDispatched, setHideDispatched] = useState(true)
  const [dateFilter, setDateFilter] = useState('')

  const { data: responseData, isLoading: loading } = useQuery({
    queryKey: ['cashier-jobs', currentPage],
    queryFn: () => fetchCashierJobs(currentPage, itemsPerPage),
    refetchInterval: 10000,
    staleTime: 30000,
    placeholderData: (previousData: any) => previousData,
  })

  // Handle both legacy (array) and new (object) API responses
  const jobs = Array.isArray(responseData) ? responseData : (responseData?.jobs || [])
  const totalPages = responseData?.pages || 1

  const markPaid = async (jobId: string) => {
    if (!window.confirm(`Mark Job #${jobId} as PAID?`)) return
    try {
      await api.patch(endpoints.markPaid(jobId))
      queryClient.invalidateQueries({ queryKey: ['cashier-jobs'] })
    } catch (err) {
      alert('Failed to update payment status')
    }
  }

  // Derived Data: Filtering & Sorting (Still useful for refined searching within the 30-day window)
  const filteredJobs = jobs
    .filter((job: any) => {
      const matchesSearch =
        job.jobId.toLowerCase().includes(search.toLowerCase()) ||
        job.customerName.toLowerCase().includes(search.toLowerCase())
      const matchesPayment = paymentFilter === 'ALL' || job.paymentStatus === paymentFilter
      const isNotDispatched = !hideDispatched || job.jobStatus !== 'DISPATCHED'

      const jobDate = (job as any).createdAt ? new Date((job as any).createdAt).toISOString().split('T')[0] : ''
      const matchesDate = !dateFilter || jobDate === dateFilter

      return matchesSearch && matchesPayment && isNotDispatched && matchesDate
    })
    .sort((a: any, b: any) => a.jobId.localeCompare(b.jobId, undefined, { numeric: true, sensitivity: 'base' })) // Natural Numeric Sort

  // Paginated jobs are now the entire 'jobs' from the server, but we keep filteredJobs for the search UI
  const displayJobs = filteredJobs

  if (loading) {
    // ... loading state
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
          <div className="cashier-navbar-left">
            <h1 className="cashier-title">Cashier</h1>
          </div>

          <div className="cashier-navbar-right">
            <ModuleNavigation />
            <UserMenu />
          </div>
        </nav>

        <main>
          {/* Premium Filter Bar */}
          <div className="cashier-filters-bar">
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

              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={hideDispatched}
                  onChange={(e) => { setHideDispatched(e.target.checked); setCurrentPage(1); }}
                  style={{ display: 'none' }}
                />
                <div className="toggle-switch"></div>
                <span className="toggle-text">Active Only</span>
              </label>
            </div>
          </div>

          <div className="dispatch-table-container">
            <table className="dispatch-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Job ID</th>
                  <th>Customer</th>
                  <th className="hide-mobile">Created At</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {displayJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      No jobs found matching the filters
                    </td>
                  </tr>
                ) : (
                  displayJobs.map((job: any, index: number) => (
                    <tr key={job.jobId} className="dispatch-row">
                      <td style={{ fontWeight: 600, color: '#64748b' }}>
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      <td>
                        <span style={{ fontWeight: 800 }}>#{job.jobId}</span>
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
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </main>
      </div>
    </div>
  )
}
