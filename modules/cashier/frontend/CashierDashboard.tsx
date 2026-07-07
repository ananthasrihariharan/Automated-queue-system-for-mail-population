import { useState, useEffect } from 'react'
import { api } from '@core/services/api'
import { endpoints } from '@core/services/endpoints'
import UserMenu from '@core/components/UserMenu'
import ModuleNavigation from '@core/components/ModuleNavigation'
import './CashierDashboard.css'
import './CashierDashboardMobile.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCashierJobs } from '@core/services/api'

import DateFilter from '@core/components/DateFilter'

// ... existing imports

export default function CashierDashboard() {
  const queryClient = useQueryClient()

  // Filtering & Pagination State - MOVE BEFORE useQuery to avoid hoisting error
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL')
  const [hideDispatched, setHideDispatched] = useState(true)
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [zoomJob, setZoomJob] = useState<any | null>(null)

  const { data: responseData, isLoading: loading } = useQuery({
    queryKey: ['cashier-jobs', currentPage, search, paymentFilter, hideDispatched, dateFilter, rowsPerPage],
    queryFn: () => fetchCashierJobs(currentPage, rowsPerPage, search, paymentFilter, hideDispatched, dateFilter),
    refetchInterval: 10000,
    staleTime: 30000,
    placeholderData: (previousData: any) => previousData,
  })

  useEffect(() => {
    setCurrentPage(1)
  }, [search, paymentFilter, hideDispatched, dateFilter, rowsPerPage])

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

  // The server now handles filtering and pagination
  const displayJobs = jobs

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
        {/* Mobile Topbar (hidden on desktop) */}
        <div className="mobile-header-row">
          <span className="mobile-header-title">Cashier</span>
          
          {/* Inline Search Bar */}
          <div className="mobile-header-search">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="mobile-header-search-input"
              placeholder="Search..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>

          {/* Action Buttons */}
          <div className="mobile-header-actions">
            <ModuleNavigation />
            <button
              type="button"
              className="mobile-header-btn"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              title="Filters"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Desktop Navbar (hidden on mobile) */}
        <nav className="cashier-navbar desktop-navbar-only">
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
          <div className={`cashier-filters-bar ${showMobileFilters ? 'mobile-visible' : ''}`}>
            <div className="filter-group">
              <DateFilter value={dateFilter} onChange={(d) => { setDateFilter(d); setCurrentPage(1); }} />
              
              {/* Desktop Search Bar (hidden on mobile) */}
              <div className="search-wrapper desktop-search-only">
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
                        {(currentPage - 1) * rowsPerPage + index + 1}
                      </td>
                      <td>
                        <span style={{ fontWeight: 800 }}>{job.jobId}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600, color: job.isCreditCustomer ? '#047857' : 'inherit' }}>
                            {job.customerName}
                          </span>
                          {job.isCreditCustomer && (
                            <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', background: '#d1fae5', color: '#047857', borderRadius: '4px', fontWeight: 700 }}>
                              CREDIT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hide-mobile">
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                          {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : ''}
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

          {/* Mobile Card List (Visible only on mobile via CSS) */}
          <div className="cashier-mobile-cards">
            {displayJobs.length === 0 ? (
              <div className="empty-state" style={{ background: 'white', padding: '2rem', borderRadius: '1rem', textAlign: 'center', color: '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                No jobs found matching the filters
              </div>
            ) : (
              displayJobs.map((job: any, index: number) => {
                const sNo = (currentPage - 1) * rowsPerPage + index + 1;
                const isPaid = job.paymentStatus === 'PAID';
                return (
                  <div
                    key={job.jobId}
                    className={`cashier-job-card ${isPaid ? 'paid-card' : 'unpaid-card'}`}
                    onClick={() => setZoomJob(job)}
                  >
                    <div className="card-left-section">
                      <span className="card-sno">{sNo}.</span>
                      <span className="card-job-id">{job.jobId}</span>
                      <div className="card-customer-info">
                        <span className="card-customer-name">
                          {job.customerName}
                        </span>
                        {job.isCreditCustomer && (
                          <span className="card-credit-badge">CREDIT</span>
                        )}
                      </div>
                    </div>
                    <div className="card-right-section">
                      {isPaid ? (
                        <span className="card-paid-label">PAID</span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markPaid(job.jobId);
                          }}
                          className="card-pay-btn"
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination / Controls Footer */}
          <div className="admin-queue-footer" style={{ marginTop: '1.5rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1' }}>
            <div className="pagination-controls-hub">
              <div className="pagination-info">
                Page {currentPage} of {totalPages || 1} • {responseData?.total || 0} total
              </div>
              <div className="pagination-buttons">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="btn-page-luxury"
                >
                  ← PREV
                </button>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages || 1, p + 1))
                  }
                  disabled={currentPage >= (totalPages || 1)}
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
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Zoom Details Modal Overlay */}
      {zoomJob && (
        <div className="cashier-zoom-modal-overlay" onClick={() => setZoomJob(null)}>
          <div className="cashier-zoom-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="zoom-modal-header">
              <h3>Job Details</h3>
              <button className="zoom-close-btn" onClick={() => setZoomJob(null)}>×</button>
            </div>
            <div className="zoom-modal-body">
              <div className="zoom-detail-item">
                <span className="zoom-detail-label">Job ID</span>
                <span className="zoom-detail-value font-bold">{zoomJob.jobId}</span>
              </div>
              <div className="zoom-detail-item">
                <span className="zoom-detail-label">Customer Name</span>
                <span className="zoom-detail-value zoom-customer-name">{zoomJob.customerName}</span>
              </div>
              {zoomJob.isCreditCustomer && (
                <div className="zoom-detail-item">
                  <span className="zoom-detail-label">Account Type</span>
                  <span className="card-credit-badge" style={{ display: 'inline-block', width: 'fit-content' }}>CREDIT CUSTOMER</span>
                </div>
              )}
              <div className="zoom-detail-item">
                <span className="zoom-detail-label">Created At</span>
                <span className="zoom-detail-value">
                  {zoomJob.createdAt ? new Date(zoomJob.createdAt).toLocaleDateString() : ''}
                </span>
              </div>
              <div className="zoom-detail-item">
                <span className="zoom-detail-label">Payment Status</span>
                <span className={`status-badge ${zoomJob.paymentStatus === 'PAID' ? 'status-paid' : 'status-unpaid'}`}>
                  {zoomJob.paymentStatus}
                </span>
              </div>
            </div>
            <div className="zoom-modal-footer">
              {zoomJob.paymentStatus === 'UNPAID' && (
                <button
                  className="btn-primary"
                  style={{ width: 'auto', padding: '0.5rem 1rem' }}
                  onClick={async () => {
                    await markPaid(zoomJob.jobId);
                    setZoomJob(null);
                  }}
                >
                  Mark Paid
                </button>
              )}
              <button className="btn-secondary" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={() => setZoomJob(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
