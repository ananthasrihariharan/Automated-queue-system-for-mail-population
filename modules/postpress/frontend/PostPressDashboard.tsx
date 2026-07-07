import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ModuleNavigation from '@core/components/ModuleNavigation'
import Pagination from '@core/components/Pagination'
import UserMenu from '@core/components/UserMenu'
import WorkflowJobDetailsModal, { firstItemScreenshot, jobThumbnailUrl } from '@core/components/WorkflowJobDetailsModal'

import { completePostPressTask, fetchPostPressJobs, fetchPostPressHistory, fetchIncomingPostPressJobs, recordPostPressTaskStart } from '@core/services/api'
import { getActivePostPressStage, getItemPostPressStage, isPressConfirmedItem, postPressStageLabel, type PostPressTask } from '@core/utils/workflowStages'
import MobileTopBar from '@core/components/MobileTopBar'
import MobileTopBarCompact, { type CompactTab } from '@core/components/MobileTopBarCompact'
import { useQueueSocket } from '@core/hooks/useQueueSocket'
import '@modules/press/frontend/PressDashboard.css'



/** Returns ALL active post-press tasks for a job (a job can have items at different stages) */
const POST_PRESS_TASK_ORDER: PostPressTask[] = ['lamination', 'foil', 'binding', 'fusing', 'holes']
const getJobPostPressTasks = (job: any): { key: PostPressTask; label: string; pending: number }[] => {
  const items: any[] = job.items || []
  const tasks: { key: PostPressTask; label: string; pending: number }[] = []
  for (const key of POST_PRESS_TASK_ORDER) {
    const readyNow = items.filter((i: any) => isPressConfirmedItem(i) && i.activeStage === key).length
    if (readyNow > 0) {
      tasks.push({ key, label: postPressStageLabel(key), pending: readyNow })
    }
  }
  return tasks
}

