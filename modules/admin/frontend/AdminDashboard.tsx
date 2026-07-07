import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@core/services/api'
import { queueApi } from '@core/services/queueApi'
import UserMenu from '@core/components/UserMenu'
import EmployeeManager from './EmployeeManager'
import CustomerManager from './CustomerManager'
import AdminReports from './AdminReports'
import LaminationStockManager from './LaminationStockManager'
import ModuleNavigation from '@core/components/ModuleNavigation'

import WorkflowJobDetailsModal from '@core/components/WorkflowJobDetailsModal'
import { fetchProductionTimings, updateProductionTimings } from '@core/services/api'
import { estimateItemTime, formatEstimateLabel, formatMinutes, DEFAULT_TIMINGS, type ProductionTimings } from '@core/utils/productionTime'
import './AdminDashboard.css'
import './AdminDashboardMobile.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdminJobs } from '@core/services/api'

type Job = {
  jobId: string
  customerName: string
  paymentStatus: string
  jobStatus: string
  adminApprovalNote?: string
  createdBy?: { name: string }
  paymentHandledBy?: { name: string }
  dispatchedBy?: { name: string }
  packedBy?: { name: string }
  defaultDeliveryType?: string
  contactMe?: boolean
  items?: any[]
  ppsCompletedAt?: string
  finishingCompletedAt?: string
  dispatchedAt?: string
}

import DateFilter from '@core/components/DateFilter'

// ... imports

