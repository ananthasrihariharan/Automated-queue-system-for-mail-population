import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ModuleNavigation from '@core/components/ModuleNavigation'
import Pagination from '@core/components/Pagination'
import UserMenu from '@core/components/UserMenu'
import WorkflowJobDetailsModal, { firstItemScreenshot, jobThumbnailUrl } from '@core/components/WorkflowJobDetailsModal'

import { completeFinishingTask, fetchFinishingJobs, fetchFinishingHistory, fetchProfile, fetchIncomingFinishingJobs, recordFinishingTaskStart } from '@core/services/api'
import { isPressConfirmedItem } from '@core/utils/workflowStages'
import MobileTopBar from '@core/components/MobileTopBar'
import MobileTopBarCompact, { type CompactTab } from '@core/components/MobileTopBarCompact'
import { useQueueSocket } from '@core/hooks/useQueueSocket'
import { useAuth } from '@core/hooks/useAuth'
import {
  type FinishingTask,
  type FinishingSubRole,
  FINISHING_ROLE_CONFIG,
  getApiTaskFilter,
  getFinishingLoginPath,
  getFinishingSubRoles,
  getLockedTasks,
  getStationLabel,
  itemMatchesFinishingTasks,
  jobMatchesFinishingRoles,
  normalizeRoles,
} from '@core/utils/finishingRoles'
import '@modules/press/frontend/PressDashboard.css'

const TASK_LABELS: Record<FinishingTask, string> = {
  all: 'All',
  cutting: 'Cutting',
  dieCutting: 'Die Cutting',
  creasing: 'Creasing',
  cornerCutting: 'Corner Cutting',
  cutting2: 'Cutting 2',
}

/**
 * Returns finishing tasks that are currently active on this job.
 * Each item independently tracks its own activeStage, so a job with
 * mixed item types (e.g. binding-flow + pouch) shows ALL ready tasks.
 */
const getJobFinishingTasks = (job: any) => {
  const tasks: { key: string; label: string; pending: number; total: number }[] = []
  const items: any[] = job.items || []

  const TASK_ORDER = ['creasing', 'cutting', 'dieCutting', 'cornerCutting', 'cutting2']
  const TASK_LABEL_MAP: Record<string, string> = {
    cutting: 'Cutting', creasing: 'Creasing',
    dieCutting: 'Die Cutting', cornerCutting: 'Corner Cutting',
    cutting2: 'Cutting 2',
  }

  for (const key of TASK_ORDER) {
    const readyNow = items.filter((i: any) => isPressConfirmedItem(i) && i.activeStage === key).length
    if (readyNow > 0) {
      tasks.push({ key, label: TASK_LABEL_MAP[key], pending: readyNow, total: readyNow })
    }
  }
  return tasks
}