export default function PostPressDashboard() {
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
  const [mainView, setMainView] = useState<'active' | 'incoming'>('incoming')

  // Adjust dateFilter default when switching between active/incoming queue and history
  useEffect(() => {
    if (mainView === 'incoming' || viewMode === 'active') {
      setDateFilter('')
    } else {
      setDateFilter(new Date().toISOString().split('T')[0])
    }
    setCurrentPage(1)
  }, [viewMode, mainView])
  const [selectedTaskFilter, setSelectedTaskFilter] = useState<string>('all')
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  const selectedJobRef = useRef<any | null>(null)
  useEffect(() => { selectedJobRef.current = selectedJob }, [selectedJob])
  const [modalTask, setModalTask] = useState<PostPressTask | null>(null)
  const [completingItemIndex, setCompletingItemIndex] = useState<number | null>(null)
  const itemsPerPage = 50
  const queryClient = useQueryClient()

  // Real-time update integration using shared socket hook
  const { socket } = useQueueSocket('staff')

  useEffect(() => {
    if (!socket) return
    const handleWorkflowUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['post-press-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['post-press-incoming'] })
    }
    socket.on('workflow:updated', handleWorkflowUpdate)
    return () => {
      socket.off('workflow:updated', handleWorkflowUpdate)
    }
  }, [socket, queryClient])

  const { data: responseData, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['post-press-jobs', viewMode, currentPage, dateFilter, searchQuery, selectedTaskFilter],
    queryFn: () =>
      viewMode === 'history'
        ? fetchPostPressHistory(currentPage, itemsPerPage, dateFilter, searchQuery, selectedTaskFilter)
        : fetchPostPressJobs(currentPage, itemsPerPage, dateFilter, searchQuery, selectedTaskFilter),
    refetchInterval: false,
    placeholderData: (previousData: any) => previousData,
  })

  const jobs = responseData?.jobs || []
  const totalPages = responseData?.pages || 1

  const { data: incomingData } = useQuery({
    queryKey: ['post-press-incoming', searchQuery],
    queryFn: () => fetchIncomingPostPressJobs(1, 50, '', searchQuery),
    refetchInterval: false,
    placeholderData: (previousData: any) => previousData,
  })

  // Sync open modal with fresh data
  useEffect(() => {
    if (selectedJobRef.current) {
      const updatedJob = jobs.find((j: any) => j.jobId === selectedJobRef.current.jobId)
      if (updatedJob) {
        setSelectedJob(updatedJob)
        setModalTask(prev => {
          if (!prev) return getActivePostPressStage(updatedJob)
          const stillActive = (updatedJob.items || []).some((i: any) => isPressConfirmedItem(i) && i.activeStage === prev)
          return stillActive ? prev : getActivePostPressStage(updatedJob)
        })
      } else {
        setSelectedJob(null)
        setModalTask(null)
      }
    }
  }, [jobs])

  const completeMutation = useMutation({
    mutationFn: ({ jobId, taskType, itemIndex, rollCode }: { jobId: string; taskType: PostPressTask; itemIndex?: number; rollCode?: string }) =>
      completePostPressTask(jobId, taskType, itemIndex, rollCode),
    onSuccess: async () => {
      setCompletingItemIndex(null)
      queryClient.invalidateQueries({ queryKey: ['post-press-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['post-press-incoming'] })
    },
    onSettled: () => setCompletingItemIndex(null),
    onError: (err: any) => {
      const msg = err.response?.data?.message || ''
      // If the job is already done (stale modal), close it and refresh
      if (msg.includes('No pending') || msg.includes('already') || err.response?.status === 400) {
        setSelectedJob(null)
        queryClient.invalidateQueries({ queryKey: ['post-press-jobs'] })
      } else {
        alert(msg || 'Failed to complete post press task.')
      }
    }
  })

  const handleCompleteItem = (jobId: string, taskType: PostPressTask, itemIndex: number, rollCode?: string) => {
    setCompletingItemIndex(itemIndex)
    completeMutation.mutate({ jobId, taskType, itemIndex, rollCode })
  }

  const openModal = (job: any, task?: PostPressTask) => {
    setSelectedJob(job)
    setModalTask(viewMode === 'history' ? null : (task ?? getActivePostPressStage(job)))
  }


  const incomingJobs: any[] = incomingData?.jobs || []
  const incomingCount = incomingJobs.length
  const [previewJob, setPreviewJob] = useState<any | null>(null)
  const [lightboxImg, setLightboxImg] = useState<string | null>(null)
  const [layoutMode, setLayoutMode] = useState<'default' | 'grid'>(
    () => (localStorage.getItem('postpress_layout_preference') as 'default' | 'grid') ?? 'default'
  )
  // On desktop (≥768px) always show table layout regardless of saved preference
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768)
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const effectiveLayout = isDesktop ? 'default' : layoutMode
  const [gridColumns, setGridColumns] = useState<1 | 2>(
    () => (Number(localStorage.getItem('postpress_grid_columns')) as 1 | 2) || 2
  )
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  const handleLayoutChange = (mode: 'default' | 'grid') => {
    setLayoutMode(mode)
    localStorage.setItem('postpress_layout_preference', mode)
  }
  const handleColumnsChange = (cols: 1 | 2) => {
    setGridColumns(cols)
    localStorage.setItem('postpress_grid_columns', String(cols))
  }

  // Track which specific task has been started per job: key = `${jobId}::${taskKey}`
  const [activeTaskKeys, setActiveTaskKeys] = useState<Set<string>>(new Set())

  // key = `${jobId}::${taskKey}::${itemIndex}`
  const startItem = (jobId: string, taskKey: string, itemIndex: number) => {
    setActiveTaskKeys(prev => new Set(prev).add(`${jobId}::${taskKey}::${itemIndex}`))
    // Record start time in taskLog
    recordPostPressTaskStart(jobId, taskKey, itemIndex).catch(() => {})
  }
  const isItemStarted = (jobId: string, taskKey: string, itemIndex: number) => {
    if (activeTaskKeys.has(`${jobId}::${taskKey}::${itemIndex}`)) return true
    const job = selectedJob?.jobId === jobId ? selectedJob : (previewJob?.jobId === jobId ? previewJob : null)
    if (job && job.taskLog) {
      return job.taskLog.some(
        (l: any) => l.task === taskKey && l.itemIndex === itemIndex && l.module === 'post_press' && !l.completedAt
      )
    }
    return false
  }
  const isTaskStarted = (jobId: string, taskKey: string) =>
    [...activeTaskKeys].some(k => k.startsWith(`${jobId}::${taskKey}::`))

  return (
    <div className="press-page">
      {/* ── Compact grid top bar (shown only in grid mode on mobile) ── */}
      {effectiveLayout === 'grid' ? (
        <MobileTopBarCompact
          title="Post Press"
          searchQuery={searchQuery}
          onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1) }}
          dateFilter={dateFilter}
          onDateChange={(v) => { setDateFilter(v); setCurrentPage(1) }}
          activeTab={mainView === 'incoming' ? 'incoming' : viewMode}
          onTabChange={(tab: CompactTab) => {
            if (tab === 'incoming') { setMainView('incoming'); setCurrentPage(1) }
            else if (tab === 'active') { setMainView('active'); setViewMode('active'); setCurrentPage(1) }
            else { setMainView('active'); setViewMode('history'); setCurrentPage(1) }
          }}
          showIncoming
          incomingCount={incomingCount}
          gridColumns={gridColumns}
          onGridColumnsChange={handleColumnsChange}
          onLayoutToggle={() => handleLayoutChange('default')}
        />
      ) : (
        <MobileTopBar
          title="Post Press"
          searchQuery={searchQuery}
          onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1) }}
          dateFilter={dateFilter}
          onDateChange={(v) => { setDateFilter(v); setCurrentPage(1) }}
          viewMode={viewMode}
          onViewModeChange={(v) => { setViewMode(v); setCurrentPage(1) }}
          mainView={mainView}
          onMainViewChange={(v) => { setMainView(v); setCurrentPage(1) }}
          layoutMode={layoutMode}
          onLayoutModeChange={handleLayoutChange}
          gridColumns={gridColumns}
          onGridColumnsChange={handleColumnsChange}
        />
      )}
      <div className="press-navbar">
        <div className="press-navbar-left">
          <h1 className="press-title">Post Press</h1>
          <div className="dashboard-tabs">
            {/* Main view: Incoming vs Active */}
            <button
              onClick={() => setMainView('incoming')}
              className={`dashboard-tab ${mainView === 'incoming' ? 'active' : ''}`}
              title="Incoming from Press"
              style={{ position: 'relative' }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" /></svg>
              <span className="tab-label">Incoming</span>
              {incomingCount > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, background: '#f59e0b', color: '#000', borderRadius: '50%', width: 16, height: 16, fontSize: '0.6rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {incomingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { setMainView('active'); setViewMode('active'); setCurrentPage(1) }}
              className={`dashboard-tab ${mainView === 'active' && viewMode === 'active' ? 'active' : ''}`}
              title="Active Jobs"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
              <span className="tab-label">Active</span>
            </button>
            <button
              onClick={() => { setMainView('active'); setViewMode('history'); setCurrentPage(1) }}
              className={`dashboard-tab ${mainView === 'active' && viewMode === 'history' ? 'active' : ''}`}
              title="Job History"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="tab-label">History</span>
            </button>
          </div>
          {viewMode === 'active' && (
            <span style={{ fontSize: '0.75rem', color: 'var(--press-text-muted)', marginLeft: '1rem' }}>
              Lamination → Binding → Fusing → Holes
            </span>
          )}
        </div>
        <div className="press-navbar-right">
          <ModuleNavigation />
          <UserMenu />
        </div>
      </div>
      <div className="press-filters-bar">
        <div className="press-header-actions">
          <div className="press-date-wrapper">
            <svg className="press-date-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <input
              type="date"
              className="press-date-input"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1) }}
            />
          </div>
          <div className="press-search-wrapper">
            <svg className="press-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="press-filter-input"
              placeholder="Search Job ID or Customer..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
            />
          </div>
          <div className="press-dropdown-wrapper">
            <select
              className="press-select-input"
              value={selectedTaskFilter}
              onChange={(e) => { setSelectedTaskFilter(e.target.value); setCurrentPage(1) }}
            >
              <option value="all">Task: All</option>
              {POST_PRESS_TASK_ORDER.map(task => (
                <option key={task} value={task}>{postPressStageLabel(task)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── INCOMING TAB ───────────────────────────────────────────────── */}
      {mainView === 'incoming' && (
        <>
        <div className={`press-table-container desktop-only-table`}>
          {incomingJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--press-text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🖨️</div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--press-text)' }}>No incoming jobs</div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>Jobs at Press that have Post Press tasks will appear here.</p>
            </div>
          ) : (
            <table className="press-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>S.No</th>
                  <th style={{ width: '72px' }}>Image</th>
                  <th style={{ width: '120px' }}>Job ID</th>
                  <th style={{ width: '160px' }}>Customer</th>
                  <th>Post Press Tasks</th>
                  <th style={{ width: '120px' }}>Status</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {incomingJobs.map((job: any, index: number) => {
                  const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => ['lamination', 'foil', 'binding', 'fusing', 'holes'].includes(item.activeStage)))
                  const items: any[] = job.items || []
                  // Collect unique post-press tasks across all items
                  const ppTasks: string[] = []
                  const POST_PRESS_LABELS: Record<string, string> = {
                    lamination: 'Lamination', binding: 'Binding', foil: 'Foil',
                    fusing: 'Fusing', holes: 'Holes'
                  }
                  for (const key of Object.keys(POST_PRESS_LABELS)) {
                    const hasTask = items.some((i: any) => i[key] && i[key] !== 'NONE')
                    if (hasTask) ppTasks.push(POST_PRESS_LABELS[key])
                  }
                  // Check if press is now done (job moved to post-press queue)
                  const allPressConfirmed = items.length > 0 && items.every((i: any) => i.printConfirmed === true)
                  const isReady = allPressConfirmed

                  return (
                    <tr key={job.jobId} className="press-row" style={{ cursor: 'pointer' }} onClick={() => setPreviewJob(job)}>
                      <td><span style={{ fontWeight: 600, color: 'var(--press-text-muted)' }}>{index + 1}</span></td>
                      <td>
                        <div className="press-item-preview-box" style={{ width: 56, height: 56, minWidth: 56 }}>
                          {thumb ? (
                            <img src={thumb} alt="" className="press-item-preview-img" loading="lazy" />
                          ) : (
                            <span style={{ fontSize: '0.625rem', color: 'var(--press-text-muted)' }}>--</span>
                          )}
                        </div>
                      </td>
                      <td><span style={{ fontWeight: 800 }}>{job.jobId}</span></td>
                      <td><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{job.customerName}</span></td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                          {ppTasks.map(t => (
                            <span key={t} style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: '4px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>{t}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {isReady ? (
                          <span className="status-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
                            ✅ Ready
                          </span>
                        ) : (
                          <span className="status-badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                            🖨️ At Press
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="press-btn-view"
                          disabled={!isReady}
                          title={!isReady ? 'Waiting for Press to finish' : 'Go to active Post Press queue'}
                          onClick={(e) => { e.stopPropagation(); setMainView('active'); setViewMode('active'); setCurrentPage(1) }}
                          style={{
                            opacity: isReady ? 1 : 0.45,
                            cursor: isReady ? 'pointer' : 'not-allowed',
                            background: isReady ? '#22c55e' : undefined,
                            color: isReady ? '#fff' : undefined,
                            borderColor: isReady ? '#22c55e' : undefined,
                          }}
                        >
                          {isReady ? 'Get Job →' : 'Waiting...'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile view for incoming jobs */}
        <div className="incoming-mobile-list">
            {incomingJobs.length === 0 ? (
              <div className="mobile-job-card">
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--press-text)' }}>
                  No incoming jobs
                </div>
                <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--press-text-muted)' }}>
                  Jobs at Press that have Post Press tasks will appear here.
                </p>
              </div>
            ) : incomingJobs.map((job: any, index: number) => {
              const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => ['lamination', 'foil', 'binding', 'fusing', 'holes'].includes(item.activeStage)))
              const items: any[] = job.items || []
              const ppTasks: string[] = []
              const POST_PRESS_LABELS: Record<string, string> = {
                lamination: 'Lamination', binding: 'Binding', foil: 'Foil',
                fusing: 'Fusing', holes: 'Holes'
              }
              for (const key of Object.keys(POST_PRESS_LABELS)) {
                const hasTask = items.some((i: any) => i[key] && i[key] !== 'NONE')
                if (hasTask) ppTasks.push(POST_PRESS_LABELS[key])
              }
              const allPressConfirmed = items.length > 0 && items.every((i: any) => i.printConfirmed === true)
              const isReady = allPressConfirmed

              return (
                <div key={`incoming-mob-${job.jobId}-${index}`} className="mobile-job-card" onClick={() => setPreviewJob(job)}
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div className="mobile-job-card-head">
                    <div
                      className="mobile-job-thumb"
                      onClick={(e) => { e.stopPropagation(); if (thumb) setLightboxImg(thumb) }}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className="press-item-preview-img" loading="lazy" />
                      ) : (
                        <span style={{ fontSize: '0.625rem', color: 'var(--press-text-muted)' }}>--</span>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="mobile-job-id">#{job.jobId}</div>
                      <div className="mobile-job-customer">{job.customerName}</div>
                      <div className="mobile-job-index">S.No {index + 1}</div>
                    </div>
                  </div>
                  <div className="mobile-job-row" style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {ppTasks.map(t => (
                      <span key={t} style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: '4px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="mobile-job-row" style={{ marginTop: '0.5rem' }}>
                    {isReady ? (
                      <span className="status-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
                        ✅ Ready
                      </span>
                    ) : (
                      <span className="status-badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                        🖨️ At Press
                      </span>
                    )}
                  </div>
                  <div className="mobile-job-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="press-btn-view"
                      disabled={!isReady}
                      title={!isReady ? 'Waiting for Press to finish' : 'Go to active Post Press queue'}
                      onClick={(e) => { e.stopPropagation(); setMainView('active'); setViewMode('active'); setCurrentPage(1) }}
                      style={{
                        opacity: isReady ? 1 : 0.45,
                        cursor: isReady ? 'pointer' : 'not-allowed',
                        background: isReady ? '#22c55e' : undefined,
                        color: isReady ? '#fff' : undefined,
                        borderColor: isReady ? '#22c55e' : undefined,
                        width: '100%',
                      }}
                    >
                      {isReady ? 'Get Job →' : 'Waiting...'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── ACTIVE / HISTORY TAB ───────────────────────────────────────── */}
      {mainView === 'active' && (
        <>
        {isLoading && !responseData ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="dispatch-spinner"></div>
        </div>
      ) : (
        <>
          {layoutMode === 'default' && (
          <>
          <div className={`press-table-container desktop-only-table ${isPlaceholderData ? 'stale-search' : ''}`}>
            <table className="press-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>S.No</th>
                  <th style={{ width: '72px' }}>Image</th>
                  <th style={{ width: '120px' }}>Job ID</th>
                  <th style={{ width: '150px' }}>Customer</th>
                  <th>Description</th>
                  <th style={{ width: '150px' }}>Submitted By</th>
                  {viewMode === 'history' ? (
                    <th style={{ width: '140px' }}>Completed At</th>
                  ) : (
                    <th style={{ width: '180px', textAlign: 'right' }}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--press-text-muted)' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--press-text)' }}>
                        {viewMode === 'history' ? 'No history found' : 'Post press queue is clear'}
                      </div>
                      <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
                        {viewMode === 'history'
                          ? 'No completed post press jobs found for the selected filters.'
                          : 'No jobs waiting for lamination, creasing, or binding.'}
                      </p>
                    </td>
                  </tr>
                ) : jobs.map((job: any, index: number) => {
                  const postPressTasks = viewMode === 'active' ? getJobPostPressTasks(job) : []
                  // const stage = activeStage(job)
                  const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => ['lamination', 'foil', 'binding', 'fusing', 'holes'].includes(item.activeStage)))

                  // Build status tracker summary for history view
                  /*
                  const allTasksDone = (job.items || []).every((item: any) =>
                    ['laminationStatus', 'creasingStatus', 'bindingStatus', 'dieCuttingStatus', 'cornerCuttingStatus']
                      .every((k) => item[k] === 'NONE' || item[k] === 'COMPLETED')
                  )
                  */

                  const isAnyTaskStarted = postPressTasks.some(t => isTaskStarted(job.jobId, t.key))

                  return (
                    <tr
                      key={job.jobId}
                      className="press-row"
                      onClick={() => openModal(job)}
                      style={{
                        cursor: 'pointer',
                        background: isAnyTaskStarted ? '#f0fdf4' : undefined,
                        borderLeft: isAnyTaskStarted ? '3px solid #22c55e' : undefined,
                        transition: 'background 0.2s ease',
                      }}
                    >
                      <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="press-item-preview-box" style={{ width: 56, height: 56, minWidth: 56 }} onClick={() => openModal(job)}>
                          {thumb ? (
                            <img src={thumb} alt="" className="press-item-preview-img" loading="lazy" />
                          ) : (
                            <span style={{ fontSize: '0.625rem', color: 'var(--press-text-muted)' }}>--</span>
                          )}
                        </div>
                      </td>
                      <td><span style={{ fontWeight: 800 }}>{job.jobId}</span></td>
                      <td><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{job.customerName}</span></td>
                      <td><span className="press-description-pill">{job.jobDescription}</span></td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.82rem' }}>
                          {job.createdBy?.name || '--'}
                        </span>
                      </td>
                      {viewMode === 'history' ? (
                        <td style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {job.ppsCompletedAt
                            ? new Date(job.ppsCompletedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : job.updatedAt
                              ? new Date(job.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                              : '—'}
                        </td>
                      ) : (
                        <td className="press-actions-cell" style={{ textAlign: 'right', display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                          {postPressTasks.length > 0 ? (
                            postPressTasks.map(task => (
                              <button
                                key={task.key}
                                type="button"
                                className="press-btn-view"
                                onClick={() => openModal(job, task.key)}
                                style={{
                                  background: isTaskStarted(job.jobId, task.key) ? '#16a34a' : '#0f172a',
                                  color: '#fff',
                                  borderColor: isTaskStarted(job.jobId, task.key) ? '#16a34a' : '#0f172a',
                                  display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700,
                                }}
                              >
                                <svg width="11" height="11" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                </svg>
                                {task.label}
                              </button>
                            ))
                          ) : (
                            <span className="press-action-empty">No action</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mobile-job-list">
            {jobs.length === 0 ? (
              <div className="mobile-job-card">
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--press-text)' }}>
                  {viewMode === 'history' ? 'No history found' : 'Post press queue is clear'}
                </div>
                <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--press-text-muted)' }}>
                  {viewMode === 'history'
                    ? 'No completed post press jobs found for the selected filters.'
                    : 'No jobs waiting for lamination, creasing, binding, die cutting, or corner cutting.'}
                </p>
              </div>
            ) : jobs.map((job: any, index: number) => {
              const postPressTasks = viewMode === 'active' ? getJobPostPressTasks(job) : []
              // const stage = activeStage(job)
              const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => ['lamination', 'foil', 'binding', 'fusing', 'holes'].includes(item.activeStage)))

              const isAnyTaskStartedMob = postPressTasks.some(t => isTaskStarted(job.jobId, t.key))

              return (
                <div key={`mob-${job.jobId}-${index}`} className="mobile-job-card" onClick={() => openModal(job)}
                  style={{
                    background: isAnyTaskStartedMob ? '#f0fdf4' : undefined,
                    borderLeft: isAnyTaskStartedMob ? '3px solid #22c55e' : undefined,
                    transition: 'background 0.2s ease',
                  }}
                >
                  <div className="mobile-job-card-head">
                    <div
                      className="mobile-job-thumb"
                      onClick={(e) => { e.stopPropagation(); if (thumb) setLightboxImg(thumb) }}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className="press-item-preview-img" loading="lazy" />
                      ) : (
                        <span style={{ fontSize: '0.625rem', color: 'var(--press-text-muted)' }}>--</span>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="mobile-job-id">#{job.jobId}</div>
                      <div className="mobile-job-customer">{job.customerName}</div>
                      <div className="mobile-job-index">S.No {(currentPage - 1) * itemsPerPage + index + 1}</div>
                    </div>
                  </div>
                  <div className="mobile-job-desc">{job.jobDescription}</div>
                  <div className="mobile-job-row" style={{ flexWrap: 'wrap', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                      Submitted by: <strong>{job.createdBy?.name || '--'}</strong>
                    </span>
                    {viewMode === 'history' && job.ppsCompletedAt && (
                      <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: '0.5rem' }}>
                        {new Date(job.ppsCompletedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {viewMode === 'active' && (
                    <div className="mobile-job-actions" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                      {postPressTasks.length > 0 ? (
                        postPressTasks.map(task => (
                          <button
                            key={task.key}
                            type="button"
                            className="press-btn-view"
                            onClick={() => openModal(job, task.key)}
                            style={{
                              background: isTaskStarted(job.jobId, task.key) ? '#16a34a' : '#0f172a',
                              color: '#fff',
                              borderColor: isTaskStarted(job.jobId, task.key) ? '#16a34a' : '#0f172a',
                              display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700,
                            }}
                          >
                            <svg width="11" height="11" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                            {task.label}
                          </button>
                        ))
                      ) : (
                        <span className="press-action-empty">No action</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </>
          )}

          {effectiveLayout === 'grid' && (
            <div
              className="grid-image-layout"
              style={{ '--grid-cols': gridColumns } as React.CSSProperties}
            >
              {jobs.length === 0 ? (
                <div className="grid-empty-state">
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--press-text)' }}>
                    {viewMode === 'history' ? 'No history found' : 'Post press queue is clear'}
                  </div>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--press-text-muted)' }}>
                    No jobs for the selected filters.
                  </p>
                </div>
              ) : jobs.map((job: any) => {
                const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => ['lamination', 'foil', 'binding', 'fusing', 'holes'].includes(item.activeStage)))
                return (
                  <div
                    key={job.jobId}
                    data-columns={gridColumns}
                    className="gic-card"
                    onClick={() => setSelectedJob(job)}
                  >
                    <div
                      className="gic-image-area"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (thumb) setPreviewImageUrl(thumb)
                      }}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" loading="lazy" className="gic-img" />
                      ) : (
                        <div className="gic-placeholder">
                          <svg width="32" height="32" fill="none" stroke="#cbd5e1" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="gic-info">
                      <span className="gic-customer">{job.customerName}</span>
                      <span className="gic-jobid">#{job.jobId}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
        </>
      )}
      {mainView === 'active' && (
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      )}

      {previewJob && (
        <WorkflowJobDetailsModal
          job={previewJob}
          onClose={() => setPreviewJob(null)}
          workflowLabel="Incoming — Post Press"
          workflowTask={null}
          showLogs={false}
        />
      )}

      {selectedJob && (
        <WorkflowJobDetailsModal
          job={selectedJob}
          onClose={() => { setSelectedJob(null); setModalTask(null) }}
          workflowLabel={viewMode === 'history' ? 'Post Press (History)' : (modalTask ? postPressStageLabel(modalTask) : 'Post Press')}
          workflowTask={viewMode === 'active' ? modalTask : null}
          showAllItems={viewMode === 'history'}
          onCompleteItemTask={viewMode === 'active' ? (itemIndex, task, rollCode) => {
            const t = task as PostPressTask
            if (!isItemStarted(selectedJob.jobId, t, itemIndex)) {
              startItem(selectedJob.jobId, t, itemIndex)
            } else {
              handleCompleteItem(selectedJob.jobId, t, itemIndex, rollCode)
            }
          } : undefined}
          completingItemIndex={completingItemIndex}
          isCompleting={completeMutation.isPending}
          itemFilter={viewMode === 'active' ? (item) => getItemPostPressStage(item) !== null : undefined}
          startedItemIndexes={viewMode === 'active' && modalTask
            ? new Set(
                (selectedJob.items || [])
                  .map((_: any, idx: number) => idx)
                  .filter((idx: number) => isItemStarted(selectedJob.jobId, modalTask, idx))
              )
            : undefined}
          showLogs={false}
        />
      )}

      {/* ── Full-screen image lightbox ───────────────────────────── */}
      {lightboxImg && (
        <div className="mobile-img-lightbox" onClick={() => setLightboxImg(null)}>
          <div className="mobile-img-lightbox-frame" onClick={(e) => e.stopPropagation()}>
            <button className="mobile-img-lightbox-close" onClick={() => setLightboxImg(null)}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img src={lightboxImg} alt="Job preview" className="mobile-img-lightbox-img" />
            <span className="mobile-img-lightbox-hint">Tap outside to close</span>
          </div>
        </div>
      )}

      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'zoom-out',
          }}
        >
          <img
            src={previewImageUrl}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
          />
          <button
            onClick={() => setPreviewImageUrl(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', fontSize: '1.5rem', width: 44, height: 44,
              borderRadius: '50%', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>
      )}
    </div>
  )
}