export default function AdminDashboard() {

  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') || 'jobs'

  const [activeTab, setActiveTab] = useState<'jobs' | 'employees' | 'customers' | 'reports' | 'queue' | 'stock'>(() => {
    return (tabParam === 'employees' || tabParam === 'customers' || tabParam === 'reports' || tabParam === 'stock') ? tabParam : 'jobs'
  })

  // Synchronize state when tab changes in URL search params
  useEffect(() => {
    const currentTab = searchParams.get('tab') || 'jobs'
    const allowed = ['jobs', 'employees', 'customers', 'reports', 'stock']
    if (allowed.includes(currentTab) && currentTab !== activeTab) {
      setActiveTab(currentTab as any)
    }
  }, [searchParams])

  const handleTabChange = (newTab: 'jobs' | 'employees' | 'customers' | 'reports' | 'stock') => {
    setActiveTab(newTab)
    setSearchParams({ tab: newTab })
    setSearch('')
  }
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [detailJob, setDetailJob] = useState<Job | null>(null)

  // Production timings editor state
  const [timings, setTimings] = useState<ProductionTimings>(DEFAULT_TIMINGS)

  const [showTimingsEditor, setShowTimingsEditor] = useState(false)
  const [timingsSaving, setTimingsSaving] = useState(false)
  const [_timingsLoaded, _setTimingsLoaded] = useState(false)
  const [timingsEdit, setTimingsEdit] = useState<ProductionTimings>(DEFAULT_TIMINGS)
  const [timingsEditItem, setTimingsEditItem] = useState<any | null>(null) // the item whose tasks filter the editor

  useEffect(() => {
    fetchProductionTimings().then(data => {
      if (data) {
        const merged = { ...DEFAULT_TIMINGS, ...data }
        setTimings(merged)
        setTimingsEdit(merged)
      }
      _setTimingsLoaded(true)
    }).catch(() => _setTimingsLoaded(true))
  }, [])

  const saveTimings = async () => {
    setTimingsSaving(true)
    try {
      await updateProductionTimings(timingsEdit as unknown as Record<string, number>)
      setTimings(timingsEdit)
      setShowTimingsEditor(false)
    } catch {
      alert('Failed to save timings')
    } finally {
      setTimingsSaving(false)
    }
  }

  // Filtering & Pagination State
  const [search, setSearch] = useState('')
  const [submittedBy, setSubmittedBy] = useState<string[]>([])
  const [staffDropdownOpen, setStaffDropdownOpen] = useState(false)
  const staffDropdownRef = useRef<HTMLDivElement>(null)
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CREATED' | 'PACKED' | 'DISPATCHED'>('ALL')
  const [processFilter, setProcessFilter] = useState<string>('ALL')
  const [hideDispatched, setHideDispatched] = useState(false)
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0])
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [lineSpacing, setLineSpacing] = useState<'compact' | 'normal' | 'relaxed'>('normal')

  const { data: responseData, isLoading: loading } = useQuery({
    queryKey: ['admin-jobs', dateFilter, currentPage, search, paymentFilter, statusFilter, processFilter, hideDispatched, rowsPerPage, submittedBy],
    queryFn: () => fetchAdminJobs(
      dateFilter,
      currentPage,
      rowsPerPage,
      search,
      paymentFilter,
      statusFilter,
      processFilter,
      hideDispatched,
      submittedBy.join(',')
    ),
    refetchInterval: 10000,
    staleTime: 30000,
    placeholderData: (previousData: any) => previousData,
    enabled: activeTab === 'jobs',
  })

  // Handle both legacy (array) and new (object) API responses
  const jobs = Array.isArray(responseData) ? responseData : (responseData?.jobs || [])
  const totalPages = responseData?.pages || 1

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

  const { data: staffList } = useQuery({
    queryKey: ['staff-list'],
    queryFn: queueApi.getStaffList,
  })

  // Close staff dropdown on outside click
  useEffect(() => {
    if (!staffDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(e.target as Node)) {
        setStaffDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [staffDropdownOpen])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, paymentFilter, statusFilter, processFilter, hideDispatched, dateFilter, rowsPerPage, submittedBy])

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    try {
      const parts = text.split(new RegExp(`(${query})`, 'gi'));
      return (
        <>
          {parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase()
              ? <mark key={i} style={{ backgroundColor: '#fef08a', color: '#000', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>
              : part
          )}
        </>
      );
    } catch (e) {
      return text;
    }
  };

  // Derived Data: Filtering & Sorting — today's jobs first, then previous days
  const displayJobs = (jobs || [])
    .slice()
    .sort((a: Job, b: Job) => new Date((b as any).createdAt).getTime() - new Date((a as any).createdAt).getTime())

  const todayStr = new Date().toLocaleDateString('en-CA')
  const yesterdayStr = new Date(Date.now() - 86400000).toLocaleDateString('en-CA')
  function getDateLabel(isoDate: string) {
    const d = new Date(isoDate).toLocaleDateString('en-CA')
    if (d === todayStr) return 'Today — ' + new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    if (d === yesterdayStr) return 'Yesterday — ' + new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    return new Date(isoDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  }

  const getSearchRowStyle = (index: number): React.CSSProperties => {
    if (!search.trim() && submittedBy.length === 0) return {}
    const colors = [
      { bg: '#c7d2fe', text: '#000', sub: '#4338ca' },
      { bg: '#ddd6fe', text: '#000', sub: '#5b21b6' },
      { bg: '#e0e7ff', text: '#000', sub: '#4338ca' },
      { bg: '#ede9fe', text: '#000', sub: '#6d28d9' },
      { bg: '#f5f3ff', text: '#000', sub: '#7c3aed' },
      { bg: '#faf5ff', text: '#000', sub: '#9333ea' },
      { bg: '#ffffff', text: '#000', sub: '#a855f7' },
    ]
    const s = colors[Math.min(index, colors.length - 1)]
    return {
      backgroundColor: s.bg,
      backgroundImage: index < 3 ? 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 0)' : 'none',
      backgroundSize: '4px 4px',
      color: s.text,
      transition: 'all 0.3s ease',
      borderLeft: `6px solid ${index === 0 ? '#4338ca' : 'transparent'}`,
} as React.CSSProperties
  }

  return (
    <div className="admin-page">
      {/* Mobile Topbar (hidden on desktop) */}
      <div className="mobile-header-row">
        <span className="mobile-header-title">
          {activeTab === 'employees' ? 'TEAMS' : activeTab === 'customers' ? 'CUSTOMERS' : activeTab === 'reports' ? 'REPORTS' : activeTab === 'stock' ? 'LAM STOCK' : 'ADMIN'}
        </span>
        
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
          {activeTab === 'jobs' && (
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
          )}
        </div>
      </div>

      {/* Desktop Navbar (hidden on mobile) */}
      <div className="admin-navbar desktop-navbar-only">
        <div className="admin-navbar-left">
          <h1 className="admin-title">Admin</h1>
          <div className="dashboard-tabs">
            <button
              onClick={() => handleTabChange('jobs')}
              className={`dashboard-tab ${activeTab === 'jobs' ? 'active' : ''}`}
              title="Jobs"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
              <span className="tab-label">Jobs</span>
            </button>

            <button
              onClick={() => handleTabChange('employees')}
              className={`dashboard-tab ${activeTab === 'employees' ? 'active' : ''}`}
              title="Employees"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              <span className="tab-label">Team</span>
            </button>

            <button
              onClick={() => handleTabChange('customers')}
              className={`dashboard-tab ${activeTab === 'customers' ? 'active' : ''}`}
              title="Customers"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              <span className="tab-label">Customers</span>
            </button>

            <button
              onClick={() => handleTabChange('reports')}
              className={`dashboard-tab ${activeTab === 'reports' ? 'active' : ''}`}
              title="Reports"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              <span className="tab-label">Reports</span>
            </button>

            <button
              onClick={() => handleTabChange('stock')}
              className={`dashboard-tab ${activeTab === 'stock' ? 'active' : ''}`}
              title="Stock & Config"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="tab-label">Stock &amp; Config</span>
            </button>

            <button
              onClick={() => window.location.href = '/admin/queue'}
              className="dashboard-tab"
              style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa' }}
              title="Queue Control"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
              <span className="tab-label">Queue Control</span>
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
          <div className={`admin-filters-bar ${showMobileFilters ? 'mobile-visible' : ''}`}>
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

              <div className="search-wrapper" ref={staffDropdownRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="filter-input search"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', justifyContent: 'space-between', background: '#fff', border: '1px solid #e2e8f0', width: '100%', minWidth: '170px' }}
                  onClick={() => setStaffDropdownOpen(o => !o)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {submittedBy.length === 0
                      ? 'Submitted By...'
                      : submittedBy.length === 1
                        ? ((staffList as any[])?.filter((s: any) => {
                            const r = s.role || ''; const rs: string[] = s.roles || []
                            return r === 'PREPRESS' || rs.includes('PREPRESS')
                          }).find((s: any) => s._id === submittedBy[0])?.name || '1 selected')
                        : `${submittedBy.length} staff selected`}
                  </span>
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {staffDropdownOpen && (
                  <div style={{
                    position: 'absolute', top: '110%', left: 0, zIndex: 999,
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.5rem',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: '200px', padding: '0.5rem 0'
                  }}>
                    <div
                      style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}
                      onClick={() => { setSubmittedBy([]); setStaffDropdownOpen(false); setCurrentPage(1) }}
                    >
                      ✕ Clear selection
                    </div>
                    {(staffList as any[])?.filter((s: any) => {
                        const r = s.role || ''
                        const rs: string[] = s.roles || []
                        return r === 'PREPRESS' || rs.includes('PREPRESS')
                      }).map((s: any) => {
                      const checked = submittedBy.includes(s._id)
                      return (
                        <label
                          key={s._id}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', background: checked ? '#f0f7ff' : 'transparent' }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSubmittedBy(prev => checked ? prev.filter(id => id !== s._id) : [...prev, s._id])
                              setCurrentPage(1)
                            }}
                            style={{ width: '1rem', height: '1rem' }}
                          />
                          {s.name}
                        </label>
                      )
                    })}
                  </div>
                )}
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

              <div className="dropdown-wrapper">
                <select
                  className="filter-select"
                  value={processFilter}
                  onChange={(e) => { setProcessFilter(e.target.value); setCurrentPage(1); }}
                >
                  <option value="ALL">Process: All</option>
                  <optgroup label="── Post Press">
                    <option value="lamination">Lamination</option>
                    <option value="foil">Foil</option>
                    <option value="binding">Binding</option>
                    <option value="fusing">Fusing</option>
                    <option value="holes">Holes</option>
                  </optgroup>
                  <optgroup label="── Finishing">
                    <option value="cutting">Cutting</option>
                    <option value="creasing">Creasing</option>
                    <option value="dieCutting">Die Cutting</option>
                    <option value="cornerCutting">Corner Cutting</option>
                    <option value="cutting2">Cutting 2</option>
                  </optgroup>
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

          {(!!search.trim() || submittedBy.length > 0) && (
            <div style={{ margin: '0 0 1.5rem 0', padding: '0.625rem 1rem', background: '#f5f3ff', color: '#6d28d9', borderRadius: '0.75rem', border: '1px solid #ddd6fe', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.625rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', background: '#8b5cf6', borderRadius: '50%', color: '#fff' }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.025em' }}>Global Search Active:</span>
              <span>
                Showing jobs
                {search.trim() && ` matching "${search}"`}
                {search.trim() && submittedBy.length > 0 && ' and'}
                {submittedBy.length > 0 && ` submitted by ${submittedBy.length === 1 ? ((staffList as any[])?.filter((s: any) => { const r = s.role || ''; const rs: string[] = s.roles || []; return r === 'PREPRESS' || rs.includes('PREPRESS') }).find((s: any) => s._id === submittedBy[0])?.name || 'selected staff') : `${submittedBy.length} staff`}`}
                {" "}across all dates
              </span>
            </div>
          )}

          {loading ? (
            <div className="dispatch-loading">
              <div className="dispatch-spinner"></div>
            </div>
          ) : (
            <>
              <div className="dispatch-table-container admin-jobs-table-container">
                <table className="dispatch-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Job ID</th>
                      <th>Customer</th>
                      <th>Submitted By</th>
                      <th>Payment</th>
                      <th>Est. Ready</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayJobs.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                          No jobs found matching the filters.
                        </td>
                      </tr>
                    ) : displayJobs.reduce((rows: React.ReactNode[], job: Job, index: number) => {
                        const dateKey = new Date((job as any).createdAt).toLocaleDateString('en-CA')
                        const prevJob = displayJobs[index - 1] as any
                        const prevDateKey = prevJob ? new Date(prevJob.createdAt).toLocaleDateString('en-CA') : ''
                        const isSearchActive = search.trim() !== '' || submittedBy.length > 0
                        if (!isSearchActive && dateKey !== prevDateKey) {
                          rows.push(
                            <tr key={`sep-${dateKey}`}>
                              <td colSpan={7} style={{ padding: '0.5rem 1rem', background: '#f1f5f9', borderTop: '2px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  📅 {getDateLabel((job as any).createdAt)}
                                </span>
                              </td>
                            </tr>
                          )
                        }
                        rows.push(
                          <tr key={job.jobId} className={`dispatch-row ${lineSpacing}${(search.trim() || submittedBy.length > 0) ? ' search-result-row' : ''}`} style={{ cursor: 'pointer', ...getSearchRowStyle(index) }} onClick={() => setDetailJob(job)}>
                            <td><span style={{ fontWeight: 600, color: '#64748b' }}>{(currentPage - 1) * rowsPerPage + index + 1}</span></td>
                            <td>
                              <span style={{ fontWeight: 800 }}>#{search.trim() ? highlightMatch(job.jobId, search) : job.jobId}</span>
                              {job.defaultDeliveryType === 'WALK_IN' && (
                                <span style={{ display: 'block', fontSize: '0.625rem', padding: '0.125rem 0.375rem', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', fontWeight: 700, width: 'fit-content', marginTop: '0.25rem' }}>WALK-IN</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontWeight: 600, color: (job as any).customerId?.isCreditCustomer ? '#047857' : 'inherit' }}>
                                  {search.trim() ? highlightMatch(job.customerName, search) : job.customerName}
                                </span>
                                {(job as any).customerId?.isCreditCustomer && (
                                  <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', background: '#d1fae5', color: '#047857', borderRadius: '4px', fontWeight: 700 }}>CREDIT</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                                  {job.createdBy?.name || '—'}
                                </span>
                                {!!job.contactMe && <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', background: '#f5f3ff', color: '#6d28d9', borderRadius: '4px', fontWeight: 700, width: 'fit-content' }}>CONTACT ME</span>}
                              </div>
                            </td>
                            <td>
                              <span className={`status-badge ${(job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED') ? 'status-paid' : 'status-unpaid'}`}>
                                {job.paymentStatus}
                              </span>
                            </td>
                            <td>
                              {(() => {
                                const items: any[] = job.items || []
                                if (items.length === 0) return <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>—</span>
                                const totalMins = items.reduce((sum: number, it: any) => sum + estimateItemTime(it, timings), 0)
                                if (totalMins <= 0) return <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>—</span>
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    {items.map((it: any, i: number) => {
                                      const mins = estimateItemTime(it, timings)
                                      if (mins <= 0) return null
                                      return (
                                        <span key={i} style={{ fontSize: '0.68rem', color: '#475569' }}>
                                          <span style={{ fontWeight: 600, color: '#64748b' }}>#{i + 1}</span> {formatEstimateLabel(mins)}
                                        </span>
                                      )
                                    })}
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: totalMins >= 1440 ? '#dc2626' : '#2563eb', marginTop: '0.15rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.15rem' }}>
                                      ⏱ {formatEstimateLabel(totalMins)}
                                    </span>
                                  </div>
                                )
                              })()}
                            </td>
                            <td className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                {job.paymentStatus === 'UNPAID' ? (
                                  <>
                                    <input type="text" placeholder="Optional Note" className="form-input" style={{ fontSize: '0.75rem', padding: '0.25rem', width: '150px', height: '28px' }} value={approvalNotes[job.jobId] || ''} onChange={(e) => setApprovalNotes(prev => ({ ...prev, [job.jobId]: e.target.value }))} />
                                    <button className="btn-primary" onClick={() => approve(job.jobId)} style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', width: 'auto' }}>Approve Payment</button>
                                  </>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>COMPLETED</span>
                                    {job.adminApprovalNote && (
                                      <span style={{ fontSize: '0.65rem', color: '#6b7280', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={job.adminApprovalNote}>"{job.adminApprovalNote}"</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                        return rows
                      }, [])
                    }
                  </tbody>
                </table>
              </div>

              {/* ─── Mobile Job Cards (hidden on desktop via CSS) ─── */}
              {(() => {
                const POSTPRESS_KEYS = ['lamination', 'foil', 'binding', 'fusing', 'holes', 'cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2']
                const hasPostProcess = (items: any[]) =>
                  (items || []).some(it => POSTPRESS_KEYS.some(k => it[k] && it[k] !== 'NONE'))

                return (
                  <div className="admin-job-card-list">
                    {displayJobs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.85rem' }}>
                        No jobs found matching the filters.
                      </div>
                    ) : displayJobs.map((job: Job, index: number) => {
                      const isPaid = job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED'
                      const isDispatched = job.jobStatus === 'DISPATCHED'
                      const postProcess = hasPostProcess(job.items || [])

                      return (
                        <div
                          key={job.jobId}
                          className={`admin-job-card${isPaid ? ' card-paid' : ''}`}
                          onClick={() => setDetailJob(job)}
                        >
                          {/* S.No */}
                          <span className="admin-job-card-sno">
                            {(currentPage - 1) * rowsPerPage + index + 1}
                          </span>

                          {/* Info */}
                          <div className="admin-job-card-info">
                            <div className="admin-job-card-top">
                              <span className="admin-job-card-id">#{job.jobId}</span>
                              <span className="admin-job-card-customer">{job.customerName}</span>
                            </div>
                            <div className="admin-job-card-badges">
                              {/* Payment badge */}
                              {job.paymentStatus === 'PAID' && (
                                <span className="card-badge card-badge-paid">Paid</span>
                              )}
                              {job.paymentStatus === 'ADMIN_APPROVED' && (
                                <span className="card-badge card-badge-approved">Approved</span>
                              )}
                              {job.paymentStatus === 'UNPAID' && (
                                <span className="card-badge card-badge-unpaid">Unpaid</span>
                              )}
                              {/* Post-process flag */}
                              {postProcess && (
                                <span className="card-badge card-badge-postpress">✂ Post-process</span>
                              )}
                            </div>
                          </div>

                          {/* Dispatched tick */}
                          {isDispatched && (
                            <span className="admin-job-card-tick" title="Fully Dispatched">✓</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Pagination / Controls Footer */}

              <div className="admin-queue-footer">
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
                  <div className="vertical-divider-mini" style={{ width: '1px', height: '16px', background: '#cbd5e1', margin: '0 0.5rem' }} />
                  <div className="density-row">
                    <span className="density-label">Row Space</span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="1"
                      className="density-slider-elite"
                      value={
                        lineSpacing === "compact"
                          ? 0
                          : lineSpacing === "normal"
                            ? 1
                            : 2
                      }
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setLineSpacing(
                          val === 0
                            ? "compact"
                            : val === 1
                              ? "normal"
                              : "relaxed",
                        );
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'employees' && <EmployeeManager search={search} setSearch={setSearch} />}
      {activeTab === 'customers' && <CustomerManager search={search} setSearch={setSearch} />}
      {activeTab === 'reports' && <AdminReports />}
      {activeTab === 'stock' && <LaminationStockManager />}

      {detailJob && (
        <WorkflowJobDetailsModal
          job={detailJob}
          onClose={() => setDetailJob(null)}
          workflowLabel="Workflow Status"
          workflowTask={null}
          onEditTimings={(item: any) => { setTimingsEditItem(item); setTimingsEdit({ ...timings }); setShowTimingsEditor(true) }}
          itemTimings={
            (detailJob.items || []).reduce((acc: Record<number, number>, it: any, i: number) => {
              acc[i] = estimateItemTime(it, timings)
              return acc
            }, {})
          }
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['admin-jobs'] })}
        />
      )}

      {/* Production Timings Editor Modal */}
      {showTimingsEditor && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998 }} onClick={() => setShowTimingsEditor(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', borderRadius: '1rem', padding: '1.5rem', zIndex: 9999, width: '480px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>⏱ Edit Production Timings</h3>
                <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Showing tasks for this item only. Values in <strong>minutes</strong>.
                </p>
              </div>
              <button type="button" onClick={() => setShowTimingsEditor(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
              {(() => {
                const item = timingsEditItem || {}
                // Build list of timing keys that apply to this item
                const TASK_KEY_MAP: { key: keyof ProductionTimings; label: string; test: () => boolean }[] = [
                  { key: 'lamination',     label: 'Lamination',      test: () => item.lamination && item.lamination !== 'NONE' },
                  { key: 'foil',           label: 'Foil',            test: () => item.foil && item.foil !== 'NONE' },
                  { key: 'binding',        label: 'Binding',         test: () => item.binding && item.binding !== 'NONE' && item.binding !== 'PERFECT_BIND' },
                  { key: 'perfectBinding', label: 'Perfect Binding', test: () => item.binding === 'PERFECT_BIND' },
                  { key: 'idCard',         label: 'ID Card',         test: () => !!item.idCard },
                  { key: 'fusing',         label: 'Fusing',          test: () => item.fusing && item.fusing !== 'NONE' },
                  { key: 'holes',          label: 'Holes',           test: () => item.holes && item.holes !== 'NONE' },
                  { key: 'dieCutting',     label: 'Die Cutting',     test: () => item.dieCutting && item.dieCutting !== 'NONE' },
                  { key: 'cutting',        label: 'Cutting',         test: () => item.cutting && item.cutting !== 'NONE' },
                  { key: 'creasing',       label: 'Creasing',        test: () => item.creasing && item.creasing !== 'NONE' },
                  { key: 'cornerCutting',  label: 'Corner Cutting',  test: () => item.cornerCutting && item.cornerCutting !== 'NONE' },
                ]
                const activeKeys = TASK_KEY_MAP.filter(t => t.test())
                if (activeKeys.length === 0) {
                  return <p style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>No tasks configured for this item.</p>
                }
                return activeKeys.map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', minWidth: 130 }}>
                      {label}
                      <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '0.35rem' }}>({formatMinutes(timingsEdit[key])})</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      className="form-input"
                      style={{ height: '32px', fontSize: '0.8rem', width: '110px', textAlign: 'center' }}
                      value={timingsEdit[key]}
                      onChange={e => setTimingsEdit(prev => ({ ...prev, [key]: Number(e.target.value) || 1 }))}
                    />
                  </div>
                ))
              })()}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setShowTimingsEditor(false)}>Cancel</button>
              <button type="button" className="btn-primary" style={{ fontSize: '0.8rem' }} onClick={saveTimings} disabled={timingsSaving}>
                {timingsSaving ? 'Saving...' : 'Save Timings'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