export default function FinishingDashboard() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const userRoles = normalizeRoles(user?.roles || [])
  const allLockedTasks = getLockedTasks(userRoles)
  const finishingSubRoles = getFinishingSubRoles(userRoles)

  // Station switcher: 'all' = combined view, or a specific sub-role key
  const [activeSubRole, setActiveSubRole] = useState<FinishingSubRole | 'all'>('all')
  const showSwitcher = finishingSubRoles.length > 1

  // Derive effective tasks based on selected station
  const lockedTasks: FinishingTask[] = activeSubRole === 'all'
    ? allLockedTasks
    : FINISHING_ROLE_CONFIG[activeSubRole].tasks

  const [selectedTaskFilter, setSelectedTaskFilter] = useState<string>('all')

  const baseTaskFilter = activeSubRole === 'all'
    ? getApiTaskFilter(userRoles)
    : FINISHING_ROLE_CONFIG[activeSubRole].tasks.join(',')

  const taskFilter = selectedTaskFilter === 'all' ? baseTaskFilter : selectedTaskFilter

  const isLocked = !lockedTasks.includes('all')

  // Station label reflects active selection
  const effectiveStationLabel = activeSubRole === 'all'
    ? getStationLabel(userRoles)
    : `Finishing — ${FINISHING_ROLE_CONFIG[activeSubRole].label}`

  // Refresh roles from server — localStorage may be stale after admin adds roles
  useEffect(() => {
    let cancelled = false
    fetchProfile()
      .then((profile) => {
        if (cancelled) return
        const freshRoles = normalizeRoles(profile.roles || [])
        const currentRoles = normalizeRoles(user?.roles || [])
        const rolesChanged =
          freshRoles.length !== currentRoles.length ||
          freshRoles.some((r, i) => r !== currentRoles[i])
        if (rolesChanged) {
          updateUser({ ...user, ...profile, roles: freshRoles })
        }
        const subRoles = getFinishingSubRoles(freshRoles)
        const combinedPath = getFinishingLoginPath(freshRoles)
        if (subRoles.length > 1 && location.pathname !== combinedPath) {
          navigate(combinedPath, { replace: true })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active')

  // Adjust dateFilter default when switching between active queue and history
  useEffect(() => {
    if (viewMode === 'active') {
      setDateFilter('')
    } else {
      setDateFilter(new Date().toISOString().split('T')[0])
    }
    setCurrentPage(1)
  }, [viewMode])

  const handleSubRoleSwitch = (role: FinishingSubRole | 'all') => {
    setActiveSubRole(role)
    setSelectedTaskFilter('all')
    setCurrentPage(1)
  }

  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  const matchesLockedTask = (taskKey: string) =>
    lockedTasks.includes('all') || lockedTasks.includes(taskKey as FinishingTask)
  // Ref so the socket handler (stale closure) can always see the current selectedJob
  const selectedJobRef = useRef<any | null>(null)
  useEffect(() => { selectedJobRef.current = selectedJob }, [selectedJob])
  const itemsPerPage = 50
  const queryClient = useQueryClient()

  // Real-time update integration using shared socket hook
  const { socket } = useQueueSocket('staff')

  useEffect(() => {
    if (!socket) return
    const handleWorkflowUpdate = async () => {
      // Refetch the list immediately so cache is fresh
      await queryClient.refetchQueries({
        queryKey: ['finishing-jobs', viewMode, taskFilter, currentPage, dateFilter, searchQuery]
      })
      queryClient.invalidateQueries({ queryKey: ['post-press-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['press-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['dispatch-jobs'] })

      // If a modal is open, push fresh job data into it without requiring close/reopen
      if (selectedJobRef.current) {
        const fresh = queryClient.getQueryData<any>(
          ['finishing-jobs', viewMode, taskFilter, currentPage, dateFilter, searchQuery]
        )
        const updatedJob = fresh?.jobs?.find((j: any) => j.jobId === selectedJobRef.current.jobId)
        if (updatedJob) setSelectedJob(updatedJob)
        else setSelectedJob(null) // job left the queue
      }
    }
    socket.on('workflow:updated', handleWorkflowUpdate)
    return () => {
      socket.off('workflow:updated', handleWorkflowUpdate)
    }
  }, [socket, queryClient, viewMode, taskFilter, currentPage, dateFilter, searchQuery])

  const { data: responseData, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['finishing-jobs', viewMode, taskFilter, currentPage, dateFilter, searchQuery],
    queryFn: () =>
      viewMode === 'history'
        ? fetchFinishingHistory(currentPage, itemsPerPage, dateFilter, searchQuery, taskFilter)
        : fetchFinishingJobs(currentPage, itemsPerPage, dateFilter, searchQuery, taskFilter),
    refetchInterval: false,
    placeholderData: (previousData: any) => previousData,
  })

  const completeMutation = useMutation({
    mutationFn: ({ jobId, itemIndex, taskType }: { jobId: string; itemIndex?: number; taskType: string }) =>
      completeFinishingTask(jobId, itemIndex, taskType),
    onSuccess: async () => {
      // Refetch and then sync the open modal with fresh job data
      await queryClient.refetchQueries({ queryKey: ['finishing-jobs', viewMode, taskFilter, currentPage, dateFilter, searchQuery] })
      queryClient.invalidateQueries({ queryKey: ['post-press-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['dispatch-jobs'] })
      const fresh = queryClient.getQueryData<any>(['finishing-jobs', viewMode, taskFilter, currentPage, dateFilter, searchQuery])
      const updatedJob = fresh?.jobs?.find((j: any) => j.jobId === selectedJob?.jobId)
      if (updatedJob) {
        setSelectedJob(updatedJob)
      } else {
        setSelectedJob(null)
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || ''
      if (msg.includes('No pending') || msg.includes('already') || err.response?.status === 400) {
        setSelectedJob(null)
        queryClient.invalidateQueries({ queryKey: ['finishing-jobs'] })
        queryClient.invalidateQueries({ queryKey: ['dispatch-jobs'] })
      } else {
        alert(msg || 'Failed to complete task.')
      }
    }
  })

  const jobs = (responseData?.jobs || []).filter((job: any) =>
    jobMatchesFinishingRoles(job, lockedTasks, viewMode, getJobFinishingTasks)
  )
  const totalPages = responseData?.pages || 1

  const allowedWorkflowKeys = isLocked
    ? lockedTasks.filter((t): t is Exclude<FinishingTask, 'all'> => t !== 'all')
    : undefined

  // Group jobs by customer to prevent "Flow Collapse"
  const groupedJobs = jobs.reduce((acc: any, job: any) => {
    const key = job.customerName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {});

  const [layoutMode, setLayoutMode] = useState<'default' | 'grid'>(
    () => (localStorage.getItem('finishing_layout_preference') as 'default' | 'grid') ?? 'default'
  )
  const [gridColumns, setGridColumns] = useState<1 | 2>(
    () => (Number(localStorage.getItem('finishing_grid_columns')) as 1 | 2) || 2
  )
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  // On desktop (≥768px) always show table layout regardless of saved preference
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768)
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const effectiveLayout = isDesktop ? 'default' : layoutMode

  // Incoming view — show jobs still at press with finishing tasks
  const [mainView, setMainView] = useState<'incoming' | 'active'>('active')
  const incomingTaskFilter = getApiTaskFilter(userRoles)
  const { data: incomingData } = useQuery({
    queryKey: ['finishing-incoming', incomingTaskFilter, searchQuery],
    queryFn: () => fetchIncomingFinishingJobs(1, 50, '', searchQuery, incomingTaskFilter),
    refetchInterval: false,
    placeholderData: (previousData: any) => previousData,
  })
  const incomingJobs: any[] = incomingData?.jobs || []
  const incomingCount = incomingJobs.length

  const handleLayoutChange = (mode: 'default' | 'grid') => {
    setLayoutMode(mode)
    localStorage.setItem('finishing_layout_preference', mode)
  }
  const handleColumnsChange = (cols: 1 | 2) => {
    setGridColumns(cols)
    localStorage.setItem('finishing_grid_columns', String(cols))
  }

  const [completingItemIndex, setCompletingItemIndex] = useState<number | null>(null)
  const [lightboxImg, setLightboxImg] = useState<string | null>(null)

  // Per-item start tracking: key = `${jobId}::${taskKey}::${itemIndex}`
  const [activeTaskKeys, setActiveTaskKeys] = useState<Set<string>>(new Set())
  const startItem = (jobId: string, taskKey: string, itemIndex: number) => {
    setActiveTaskKeys(prev => new Set(prev).add(`${jobId}::${taskKey}::${itemIndex}`))
    recordFinishingTaskStart(jobId, taskKey, itemIndex).catch(() => {})
  }
  const isItemStarted = (jobId: string, taskKey: string, itemIndex: number) => {
    if (activeTaskKeys.has(`${jobId}::${taskKey}::${itemIndex}`)) return true
    const job = selectedJob?.jobId === jobId ? selectedJob : null
    if (job && job.taskLog) {
      return job.taskLog.some(
        (l: any) => l.task === taskKey && l.itemIndex === itemIndex && l.module === 'finishing' && !l.completedAt
      )
    }
    return false
  }
  const isTaskStarted = (jobId: string, taskKey: string) =>
    [...activeTaskKeys].some(k => k.startsWith(`${jobId}::${taskKey}::`))


  const handleCompleteItem = (jobId: string, itemIndex: number, taskType: string) => {
    setCompletingItemIndex(itemIndex)
    completeMutation.mutate(
      { jobId, itemIndex, taskType },
      { onSettled: () => setCompletingItemIndex(null) }
    )
  }

  type ActiveFinishingTask = Exclude<FinishingTask, 'all'>

  const getModalWorkflowTask = (job: any): ActiveFinishingTask | null => {
    if (viewMode === 'history') return null
    const tasks = getJobFinishingTasks(job).filter(t => t.pending > 0 && matchesLockedTask(t.key))
    const key = tasks[0]?.key as ActiveFinishingTask | undefined
    return key ?? null
  }

  const getModalTaskType = (job: any, task: any) => {
    if (task) return task
    const tasks = getJobFinishingTasks(job).filter(t => t.pending > 0 && matchesLockedTask(t.key))
    return tasks[0]?.key || 'cutting'
  }

  return (
    <div className="press-page">
      {/* ── Compact grid top bar (shown only in grid mode on mobile) ── */}
      {effectiveLayout === 'grid' ? (
        <MobileTopBarCompact
          title="Finishing"
          searchQuery={searchQuery}
          onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1) }}
          dateFilter={dateFilter}
          onDateChange={(v) => { setDateFilter(v); setCurrentPage(1) }}
          activeTab={mainView === 'incoming' ? 'incoming' : viewMode}
          onTabChange={(tab: CompactTab) => {
            if (tab === 'incoming') { setMainView('incoming') }
            else if (tab === 'active') { setMainView('active'); setViewMode('active'); setCurrentPage(1) }
            else if (tab === 'history') { setMainView('active'); setViewMode('history'); setCurrentPage(1) }
          }}
          showIncoming
          incomingCount={incomingCount}
          gridColumns={gridColumns}
          onGridColumnsChange={handleColumnsChange}
          onLayoutToggle={() => handleLayoutChange('default')}
          stationSwitcher={
            showSwitcher ? (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleSubRoleSwitch('all')}
                  style={{
                    fontSize: '0.8rem', fontWeight: 700, padding: '0.35rem 0.9rem',
                    borderRadius: '999px', border: '2px solid', cursor: 'pointer',
                    borderColor: activeSubRole === 'all' ? '#3730a3' : '#c7d2fe',
                    background: activeSubRole === 'all' ? '#3730a3' : '#fff',
                    color: activeSubRole === 'all' ? '#fff' : '#3730a3',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}
                >All</button>
                {finishingSubRoles.map((role) => (
                  <button
                    key={role}
                    onClick={() => handleSubRoleSwitch(role)}
                    style={{
                      fontSize: '0.8rem', fontWeight: 700, padding: '0.35rem 0.9rem',
                      borderRadius: '999px', border: '2px solid', cursor: 'pointer',
                      borderColor: activeSubRole === role ? '#3730a3' : '#c7d2fe',
                      background: activeSubRole === role ? '#3730a3' : '#fff',
                      color: activeSubRole === role ? '#fff' : '#3730a3',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}
                  >
                    {FINISHING_ROLE_CONFIG[role].label}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        />
      ) : (
        <MobileTopBar
          title="Finishing"
          searchQuery={searchQuery}
          onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1) }}
          dateFilter={dateFilter}
          onDateChange={(v) => { setDateFilter(v); setCurrentPage(1) }}
          viewMode={viewMode}
          onViewModeChange={(v) => { setMainView('active'); setViewMode(v); setCurrentPage(1) }}
          mainView={mainView}
          onMainViewChange={(v) => { setMainView(v); if (v === 'active') setCurrentPage(1) }}
          layoutMode={layoutMode}
          onLayoutModeChange={handleLayoutChange}
          gridColumns={gridColumns}
          onGridColumnsChange={handleColumnsChange}
          stationSwitcher={
            showSwitcher ? (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleSubRoleSwitch('all')}
                  style={{
                    fontSize: '0.8rem', fontWeight: 700, padding: '0.35rem 0.9rem',
                    borderRadius: '999px', border: '2px solid', cursor: 'pointer',
                    borderColor: activeSubRole === 'all' ? '#3730a3' : '#c7d2fe',
                    background: activeSubRole === 'all' ? '#3730a3' : '#fff',
                    color: activeSubRole === 'all' ? '#fff' : '#3730a3',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}
                >All</button>
                {finishingSubRoles.map((role) => (
                  <button
                    key={role}
                    onClick={() => handleSubRoleSwitch(role)}
                    style={{
                      fontSize: '0.8rem', fontWeight: 700, padding: '0.35rem 0.9rem',
                      borderRadius: '999px', border: '2px solid', cursor: 'pointer',
                      borderColor: activeSubRole === role ? '#3730a3' : '#c7d2fe',
                      background: activeSubRole === role ? '#3730a3' : '#fff',
                      color: activeSubRole === role ? '#fff' : '#3730a3',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}
                  >
                    {FINISHING_ROLE_CONFIG[role].label}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        />
      )}
      <div className="press-navbar">
        <div className="press-navbar-left">
          <h1 className="press-title">
            {effectiveStationLabel}
          </h1>
          <div className="dashboard-tabs">
            {/* Incoming tab */}
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
        </div>
        <div className="press-navbar-right">
          <ModuleNavigation />
          <UserMenu />
        </div>
      </div>

      {showSwitcher && (
        <div className="desktop-only-switcher" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: '0 1.25rem 0.75rem' }}>
          {/* ALL button */}
          <button
            onClick={() => handleSubRoleSwitch('all')}
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.28rem 0.75rem',
              borderRadius: '999px',
              border: '2px solid',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              borderColor: activeSubRole === 'all' ? '#3730a3' : '#c7d2fe',
              background: activeSubRole === 'all' ? '#3730a3' : '#fff',
              color: activeSubRole === 'all' ? '#fff' : '#3730a3',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            All
          </button>
          {/* One button per sub-role the user actually has */}
          {finishingSubRoles.map((role) => (
            <button
              key={role}
              onClick={() => handleSubRoleSwitch(role)}
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.28rem 0.75rem',
                borderRadius: '999px',
                border: '2px solid',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                borderColor: activeSubRole === role ? '#3730a3' : '#c7d2fe',
                background: activeSubRole === role ? '#3730a3' : '#fff',
                color: activeSubRole === role ? '#fff' : '#3730a3',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {FINISHING_ROLE_CONFIG[role].label}
            </button>
          ))}
        </div>
      )}

      {/* Single-role passive badge (no switcher needed) */}
      {!showSwitcher && isLocked && finishingSubRoles.length > 0 && (
        <div className="desktop-only-switcher" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: '0 1.25rem 0.75rem' }}>
          {lockedTasks.filter((t): t is Exclude<FinishingTask, 'all'> => t !== 'all').map((task) => (
            <span
              key={task}
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.25rem 0.65rem',
                borderRadius: '999px',
                background: '#e0e7ff',
                color: '#3730a3',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              {TASK_LABELS[task]}
            </span>
          ))}
        </div>
      )}

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
              {(lockedTasks.includes('all')
                ? (['cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2'] as FinishingTask[])
                : (lockedTasks.filter(t => t !== 'all') as FinishingTask[])
              ).map(task => (
                <option key={task} value={task}>{TASK_LABELS[task]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── INCOMING TAB ─────────────────────────────────────────────────── */}
      {mainView === 'incoming' && (
        <div className="tab-content-block">
          <div className="press-table-container desktop-only-table">
            {incomingJobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--press-text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✂️</div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--press-text)' }}>No incoming jobs</div>
                <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
                  Jobs at Press that have finishing tasks ({incomingTaskFilter === 'all' ? 'cutting, creasing, die cutting, corner cutting' : incomingTaskFilter.replace(/,/g, ', ')}) will appear here.
                </p>
              </div>
            ) : (
              <table className="press-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>S.No</th>
                    <th style={{ width: '72px' }}>Image</th>
                    <th style={{ width: '120px' }}>Job ID</th>
                    <th style={{ width: '160px' }}>Customer</th>
                    <th>Finishing Tasks</th>
                    <th style={{ width: '120px' }}>Status</th>
                    <th style={{ width: '140px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {incomingJobs.map((job: any, index: number) => {
                    const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => ['cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2', 'holes'].includes(item.activeStage)))
                    const items: any[] = job.items || []
                    const FINISHING_LABELS: Record<string, string> = {
                      cutting: 'Cutting', cutting2: 'Cutting 2',
                      dieCutting: 'Die Cutting', creasing: 'Creasing', cornerCutting: 'Corner Cut'
                    }
                    const finTasks: string[] = []
                    for (const key of Object.keys(FINISHING_LABELS)) {
                      const hasTask = items.some((i: any) => i[key] && i[key] !== 'NONE')
                      if (hasTask) finTasks.push(FINISHING_LABELS[key])
                    }
                    const allPressConfirmed = items.length > 0 && items.every((i: any) => i.printConfirmed === true)
                    const isReady = allPressConfirmed
                    return (
                      <tr key={job.jobId} className="press-row" style={{ cursor: 'pointer' }}>
                        <td><span style={{ fontWeight: 600, color: 'var(--press-text-muted)' }}>{index + 1}</span></td>
                        <td>
                          <div className="press-item-preview-box" style={{ width: 56, height: 56, minWidth: 56 }}>
                            {thumb ? <img src={thumb} alt="" className="press-item-preview-img" loading="lazy" /> : <span style={{ fontSize: '0.625rem', color: 'var(--press-text-muted)' }}>--</span>}
                          </div>
                        </td>
                        <td><span style={{ fontWeight: 800 }}>{job.jobId}</span></td>
                        <td><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{job.customerName}</span></td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                            {finTasks.map(t => (
                              <span key={t} style={{ background: '#dcfce7', color: '#166534', borderRadius: '4px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>{t}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {isReady ? (
                            <span className="status-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>✅ Ready</span>
                          ) : (
                            <span className="status-badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>🖨️ At Press</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="press-btn-view"
                            disabled={!isReady}
                            title={!isReady ? 'Waiting for Press to finish' : 'Go to active Finishing queue'}
                            onClick={() => { setMainView('active'); setViewMode('active'); setCurrentPage(1) }}
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

          {/* Mobile incoming list */}
          <div className="incoming-mobile-list">
            {incomingJobs.length === 0 ? (
              <div className="mobile-job-card">
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--press-text)' }}>No incoming jobs</div>
                <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--press-text-muted)' }}>
                  Jobs at Press with finishing tasks will appear here.
                </p>
              </div>
            ) : incomingJobs.map((job: any, index: number) => {
              const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => ['cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2', 'holes'].includes(item.activeStage)))
              const items: any[] = job.items || []
              const FINISHING_LABELS: Record<string, string> = { cutting: 'Cutting', cutting2: 'Cutting 2', dieCutting: 'Die Cutting', creasing: 'Creasing', cornerCutting: 'Corner Cut' }
              const finTasks: string[] = []
              for (const key of Object.keys(FINISHING_LABELS)) {
                if (items.some((i: any) => i[key] && i[key] !== 'NONE')) finTasks.push(FINISHING_LABELS[key])
              }
              const isReady = items.length > 0 && items.every((i: any) => i.printConfirmed === true)
              return (
                <div key={`inc-${job.jobId}-${index}`} className="mobile-job-card" style={{ cursor: 'pointer' }}>
                  <div className="mobile-job-card-head">
                    <div className="mobile-job-thumb">
                      {thumb ? <img src={thumb} alt="" className="press-item-preview-img" loading="lazy" /> : <span style={{ fontSize: '0.625rem', color: 'var(--press-text-muted)' }}>--</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="mobile-job-id">#{job.jobId}</div>
                      <div className="mobile-job-customer">{job.customerName}</div>
                      <div className="mobile-job-index">S.No {index + 1}</div>
                    </div>
                  </div>
                  <div className="mobile-job-row" style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {finTasks.map(t => <span key={t} style={{ background: '#dcfce7', color: '#166534', borderRadius: '4px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>{t}</span>)}
                  </div>
                  <div className="mobile-job-row" style={{ marginTop: '0.5rem' }}>
                    {isReady ? (
                      <span className="status-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>✅ Ready</span>
                    ) : (
                      <span className="status-badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>🖨️ At Press</span>
                    )}
                  </div>
                  <div className="mobile-job-actions" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="press-btn-view"
                      disabled={!isReady}
                      onClick={() => { setMainView('active'); setViewMode('active'); setCurrentPage(1) }}
                      style={{ opacity: isReady ? 1 : 0.45, cursor: isReady ? 'pointer' : 'not-allowed', background: isReady ? '#22c55e' : undefined, color: isReady ? '#fff' : undefined, borderColor: isReady ? '#22c55e' : undefined, width: '100%' }}
                    >
                      {isReady ? 'Get Job →' : 'Waiting...'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── ACTIVE / HISTORY ─────────────────────────────────────────────── */}
      {mainView === 'active' && (
      <div className="tab-content-block">
      {isLoading && !responseData ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="dispatch-spinner"></div>
        </div>
      ) : (
        <>
          {viewMode === 'history' && (
            <div style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#ffffff',
              borderRadius: '12px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {user?.roles?.includes('ADMIN') ? 'Total Cutting Today' : 'Your Total Cutting Today'}
                </p>
                <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.125rem', fontWeight: 800 }}>Finishing Productivity Summary</h3>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '2.25rem', fontWeight: 900, lineHeight: 1 }}>{responseData?.totalCutting || 0}</span>
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, marginTop: '0.25rem' }}>TOTAL CUTS</span>
              </div>
            </div>
          )}

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
                  {viewMode === 'history' && (
                    <th style={{ width: '120px' }}>Cutting Total</th>
                  )}
                  {viewMode === 'history' ? (
                    <th style={{ width: '140px' }}>Completed At</th>
                  ) : (
                    <th style={{ width: '200px', textAlign: 'right' }}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={viewMode === 'history' ? 8 : 7} style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--press-text-muted)' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--press-text)' }}>
                        {viewMode === 'history' ? 'No history found' : 'Finishing queue is clear'}
                      </div>
                      <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
                        {viewMode === 'history'
                          ? 'No completed finishing jobs found for the selected filters.'
                          : `No jobs waiting for ${isLocked ? lockedTasks.filter(t => t !== 'all').map(t => TASK_LABELS[t]).join(', ') : 'cutting, die cutting, creasing, or corner cutting'}.`}
                      </p>
                    </td>
                  </tr>
                ) : Object.keys(groupedJobs).map((customer) => (
                  groupedJobs[customer].map((job: any, index: number) => {
                    const allFinishingTasks = getJobFinishingTasks(job)
                    const finishingTasks = (lockedTasks.includes('all')
                       ? allFinishingTasks
                       : allFinishingTasks.filter(t => matchesLockedTask(t.key))
                    ).filter(t => t.pending > 0)
                    const currentTask = finishingTasks[0] ?? null
                    const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => ['cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2', 'holes'].includes(item.activeStage)))

                    // Add a separator class if it's the start of a new customer batch
                    const isBatchStart = index === 0 && groupedJobs[customer].length > 1;

                    return (
                      <tr
                        key={job.jobId}
                        className={`press-row ${isBatchStart ? 'batch-border-top' : ''}`}
                        onClick={() => setSelectedJob(job)}
                        style={{
                          cursor: 'pointer',
                          borderLeft: groupedJobs[customer].length > 1 ? '4px solid #3b82f6' : isTaskStarted(job.jobId, currentTask?.key || '') ? '3px solid #22c55e' : 'none',
                          background: currentTask && isTaskStarted(job.jobId, currentTask.key) ? '#f0fdf4' : undefined,
                          transition: 'background 0.2s ease',
                        }}
                      >
                        <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="press-item-preview-box" style={{ width: 56, height: 56, minWidth: 56 }} onClick={() => setSelectedJob(job)}>
                            {thumb ? (
                              <img src={thumb} alt="" className="press-item-preview-img" loading="lazy" />
                            ) : (
                              <span style={{ fontSize: '0.625rem', color: 'var(--press-text-muted)' }}>--</span>
                            )}
                          </div>
                        </td>
                        <td><span style={{ fontWeight: 800 }}>{job.jobId}</span></td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#1d4ed8' }}>
                            {job.customerName}
                            {index === 0 && groupedJobs[customer].length > 1 && (
                              <span style={{ fontSize: '0.7rem', marginLeft: '8px', padding: '2px 6px', background: '#dbeafe', borderRadius: '4px' }}>
                                BATCH OF {groupedJobs[customer].length}
                              </span>
                            )}
                          </span>
                        </td>
                        <td><span className="press-description-pill">{job.jobDescription}</span></td>
                        <td>
                          <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.82rem' }}>
                            {job.createdBy?.name || '--'}
                          </span>
                        </td>
                        {viewMode === 'history' && (
                          <td style={{ fontWeight: 700, color: '#334155', fontSize: '0.875rem' }}>
                            {job.cuttingTotal || 0}
                          </td>
                        )}
                        {viewMode === 'history' ? (
                          <td style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {job.finishingCompletedAt ? new Date(job.finishingCompletedAt).toLocaleDateString() : '—'}
                          </td>
                        ) : (
                          <td className="press-actions-cell" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            {finishingTasks.length > 0 ? (
                              finishingTasks.map(task => (
                                <button
                                  key={task.key}
                                  type="button"
                                  className="press-btn-view"
                                  onClick={() => setSelectedJob(job)}
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
                            ) : <span className="press-action-empty">No action</span>}
                          </td>
                        )}
                      </tr>
                    )
                  })
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-job-list">
            {jobs.length === 0 ? (
              <div className="mobile-job-card">
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--press-text)' }}>
                  {viewMode === 'history' ? 'No history found' : 'Finishing queue is clear'}
                </div>
              </div>
            ) : jobs.map((job: any, index: number) => {
              const allFinishingTasks = getJobFinishingTasks(job)
              const finishingTasks = (lockedTasks.includes('all')
                ? allFinishingTasks
                : allFinishingTasks.filter(t => matchesLockedTask(t.key))
              ).filter(t => t.pending > 0)
              const currentTask = finishingTasks[0] ?? null
              const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => ['cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2', 'holes'].includes(item.activeStage)))

              return (
                <div key={`mob-${job.jobId}-${index}`} className="mobile-job-card" onClick={() => setSelectedJob(job)}
                  style={{
                    background: currentTask && isTaskStarted(job.jobId, currentTask.key) ? '#f0fdf4' : undefined,
                    borderLeft: currentTask && isTaskStarted(job.jobId, currentTask.key) ? '3px solid #22c55e' : undefined,
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
                  <div className="mobile-job-row">
                    <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                      Submitted by: <strong>{job.createdBy?.name || '--'}</strong>
                    </span>
                    {viewMode === 'history' && job.finishingCompletedAt && (
                      <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: '0.5rem' }}>
                        {new Date(job.finishingCompletedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {viewMode === 'history' && (
                    <div className="mobile-job-row" style={{ marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                        Cuts Contributed: <strong>{job.cuttingTotal || 0}</strong>
                      </span>
                    </div>
                  )}
                  {viewMode === 'active' && finishingTasks.length > 0 && (
                    <div className="mobile-job-actions" onClick={(e) => e.stopPropagation()}>
                      {finishingTasks.map(task => (
                        <button
                          key={task.key}
                          type="button"
                          className="press-btn-view"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedJob(job) }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedJob(job) }}
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
                      ))}
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
                    {viewMode === 'history' ? 'No history found' : 'Finishing queue is clear'}
                  </div>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--press-text-muted)' }}>
                    No jobs for the selected filters.
                  </p>
                </div>
              ) : jobs.map((job: any) => {
                const thumb = jobThumbnailUrl(firstItemScreenshot(job, (item) => ['cutting', 'creasing', 'dieCutting', 'cornerCutting', 'cutting2', 'holes'].includes(item.activeStage)))
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
      </div>
      )}

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />

      {selectedJob && (
        <WorkflowJobDetailsModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          workflowLabel={viewMode === 'history' ? 'Finishing (Completed)' : getStationLabel(userRoles)}
          workflowTask={viewMode === 'active' ? getModalWorkflowTask(selectedJob) : null}
          showAllItems={viewMode === 'history'}
          allowedWorkflowKeys={allowedWorkflowKeys}
          onCompleteItemTask={viewMode === 'active'
            ? (itemIndex, task) => {
                const t = getModalTaskType(selectedJob, task)
                if (!isItemStarted(selectedJob.jobId, t, itemIndex)) {
                  startItem(selectedJob.jobId, t, itemIndex)
                } else {
                  handleCompleteItem(selectedJob.jobId, itemIndex, t)
                }
              }
            : undefined}
          completingItemIndex={completingItemIndex}
          showLogs={false}
          isCompleting={completeMutation.isPending}
          itemFilter={(item) => {
            if (!isPressConfirmedItem(item)) return false
            if (!isLocked) return true
            return itemMatchesFinishingTasks(item, lockedTasks, viewMode)
          }}
          startedItemIndexes={viewMode === 'active' && getModalWorkflowTask(selectedJob)
            ? new Set(
                (selectedJob.items || [])
                  .map((_: any, idx: number) => idx)
                  .filter((idx: number) => {
                    const modalTask = getModalWorkflowTask(selectedJob)
                    return modalTask ? isItemStarted(selectedJob.jobId, modalTask, idx) : false
                  })
              )
            : undefined}
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
