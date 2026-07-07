import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPressJobs, fetchPressHistory, confirmPressItem } from '@core/services/api'
import UserMenu from '@core/components/UserMenu'
import ModuleNavigation from '@core/components/ModuleNavigation'
import Pagination from '@core/components/Pagination'
import WorkflowJobDetailsModal, { firstItemScreenshot, jobThumbnailUrl } from '@core/components/WorkflowJobDetailsModal'
import DateFilter from '@core/components/DateFilter'
import MobileTopBar from '@core/components/MobileTopBar'
import { useQueueSocket } from '@core/hooks/useQueueSocket'
import './PressDashboard.css'

export default function PressDashboard() {
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  // Ref so the socket handler (stale closure) always sees the current selectedJob
  const selectedJobRef = useRef<any | null>(null)
  useEffect(() => { selectedJobRef.current = selectedJob }, [selectedJob])
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
  const [listViewImage, setListViewImage] = useState<string | null>(null)

  // Adjust dateFilter default when switching between active queue and history
  useEffect(() => {
    if (viewMode === 'active') {
      setDateFilter('')
    } else {
      setDateFilter(new Date().toISOString().split('T')[0])
    }
    setCurrentPage(1)
  }, [viewMode])

  const [confirmedItems, setConfirmedItems] = useState<Set<number>>(new Set())

  // Sync confirmedItems from server data (printConfirmed field) whenever selectedJob updates
  useEffect(() => {
    if (!selectedJob) { setConfirmedItems(new Set()); return }
    const serverConfirmed = new Set<number>()
    ;(selectedJob.items || []).forEach((item: any, idx: number) => {
      if (item.printConfirmed) serverConfirmed.add(idx)
    })
    setConfirmedItems(serverConfirmed)
  }, [selectedJob])
  const itemsPerPage = 10

  const queryClient = useQueryClient()

  // Real-time sync: when any user completes a task, all connected screens refresh instantly
  const { socket } = useQueueSocket('staff')

  useEffect(() => {
    if (!socket) return
    const handleWorkflowUpdate = async () => {
      // Refetch immediately so cache is fresh
      await queryClient.refetchQueries({
        queryKey: ['press-jobs', viewMode, currentPage, dateFilter, searchQuery]
      })
      queryClient.invalidateQueries({ queryKey: ['post-press-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['finishing-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['dispatch-jobs'] })

      // Sync open modal with fresh data — no close/reopen needed
      if (selectedJobRef.current) {
        const fresh = queryClient.getQueryData<any>(
          ['press-jobs', viewMode, currentPage, dateFilter, searchQuery]
        )
        const updatedJob = fresh?.jobs?.find((j: any) => j.jobId === selectedJobRef.current.jobId)
        if (updatedJob) setSelectedJob(updatedJob)
        else setSelectedJob(null)
      }
    }
    socket.on('workflow:updated', handleWorkflowUpdate)
    return () => { socket.off('workflow:updated', handleWorkflowUpdate) }
  }, [socket, queryClient, viewMode, currentPage, dateFilter, searchQuery])

  const { data: responseData, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['press-jobs', viewMode, currentPage, dateFilter, searchQuery],
    queryFn: () =>
      viewMode === 'history'
        ? fetchPressHistory(currentPage, itemsPerPage, dateFilter, searchQuery)
        : fetchPressJobs(currentPage, itemsPerPage, dateFilter, searchQuery),
    refetchInterval: viewMode === 'active' ? 10000 : false,
    placeholderData: (previousData: any) => previousData,
  })

  const jobs = responseData?.jobs || []
  const totalPages = responseData?.pages || 1

  const [completingItemIndex, setCompletingItemIndex] = useState<number | null>(null)

  const confirmMutation = useMutation({
    mutationFn: ({ jobId, itemIndex }: { jobId: string; itemIndex: number }) =>
      confirmPressItem(jobId, itemIndex),
    onSuccess: async (_data) => {
      setCompletingItemIndex(null)
      await queryClient.refetchQueries({ queryKey: ['press-jobs', viewMode, currentPage, dateFilter, searchQuery] })
      queryClient.invalidateQueries({ queryKey: ['post-press-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['finishing-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['dispatch-jobs'] })
      const fresh = queryClient.getQueryData<any>(['press-jobs', viewMode, currentPage, dateFilter, searchQuery])
      const updatedJob = fresh?.jobs?.find((j: any) => j.jobId === selectedJob?.jobId)
      if (updatedJob) {
        // Job still in press queue — update modal with fresh data (some items confirmed)
        setSelectedJob(updatedJob)
      } else {
        // All items confirmed — job moved out of press queue
        setSelectedJob(null)
        setConfirmedItems(new Set())
      }
    },
    onError: (err: any) => {
      setCompletingItemIndex(null)
      const msg = err.response?.data?.message || err.message || 'Failed to confirm item.'
      alert(`Error: ${msg}`)
    }
  })

  // Called from the modal's per-item "Confirm Item #N Printed" button
  // Single-click confirm — no second confirmation dialog needed
  const handleCompleteItemFromModal = (itemIndex: number, _task: any) => {
    if (!selectedJob || confirmMutation.isPending) return
    setCompletingItemIndex(itemIndex)
    confirmMutation.mutate(
      { jobId: selectedJob.jobId, itemIndex },
      { onSettled: () => setCompletingItemIndex(null) }
    )
  }

  const allItemsConfirmed = selectedJob
    ? confirmedItems.size >= (selectedJob.items?.length || 0)
    : false
  void allItemsConfirmed // kept for potential future use

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text
    try {
      const parts = text.split(new RegExp(`(${query})`, 'gi'))
      return (
        <>
          {parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase()
              ? <mark key={i} style={{ backgroundColor: '#eab308', color: '#000', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>
              : part
          )}
        </>
      )
    } catch (e) {
      return text
    }
  }

  return (
    <div className="press-page">
      {/* Mobile top bar — shown only on mobile via CSS */}
      <MobileTopBar
        title="Press"
        searchQuery={searchQuery}
        onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1) }}
        dateFilter={dateFilter}
        onDateChange={(v) => { setDateFilter(v); setCurrentPage(1) }}
        viewMode={viewMode}
        onViewModeChange={(v) => { setViewMode(v); setCurrentPage(1) }}
      />

      {/* Desktop navbar */}
      <div className="press-navbar">
        <div className="press-navbar-left">
          <h1 className="press-title">Press</h1>
          <div className="dashboard-tabs">
            <button
              onClick={() => { setViewMode('active'); setCurrentPage(1) }}
              className={`dashboard-tab ${viewMode === 'active' ? 'active' : ''}`}
              title="Active Jobs"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
              <span className="tab-label">Active</span>
            </button>
            <button
              onClick={() => { setViewMode('history'); setCurrentPage(1) }}
              className={`dashboard-tab ${viewMode === 'history' ? 'active' : ''}`}
              title="Job History"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="tab-label">History</span>
            </button>
          </div>
        </div>
        <div className="press-navbar-right">
          <ModuleNavigation />
          <UserMenu />
        </div>
      </div>

      <div className="press-filters-bar">
        <div className="press-header-actions">
          <DateFilter
            value={dateFilter}
            onChange={(v) => { setDateFilter(v); setCurrentPage(1) }}
          />
          <div className="press-search-wrapper">
            <svg className="press-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="press-filter-input"
              placeholder="Search Job ID or Customer..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>
      </div>

      {isLoading && !responseData ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="dispatch-spinner"></div>
        </div>
      ) : (
        <div className={`press-table-container ${isPlaceholderData ? 'stale-search' : ''}`}>
          <table className="press-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>S.No</th>
                <th style={{ width: '72px' }}>Image</th>
                <th style={{ width: '120px' }}>Job ID</th>
                <th style={{ width: '180px' }}>Customer</th>
                <th>Job Description</th>
                <th style={{ width: '150px' }}>Media</th>
                <th style={{ width: '120px' }}>Total Copies</th>
                <th style={{ width: '120px' }}>Payment</th>
                <th style={{ width: '150px' }}>Submitted By</th>
                {viewMode === 'history' ? (
                  <th style={{ width: '140px' }}>Status</th>
                ) : (
                  <th style={{ width: '220px', textAlign: 'right' }}>Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--press-text-muted)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🖨️</div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--press-text)' }}>
                      {viewMode === 'history' ? 'No history found' : 'Queue is Empty'}
                    </div>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
                      {viewMode === 'history'
                        ? 'No printed jobs found for the selected filters.'
                        : 'There are no active printing jobs for the selected filters.'}
                    </p>
                  </td>
                </tr>
              ) : (
                jobs.map((job: any, index: number) => {
                  const displayIndex = (currentPage - 1) * itemsPerPage + index + 1
                  const isSearchResult = !!searchQuery.trim()
                  const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => item.activeStage === 'press'))

                  return (
                    <tr key={job.jobId} className="press-row" onClick={() => setSelectedJob(job)}>
                      <td><span style={{ fontWeight: 600, color: 'var(--press-text-muted)' }}>{displayIndex}</span></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div
                          className="press-item-preview-box"
                          style={{ width: 56, height: 56, minWidth: 56, cursor: thumb ? 'zoom-in' : 'default' }}
                          onClick={() => {
                            if (thumb) {
                              setListViewImage(thumb)
                            }
                          }}
                        >
                          {thumb ? (
                            <img src={thumb} alt="" className="press-item-preview-img" loading="lazy" />
                          ) : (
                            <span style={{ fontSize: '0.625rem', color: 'var(--press-text-muted)' }}>--</span>
                          )}
                        </div>
                      </td>
                      <td><span style={{ fontWeight: 800 }}>{isSearchResult ? highlightMatch(job.jobId, searchQuery) : job.jobId}</span></td>
                      <td><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{isSearchResult ? highlightMatch(job.customerName, searchQuery) : job.customerName}</span></td>
                      <td><span className="press-description-pill">{job.jobDescription}</span></td>
                      <td><span className="press-media-pill">{job.media}</span></td>
                      <td><span className="press-copies-badge">{job.totalCopies}</span></td>
                      <td>
                        <span className={`status-badge ${job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED' ? 'status-paid' : 'status-unpaid'}`}>
                          {job.paymentStatus}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.82rem' }}>
                          {job.createdBy?.name || '--'}
                        </span>
                      </td>
                      {viewMode === 'history' ? (
                        <td>
                          <span className="press-copies-badge" style={{ textTransform: 'capitalize', fontSize: '0.7rem' }}>
                            {job.jobStatus}
                          </span>
                        </td>
                      ) : (
                        <td className="press-actions-cell" style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.75rem' }}>
                            <button className="press-btn-view" onClick={(e) => { e.stopPropagation(); setSelectedJob(job); }}>
                              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile Card List (visible on mobile viewports) */}
      {responseData && (
        <div className="press-mobile-cards">
          {jobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--press-text-muted)', fontWeight: 600 }}>
              {viewMode === 'history' ? 'No history found' : 'Queue is Empty'}
            </div>
          ) : (
            jobs.map((job: any, index: number) => {
              const displayIndex = (currentPage - 1) * itemsPerPage + index + 1
              const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item: any) => item.activeStage === 'press'))
              const isPaid = job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED'
              const timeStr = job.createdAt ? new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : ''
              const dateStr = job.createdAt ? new Date(job.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''
              const timeItCame = `${dateStr} ${timeStr}`.trim()

              const pendingPressItems = viewMode === 'active'
                ? (job.items || [])
                    .map((item: any, idx: number) => ({ item, originalIndex: idx }))
                    .filter(({ item }: { item: any }) => item.activeStage === 'press' && !item.printConfirmed)
                : []

              return (
                <div
                  key={job.jobId}
                  className={`press-mobile-card ${isPaid ? 'paid-card' : 'unpaid-card'}`}
                  onClick={() => setSelectedJob(job)}
                >
                  {/* First Line: S.No, Job ID, Time */}
                  <div className="card-line-one">
                    <div className="card-left-group">
                      <span className="card-sno">{displayIndex}</span>
                      <span className="card-job-id">{job.jobId}</span>
                    </div>
                    <span className="card-time">{timeItCame}</span>
                  </div>

                  {/* Second Line: Thumbnail, Customer Name, and Print marking buttons inline */}
                  <div className="card-line-two">
                    <div className="card-left-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                      <div
                        className="card-img-wrapper"
                        style={{ cursor: thumb ? 'zoom-in' : 'default' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (thumb) {
                            setListViewImage(thumb)
                          }
                        }}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="card-thumb-img" loading="lazy" />
                        ) : (
                          <span className="card-thumb-placeholder">—</span>
                        )}
                      </div>
                      <span className="card-customer-name">{job.customerName}</span>
                    </div>

                    {viewMode === 'active' && pendingPressItems.length > 0 && (
                      <div className="card-mobile-actions-inline" onClick={(e) => e.stopPropagation()}>
                        {pendingPressItems.map(({ originalIndex }: { originalIndex: number }) => (
                          <button
                            key={originalIndex}
                            type="button"
                            className="press-btn-finish mobile-card-action-btn-inline"
                            disabled={confirmMutation.isPending && completingItemIndex === originalIndex}
                            onClick={() => {
                              if (confirmMutation.isPending) return
                              setCompletingItemIndex(originalIndex)
                              confirmMutation.mutate(
                                { jobId: job.jobId, itemIndex: originalIndex },
                                { onSettled: () => setCompletingItemIndex(null) }
                              )
                            }}
                          >
                            {confirmMutation.isPending && completingItemIndex === originalIndex ? (
                              <span className="press-spinner" style={{ marginRight: 0 }}></span>
                            ) : (
                              pendingPressItems.length > 1
                                ? `#${originalIndex + 1} Print`
                                : `Print`
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />

      {selectedJob && (
        <WorkflowJobDetailsModal
          job={selectedJob}
          onClose={() => { setSelectedJob(null); setConfirmedItems(new Set()) }}
          workflowLabel={viewMode === 'history' ? 'Printed (History)' : 'Press'}
          workflowTask={viewMode === 'active' ? ('press' as any) : null}
          onCompleteItemTask={viewMode === 'active' ? handleCompleteItemFromModal : undefined}
          completingItemIndex={completingItemIndex}
          isCompleting={confirmMutation.isPending}
          confirmedItemIndexes={viewMode === 'active' ? confirmedItems : undefined}
          itemFilter={viewMode === 'active' ? (item: any) => item.activeStage === 'press' : undefined}
          showAllItems={viewMode === 'history'}
          footerAction={viewMode === 'active' && (selectedJob.items?.length || 0) > 0 ? (
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginRight: 'auto' }}>
              <strong style={{ color: confirmedItems.size === (selectedJob.items?.length || 0) ? '#22c55e' : '#0f172a' }}>
                {confirmedItems.size}/{selectedJob.items?.length || 0}
              </strong> items confirmed
              {confirmedItems.size < (selectedJob.items?.length || 0) && (
                <span style={{ color: '#f59e0b', marginLeft: '0.5rem', fontWeight: 700 }}>
                  — confirm all to finish job
                </span>
              )}
            </span>
          ) : undefined}
          showLogs={false}
        />
      )}

      {/* Lightbox for screenshot preview */}
      {listViewImage && createPortal(
        <div
          onClick={() => setListViewImage(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, cursor: 'zoom-out'
          }}
        >
          <img src={listViewImage} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px' }} />
        </div>,
        document.body
      )}
    </div>
  )
}
