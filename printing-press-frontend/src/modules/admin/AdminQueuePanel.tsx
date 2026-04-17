import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData, useIsFetching } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { queueApi } from '../../services/queueApi'
import { useQueueSocket } from '../../hooks/useQueueSocket'
import UserMenu from '../../components/UserMenu'
import ModuleNavigation from '../../components/ModuleNavigation'
import { MessagingTray } from '../../shared/components/MessagingTray'
import LinkifiedText from '../../shared/components/LinkifiedText'
import { elapsed, formatSubject } from '../../shared/utils/queueHelpers'
import './AdminQueuePanel.css'

interface AdminJobsResponse {
  jobs: any[];
  total: number;
  pages: number;
  stats: any;
}

export default function AdminQueuePanel() {
  const queryClient = useQueryClient()
  const isFetching = useIsFetching()
  const [activeTab, setActiveTab] = useState<'QUEUED' | 'ASSIGNED' | 'COMPLETED' | 'ADMIN_REVIEW' | 'JUNK'>('QUEUED')
  const [page, setPage] = useState(1)
  
  // Search with debounce
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [assignedToFilter, setAssignedToFilter] = useState('')
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
  
  // Modal states
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [logSearch, setLogSearch] = useState('')
  const [selectedLogJob, setSelectedLogJob] = useState<any>(null)
  const [showJobAuditModal, setShowJobAuditModal] = useState<any>(null)
  const [showThreadHistoryModal, setShowThreadHistoryModal] = useState<string | null>(null)
  const [targetAssignments, setTargetAssignments] = useState<Record<string, string>>({})
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  
  const [showReassignModal, setShowReassignModal] = useState<any>(null)
  const [reassignTargetId, setReassignTargetId] = useState<string>('')
  const [reassignNotes, setReassignNotes] = useState<string>('')
  const [profile, setProfile] = useState<any>(null)
  const [showMessages, setShowMessages] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [chatSettings, setChatSettings] = useState<{ recipient: string, jobId: string, prefill: string }>({ recipient: 'ALL', jobId: '', prefill: '' })

  // Telemetry Detail Modals
  const [showLiveLoadDetail, setShowLiveLoadDetail] = useState(false)
  const [showDesignersDetail, setShowDesignersDetail] = useState(false)

  useEffect(() => {
    const user = localStorage.getItem('user')
    if (user) setProfile(JSON.parse(user))
  }, [])

  const BACKEND_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_BACKEND_URL || '')

  const isImage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')
  }

  // Handle Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
      setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchInput])

  // 1. Data Fetching
  const { data: queueData, isLoading: queueLoading } = useQuery<AdminJobsResponse>({
    queryKey: ['admin-queue-jobs', activeTab, page, debouncedSearch, assignedToFilter],
    queryFn: () => queueApi.getAdminJobs({ 
      status: activeTab, 
      page, 
      search: debouncedSearch || undefined, 
      assignedTo: assignedToFilter || undefined 
    }),
    placeholderData: keepPreviousData,
    refetchInterval: 10000
  })

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['admin-queue-sessions'],
    queryFn: queueApi.getAdminSessions,
    refetchInterval: 10000
  })

  const { data: requests } = useQuery({
    queryKey: ['admin-queue-requests'],
    queryFn: queueApi.getRequests,
    refetchInterval: 10000
  })

  const { data: staffList } = useQuery({
    queryKey: ['staff-list'],
    queryFn: queueApi.getStaffList
  })

  const { data: stats } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: queueApi.getQueueStats,
    refetchInterval: 30000
  })

  const { data: leaderboardData } = useQuery({
    queryKey: ['staff-leaderboard'],
    queryFn: queueApi.getStaffLeaderboard,
    enabled: showLeaderboard,
    refetchInterval: showLeaderboard ? 30000 : false
  })

  const { data: eventLogs } = useQuery({
    queryKey: ['admin-queue-logs'],
    queryFn: () => queueApi.getEventLog(100), 
    enabled: showLogsModal, 
    refetchInterval: showLogsModal ? 10000 : false
  })
  
  const { data: threadHistory } = useQuery({
    queryKey: ['admin-thread-history', showThreadHistoryModal],
    queryFn: () => queueApi.getThreadHistory(showThreadHistoryModal!),
    enabled: !!showThreadHistoryModal
  })

  // 2. Real-time Updates
  const { socket } = useQueueSocket('admin', profile?._id || profile?.id)

  useEffect(() => {
    if (!socket) return

    const handleSync = (payload: any) => {
      queryClient.setQueryData(['admin-queue-sessions'], payload.sessions)
      queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] })
    }
    const refreshRequests = () => queryClient.invalidateQueries({ queryKey: ['admin-queue-requests'] })
    const handleChatReceived = (msg: any) => {
       const myId = profile?._id || profile?.id
       if (!showMessages && String(msg.sender).trim() !== String(myId).trim()) {
          setHasUnread(true)
       }
    }

    socket.on('state:sync', handleSync)
    socket.on('walkin:requested', refreshRequests)
    socket.on('reassign:requested', refreshRequests)
    socket.on('chat:received', handleChatReceived)

    return () => {
      socket.off('state:sync', handleSync)
      socket.off('walkin:requested', refreshRequests)
      socket.off('reassign:requested', refreshRequests)
      socket.off('chat:received', handleChatReceived)
    }
  }, [socket, queryClient, showMessages, profile?._id, profile?.id])

  // 3. Mutations
  const updatePriorityMutation = useMutation({
    mutationFn: ({ jobId, priorityScore }: { jobId: string, priorityScore: number }) => 
      queueApi.updatePriority(jobId, { priorityScore }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
  })

  const deleteJobMutation = useMutation({
    mutationFn: (jobId: string) => queueApi.deleteJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] })
    }
  })

  const restoreJobMutation = useMutation({
    mutationFn: (jobId: string) => queueApi.restoreJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] })
    }
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (jobIds: string[]) => queueApi.bulkDeleteJobs(jobIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] })
      setSelectedJobs(new Set())
    }
  })

  const bulkRestoreMutation = useMutation({
    mutationFn: (jobIds: string[]) => queueApi.bulkRestoreJobs(jobIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] })
      setSelectedJobs(new Set())
    }
  })

  const handleBulkDelete = () => {
    if (selectedJobs.size === 0) return;
    if (window.confirm(`CAUTION: Are you sure you want to PERMANENTLY delete these ${selectedJobs.size} jobs?`)) {
      bulkDeleteMutation.mutate(Array.from(selectedJobs))
    }
  }

  const handleBulkRestore = () => {
    if (selectedJobs.size === 0) return;
    if (window.confirm(`Restore these ${selectedJobs.size} jobs to the waiting pool?`)) {
      bulkRestoreMutation.mutate(Array.from(selectedJobs))
    }
  }

  const toggleSelection = (jobId: string) => {
    const next = new Set(selectedJobs);
    if (next.has(jobId)) next.delete(jobId);
    else next.add(jobId);
    setSelectedJobs(next);
  }

  const toggleSelectAll = () => {
    if (!queueData?.jobs) return;
    if (selectedJobs.size === queueData.jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(queueData.jobs.map((j: any) => j._id)));
    }
  }

  const handleDelete = (jobId: string) => {
    if (window.confirm('CAUTION: Are you sure you want to PERMANENTLY delete this job? This action cannot be undone.')) {
      deleteJobMutation.mutate(jobId)
    }
  }

  const pinJobMutation = useMutation({
    mutationFn: ({ jobId, staffId }: { jobId: string, staffId: string }) => 
      queueApi.pinJob(jobId, staffId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
  })

  const unpinJobMutation = useMutation({
    mutationFn: (jobId: string) => queueApi.unpinJob(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
  })

  const reorderQueueMutation = useMutation({
    mutationFn: ({ jobId, queuePosition }: { jobId: string, queuePosition: number }) => 
      queueApi.reorderQueue(jobId, { queuePosition }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
  })

  const reassignJobMutation = useMutation({
    mutationFn: ({ jobId, toStaffId, notes }: { jobId: string, toStaffId: string, notes: string }) => 
      queueApi.reassignJob(jobId, { toStaffId, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
      setShowReassignModal(null)
      setReassignTargetId('')
      setReassignNotes('')
    }
  })

  const handleRequestMutation = useMutation({
    mutationFn: ({ requestId, decision, adminAction, targetStaffId }: { requestId: string, decision: 'APPROVED' | 'REJECTED', adminAction?: string, targetStaffId?: string }) => 
      queueApi.handleRequest(requestId, { decision, adminAction, targetStaffId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-queue-requests'] })
      queryClient.invalidateQueries({ queryKey: ['admin-queue-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['admin-queue-sessions'] })
    }
  })

  const formatLogDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return {
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  }

  const filteredLogs = Array.isArray(eventLogs) ? eventLogs.filter((log: any) => {
     const matchesSearch = !logSearch || 
        log.customerName.toLowerCase().includes(logSearch.toLowerCase()) ||
        log._id.toLowerCase().includes(logSearch.toLowerCase())
     return matchesSearch
  }) : []


  const onlineStaffIds = new Set((Array.isArray(sessions) ? sessions : []).map((s: any) => s.staffId?._id || s.staffId))
  const busyStaffIds = new Set((Array.isArray(sessions) ? sessions : []).filter((s: any) => s.currentQueueJob || s.currentWalkinJob).map((s: any) => s.staffId?._id || s.staffId))

  const assignmentStaffList = useMemo(() => {
    return (staffList || []).filter((s: any) => {
      const roles = s.roles || (s.role ? [s.role] : [])
      return roles.includes('ADMIN') || roles.includes('PREPRESS')
    })
  }, [staffList])

  if (queueLoading || sessionsLoading) return <div className="admin-queue-page">Loading...</div>

  return (
    <div className="admin-queue-page">
      <div className={`global-loading-bar ${isFetching ? 'active' : ''}`} />
      <header className="admin-queue-header">
        <div className="header-left-hub">
          <Link to="/admin" className="back-btn-luxury">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            <span>Back</span>
          </Link>
          <div className="header-titles">
            <h1 className="admin-queue-title">Queue Control Center</h1>
            <span className="live-status"><span className="dot pulse-green"></span> Real-time Hub</span>
          </div>
        </div>

        <div className="header-center-hub">
          <ModuleNavigation />
        </div>

        <div className="header-actions-hub">

          <div className="vertical-divider" />

          <button 
            className={`btn-header-luxury ${hasUnread ? 'pulse-unread' : ''}`} 
            onClick={() => setShowMessages(true)}
            title="Open Communication Center"
          >
             <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
             <span className="btn-label">COMMS</span>
             {hasUnread && <span className="unread-dot"></span>}
          </button>

          <button 
            className="btn-header-luxury" 
            onClick={() => setShowLogsModal(true)}
            title="System Audit Journal"
          >
             <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
             <span className="btn-label">JOURNAL</span>
          </button>

          <div className="vertical-divider" />

          <UserMenu />
        </div>
      </header>

      <MessagingTray 
        isOpen={showMessages} 
        onClose={() => { setShowMessages(false); setHasUnread(false); setChatSettings({ recipient: 'all', jobId: '', prefill: '' }); }}
        currentUser={{ id: profile?._id || profile?.id || '', name: profile?.name || 'Admin', role: 'ADMIN' }}
        socket={socket}
        onlineStaff={sessions || []}
        allStaff={staffList || []}
        initialRecipient={chatSettings.recipient}
        initialJobId={chatSettings.jobId}
        prefilledMessage={chatSettings.prefill}
      />

      {(stats?.breachRisk5 > 0 || stats?.breachRisk15 > 0 || (stats?.staleJobs || 0) > 0) && (
        <div className="sla-summary-plate animate-in slide-in-from-top-2">
           <div className="sla-summary-content">
              <div className="sla-summary-icon">⚖️</div>
              <div className="sla-summary-text">
                 <strong>Queue Performance & SLA:</strong>
                 <div className="sla-alerts-row">
                    {stats?.breachRisk5 > 0 && <span className="sla-alert critical">{stats.breachRisk5} High Alert (&lt; 5m)</span>}
                    {stats?.breachRisk15 > 0 && <span className="sla-alert warning">{stats.breachRisk15} Near Breach (&lt; 15m)</span>}
                    {(stats?.staleJobs || 0) > 0 && <span className="sla-alert stale">{(stats?.staleJobs || 0)} Long Waiting (&gt; 2h)</span>}
                 </div>
              </div>
           </div>
        </div>
      )}

      <div className="admin-stats-hub animate-in fade-in slide-in-from-top-4">
        <div className="stat-plate">
           <div className="stat-header"><span className="dot pulse-blue"></span> WAITING</div>
           <div className="stat-body">
              <span className="stat-num">{stats?.totalQueued || 0}</span>
              <div className="stat-meta-info">
                 <span className="stat-unit">Tasks</span>
              </div>
           </div>
        </div>
        <div className="telemetry-separator" />
        <div className="stat-plate stat-plate-clickable" onClick={() => setShowLiveLoadDetail(true)}>
           <div className="stat-header"><span className="dot pulse-green"></span> LIVE LOAD</div>
           <div className="stat-body">
              <span className="stat-num">{stats?.totalInProgress || 0}</span>
              <div className="stat-meta-info">
                 <span className="stat-unit">Active Jobs</span>
                 <span style={{ fontSize:'0.5rem', color:'#10b981', fontWeight:800, marginTop:'2px', letterSpacing:'0.05em' }}>PROCESSING</span>
              </div>
           </div>
        </div>
        <div className="telemetry-separator" />
        <div className="stat-plate stat-plate-clickable" onClick={() => setShowDesignersDetail(true)}>
           <div className="stat-header"><span className="dot pulse-purple"></span> DESIGNERS</div>
           <div className="stat-body">
              <span className="stat-num">{stats?.activeSessions || 0}</span>
              <div className="stat-meta-info">
                  <div className="stat-split-telemetry">
                    <span className="split-pills busy">{(Array.isArray(sessions) ? sessions : []).filter((s:any) => s.currentQueueJob || s.currentWalkinJob).length || 0} UTILIZED</span>
                    <span className="split-pills idle">{(Array.isArray(sessions) ? sessions : []).filter((s:any) => !s.currentQueueJob && !s.currentWalkinJob).length || 0} READY</span>
                  </div>
              </div>
           </div>
        </div>
        <div className="telemetry-separator" />
        <div
          className="stat-plate luxury stat-plate-clickable"
          onClick={() => setShowLeaderboard(true)}
          title="Click to see staff leaderboard"
        >
           <div className="stat-header">TOTAL COMPLETED</div>
           <div className="stat-body">
              <span className="stat-num glow-text">{stats?.completed || 0}</span>
              <div className="stat-meta-info">
                <span className="stat-unit">Jobs</span>
                <span className="stat-click-hint">👆 By Staff</span>
              </div>
           </div>
        </div>
      </div>

      <div className="admin-queue-content">
        <div className="queue-section">
          <div className="queue-controls-elite-bar">
            <div className="tabs-container-premium">
              <button className={`tab-btn-luxury ${activeTab === 'QUEUED' ? 'active' : ''}`} onClick={() => { setActiveTab('QUEUED'); setPage(1); setSelectedJobs(new Set()); }}>Waiting Pool</button>
              <button className={`tab-btn-luxury ${activeTab === 'ASSIGNED' ? 'active' : ''}`} onClick={() => { setActiveTab('ASSIGNED'); setPage(1); setSelectedJobs(new Set()); }}>In Progress</button>
              <button className={`tab-btn-luxury ${activeTab === 'COMPLETED' ? 'active' : ''}`} onClick={() => { setActiveTab('COMPLETED'); setPage(1); setSelectedJobs(new Set()); }}>Finished</button>
              <button className={`tab-btn-luxury ${activeTab === 'ADMIN_REVIEW' ? 'active' : ''}`} onClick={() => { setActiveTab('ADMIN_REVIEW'); setPage(1); setSelectedJobs(new Set()); }} style={{ color: activeTab !== 'ADMIN_REVIEW' && (stats?.adminReview > 0) ? '#f59e0b' : undefined }}>
                ⚠ Review
                {stats?.adminReview > 0 && (
                  <span style={{ background:'#ef4444', color:'white', fontSize:'0.6rem', fontWeight:900, padding:'0.1rem 0.4rem', borderRadius:'2rem', lineHeight:1 }}>
                    {stats.adminReview}
                  </span>
                )}
              </button>
              <button
                className={`tab-btn-luxury ${activeTab === 'JUNK' ? 'active' : ''}`}
                onClick={() => { setActiveTab('JUNK'); setPage(1); setSelectedJobs(new Set()); }}
                style={{ color: activeTab !== 'JUNK' ? '#ef4444' : undefined }}
              >
                Junk / Spam
                {(stats?.junk ?? 0) > 0 && (
                  <span style={{ background:'#ef4444', color:'white', fontSize:'0.6rem', fontWeight:900, padding:'0.1rem 0.4rem', borderRadius:'2rem', lineHeight:1 }}>
                    {stats.junk}
                  </span>
                )}
              </button>
            </div>


            <div className="filters-group-hub">
               <div className="search-input-wrapper">
                  <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  <input type="text" placeholder="Search tasks..." className="search-input-elite" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
               </div>

               <button 
                  className={`btn-selection-toggle ${isSelectionMode ? 'active' : ''}`}
                  onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    if (isSelectionMode) setSelectedJobs(new Set());
                  }}
                  title={isSelectionMode ? "Cancel selection" : "Select multiple jobs"}
               >
                  {isSelectionMode ? (
                    <>
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                      <span>CANCEL</span>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                      <span>SELECT</span>
                    </>
                  )}
               </button>
               
               <div className="filter-select-wrapper" style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                 <select className="select-elite" value={assignedToFilter} onChange={(e) => { setAssignedToFilter(e.target.value); setPage(1); }}>
                   <option value="">All Designers</option>
                   {staffList?.map((s: any) => <option key={s._id} value={s._id}>{s.name}</option>)}
                 </select>
                 {assignedToFilter && (
                   <button
                     onClick={() => { setAssignedToFilter(''); setPage(1); }}
                     style={{ background:'#dbeafe', color:'#1e40af', border:'1px solid #bfdbfe', borderRadius:'2rem', fontSize:'0.65rem', fontWeight:900, padding:'0.2rem 0.6rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.25rem', whiteSpace:'nowrap' }}
                     title="Clear filter"
                   >
                     FILTERED ×
                   </button>
                 )}
               </div>
            </div>
          </div>

          {isSelectionMode && (queueData?.jobs?.length || 0) > 0 && (
            <div className="bulk-actions-bar" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1rem', background: '#f1f5f9', borderRadius: '0.5rem', marginBottom: '1rem' }}>
               <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 700, color: '#334155' }}>
                  <input type="checkbox" checked={selectedJobs.size > 0 && selectedJobs.size === queueData?.jobs?.length} onChange={toggleSelectAll} style={{ width: '1rem', height: '1rem' }} />
                  Select All
               </label>
               {selectedJobs.size > 0 && (
                 <>
                   <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{selectedJobs.size} selected</span>
                   <button className="btn-icon" style={{ background: '#fef2f2', color: '#ef4444', borderColor: '#fecaca', padding: '0.25rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 800 }} onClick={handleBulkDelete} disabled={bulkDeleteMutation.isPending}>
                     {bulkDeleteMutation.isPending ? 'DELETING...' : 'DELETE SELECTED'}
                   </button>
                   {(activeTab === 'JUNK' || activeTab === 'ADMIN_REVIEW') && (
                      <button className="btn-icon" style={{ background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0', padding: '0.25rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 800 }} onClick={handleBulkRestore} disabled={bulkRestoreMutation.isPending}>
                        {bulkRestoreMutation.isPending ? 'RESTORING...' : 'RESTORE SELECTED'}
                      </button>
                   )}
                 </>
               )}
            </div>
          )}

          <div className="queue-items">
            {queueData?.jobs?.map((job: any, index: number) => {
              const { time: subjectTime, clean: subjectClean } = formatSubject(job.emailSubject || '')
              const ageLabel = job.createdAt ? elapsed(job.createdAt) : ''
              return (
              <div key={job._id} className={`admin-job-card animate-in slide-in-from-bottom-8 ${job.priorityScore >= 20 ? 'priority-immediate' : job.priorityScore >= 10 ? 'priority-high' : job.priorityScore >= 5 ? 'priority-medium' : 'priority-low'} ${selectedJobs.has(job._id) ? 'selected' : ''}`}>
                 <div className="admin-job-header-row">
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                           {isSelectionMode && <input type="checkbox" checked={selectedJobs.has(job._id)} onChange={() => toggleSelection(job._id)} style={{ width: '1.2rem', height: '1.2rem', marginTop: '2px', cursor: 'pointer' }} />}
                           <h4 className="job-title-premium">{job.customerName}</h4>
                           <span className="job-id">#{job._id.substring(18).toUpperCase()}</span>
                           {ageLabel && (
                             <span style={{ fontSize:'0.65rem', fontWeight:800, color:'#64748b', background:'#f1f5f9', padding:'0.15rem 0.5rem', borderRadius:'2rem', border:'1px solid #e2e8f0' }}
                               title={`In queue since ${new Date(job.createdAt).toLocaleTimeString()}`}>
                               ⏱ {ageLabel}
                             </span>
                           )}
                           {job.threadId && (
                              <span 
                                className="badge-revision animate-pulse clickable" 
                                onClick={() => setShowThreadHistoryModal(job.threadId)}
                                title="Previous versions of this job exist. Click to view history."
                              >
                                 <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '4px' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                 </svg>
                                 REVISION
                              </span>
                           )}
                           {job.lastPausedBy && job.status === 'QUEUED' && (
                              <span className="badge-prior-work" title={`Previously worked on by ${job.lastPausedBy.name}`}>
                                 <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '4px' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                 </svg>
                                 PRIOR WORK: {job.lastPausedBy.name.toUpperCase()}
                              </span>
                           )}
                        </div>
                       <div className="admin-job-meta">
                          {subjectTime && (
                            <span style={{ fontSize:'0.65rem', fontWeight:800, color:'#64748b', background:'#f1f5f9', padding:'0.1rem 0.4rem', borderRadius:'0.35rem', border:'1px solid #e2e8f0', marginRight:'0.35rem' }}>
                              {subjectTime}
                            </span>
                          )}
                          <span className="subject-premium">{subjectClean || job.emailSubject}</span>
                          {job.dueBy && <span style={{ color: '#ef4444' }}>• Due: {new Date(job.dueBy).toLocaleTimeString()}</span>}
                       </div>
                    </div>

                    <div className="admin-job-actions">
                       {/* Restore button — visible in JUNK and ADMIN_REVIEW tabs */}
                       {(activeTab === 'JUNK' || activeTab === 'ADMIN_REVIEW') && (
                         <button
                           className="btn-icon"
                           style={{ background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }}
                           onClick={() => restoreJobMutation.mutate(job._id)}
                           disabled={restoreJobMutation.isPending}
                           title="Restore this job to the waiting pool"
                         >
                           {restoreJobMutation.isPending ? '…' : '↩'}
                         </button>
                       )}
                       {job.assignedTo && (
                          <>
                           <button className="btn-icon" style={{ background: '#dbeafe', color: '#1e40af', borderColor: '#bfdbfe' }} onClick={() => {
                              setChatSettings({ recipient: job.assignedTo._id, jobId: job._id, prefill: `Regarding Job #${job._id.substring(18).toUpperCase()}: ` });
                              setShowMessages(true);
                           }} title={`Message ${job.assignedTo.name}`}>
                             <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                           </button>
                           {(activeTab === 'ASSIGNED' || activeTab === 'COMPLETED' || activeTab === 'ADMIN_REVIEW') && (
                             <button className="btn-icon" style={{ background: '#fef3c7', color: '#d97706', borderColor: '#fde68a' }} onClick={() => setShowReassignModal(job)} title="Force Reassign Job">
                               <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                             </button>
                           )}
                          </>
                      )}
                      <button className="btn-icon-void" onClick={() => handleDelete(job._id)} title="Delete Job Permanently">
                         <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <button className="btn-icon" onClick={() => setShowJobAuditModal(job)} title="View Lifecycle Log (Audit)">
                         <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </button>

                      <div className="select-pill-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                         {job.status === 'QUEUED' && (
                            <select 
                               className="premium-select-m" 
                               value={job.pinnedToStaff?._id || 'none'}
                               onChange={(e) => {
                                 const staffId = e.target.value
                                 if (staffId === 'none') {
                                   unpinJobMutation.mutate(job._id)
                                 } else {
                                   const isOnline = onlineStaffIds.has(staffId)
                                   if (!isOnline && !window.confirm('This designer is currently OFFLINE. Pin anyway?')) return;
                                   pinJobMutation.mutate({ jobId: job._id, staffId })
                                 }
                               }}
                            >
                               <option value="none">UNPINNED</option>
                               {assignmentStaffList.map((s: any) => {
                                 const isOnline = onlineStaffIds.has(s._id)
                                 return (
                                   <option key={s._id} value={s._id}>
                                     {isOnline ? '🟢' : '⚪'} {s.name.toUpperCase()} {!isOnline ? '(OFFLINE)' : busyStaffIds.has(s._id) ? '(BUSY)' : '(READY)'}
                                   </option>
                                 )
                               })}
                            </select>
                         )}
                         <select 
                            className="premium-select-m" 
                            value={job.priorityScore} 
                            onChange={(e) => updatePriorityMutation.mutate({ jobId: job._id, priorityScore: Number(e.target.value) })}
                         >
                            <option value="0">NORMAL</option>
                            <option value="5">URGENT</option>
                            <option value="10">CRITICAL</option>
                            <option value="20">IMMEDIATE</option>
                         </select>
                         {activeTab === 'QUEUED' && (
                           <>
                             <div className="vertical-divider" style={{height:'1.5rem', margin:'0 0.25rem', borderColor:'#cbd5e1'}} />
                             <button
                               className="btn-icon"
                               disabled={index === 0 || reorderQueueMutation.isPending}
                               onClick={() => reorderQueueMutation.mutate({ jobId: job._id, queuePosition: index - 1 })}
                               style={{ width:'28px', height:'28px', padding:0, background:'#f8fafc', opacity: index === 0 ? 0.3 : 1 }}
                               title="Move up in queue"
                             >↑</button>
                             <button
                               className="btn-icon"
                               disabled={index === (queueData?.jobs?.length || 1) - 1 || reorderQueueMutation.isPending}
                               onClick={() => reorderQueueMutation.mutate({ jobId: job._id, queuePosition: index + 1 })}
                               style={{ width:'28px', height:'28px', padding:0, background:'#f8fafc', opacity: index === (queueData?.jobs?.length || 1) - 1 ? 0.3 : 1 }}
                               title="Move down in queue"
                             >↓</button>
                           </>
                         )}
                      </div>
                    </div>
                 </div>

                 <div className="admin-job-body">
                    {job.mailBody && (
                      <div className="job-body-box" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '1rem', fontSize: '0.875rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        <LinkifiedText text={job.mailBody} />
                      </div>
                    )}
                    {(() => {
                        const visibleAtts = (atts: string[]) => (atts || []).filter(f => !/\.(txt|html|htm)$/i.test(f))
                        const attsToShow = visibleAtts(job.attachments)
                        if (attsToShow.length === 0) return null
                        return (
                          <div className="admin-screenshots-grid">
                             {attsToShow.map((file: any, sIdx: number) => {
                                const fileUrl = `${BACKEND_URL}/job-files/${job.relativeFolderPath}/${file}?token=${localStorage.getItem('token')}`
                                return (
                                  <div key={sIdx} className="admin-screenshot-item" onClick={() => isImage(file) ? setViewImage(fileUrl) : window.open(fileUrl)}>
                                    {isImage(file) ? <img src={fileUrl} alt={file} /> : <div className="admin-file-badge">{file.split('.').pop()?.toUpperCase()}</div>}
                                  </div>
                                )
                             })}
                          </div>
                        )
                     })()}
                 </div>

                 {job.assignedTo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8125rem', color: '#64748b' }}>
                       <div className="staff-avatar" style={{ transform: 'scale(0.8)' }}>{job.assignedTo.name.charAt(0)}</div>
                       <span>Working: <strong>{job.assignedTo.name}</strong></span>
                    </div>
                 )}
              </div>
            )})
          }
          </div>
          
          <div className="admin-pagination-premium">
             <div className="page-info">
                Showing Page {page} of {queueData?.pages || 1}
             </div>
             <div className="pagination-controls">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="page-btn-outline">Previous</button>
                <button disabled={page >= (queueData?.pages || 1)} onClick={() => setPage(p => p + 1)} className="page-btn-outline">Next</button>
             </div>
          </div>
        </div>        <div className="sessions-sidebar-deck">
          <div className="sidebar-group">
            <h3 className="sidebar-title-luxury">
               <svg viewBox="0 0 24 24" width="18" height="18" className="mr-2"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
               System Requests 
               <span className="req-count-badge">{requests?.length || 0}</span>
            </h3>
            <div className="sidebar-scroll-height">
              {requests?.map((req: any) => (
                 <div key={req._id} className="request-card-elite">
                    <div className="req-card-top">
                       <span className={`req-type-badge ${req.type}`}>{req.type}</span>
                       <span className="req-time">{new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {req.type === 'REASSIGN' && req.jobId && (
                       <div className="req-job-preview">
                          <h4 className="title">{req.jobId.customerName}</h4>
                          <p className="subject">{req.jobId.emailSubject}</p>
                       </div>
                    )}

                    <p className="req-reason">"{req.description}"</p>
                    
                    <div className="req-footer-hub">
                       <div className="req-user">
                          <div className="staff-avatar-mini">{req.requestedBy?.name?.charAt(0)}</div>
                          <span>{req.requestedBy?.name}</span>
                       </div>

                       {req.type === 'REASSIGN' && (
                          <select 
                             className="select-elite-mini" 
                             onChange={(e) => setTargetAssignments(prev => ({ ...prev, [req._id]: e.target.value }))}
                             value={targetAssignments[req._id] || ''}
                          >
                             <option value="">REASSIGN TO...</option>
                             <option value="pool">↩ RETURN TO POOL</option>
                               {assignmentStaffList.map((s: any) => {
                                 const isOnline = onlineStaffIds.has(s._id)
                                 const isBusy = busyStaffIds.has(s._id)
                                 return (
                                   <option key={req._id + s._id} value={s._id}>
                                     {isOnline ? '🟢' : '⚪'} {s.name} {!isOnline ? '(OFFLINE)' : isBusy ? '(BUSY)' : '(READY)'}
                                   </option>
                                 )
                               })}
                           </select>
                       )}

                       <div className="req-actions">
                          <button className="btn-approve" onClick={() => {
                             const targetId = targetAssignments[req._id]
                             if (targetId && targetId !== 'pool') {
                               const isOnline = onlineStaffIds.has(targetId)
                               if (!isOnline && !window.confirm('The selected target staff is OFFLINE. Proceed with reassignment?')) return;
                             }
                             handleRequestMutation.mutate({ requestId: req._id, decision: 'APPROVED', targetStaffId: targetId === 'pool' ? undefined : targetId })
                           }}>APPROVE</button>
                          <button className="btn-reject" onClick={() => {
                             const action = prompt('Rejection reason (optional):');
                             handleRequestMutation.mutate({ requestId: req._id, decision: 'REJECTED', adminAction: action || undefined });
                          }}>REJECT</button>
                       </div>
                    </div>
                 </div>
              ))}
              {(!requests || requests.length === 0) && <div className="empty-sidebar-state">No pending requests.</div>}
            </div>
          </div>

          <div className="sidebar-group">
            <h3 className="sidebar-title-luxury">
               <svg viewBox="0 0 24 24" width="18" height="18" className="mr-2"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
               Online Designers
            </h3>
            <div className="sidebar-scroll-height">
              {sessions?.map((sess: any) => (
                 <div key={sess._id} className="staff-session-elite">
                    <div className="session-main">
                       <div className="staff-avatar-mini">{sess.staffId?.name.charAt(0)}</div>
                       <div className="staff-meta">
                          <span className="name">{sess.staffId?.name}</span>
                          <div className="status-indicator">
                             <div className={`status-dot ${sess.currentWalkinJob ? 'orange' : sess.currentQueueJob ? 'blue' : 'green'}`}></div>
                             <span>{sess.currentWalkinJob ? 'Walk-in' : sess.currentQueueJob ? 'Active' : 'Idle'}</span>
                          </div>
                       </div>
                    </div>
                 </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showLogsModal && (
         <div className="modal-overlay" onClick={() => setShowLogsModal(false)}>
            <div className="logs-modal" onClick={e => e.stopPropagation()}>
               <div className="modal-header-premium">
                  <div>
                    <h2>Activity Journal</h2>
                    <p>Audit trail of all job state transitions.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="text" placeholder="Filter..." className="modal-filter-input" value={logSearch} onChange={e => setLogSearch(e.target.value)} />
                    <button className="close-btn-p" onClick={() => setShowLogsModal(false)}>&times;</button>
                  </div>
               </div>
               
               <div className="modal-scroll-area">
                  <table className="activity-log-table">
                    <thead>
                       <tr><th>Job / Customer</th><th>Event</th><th>Staff</th><th>Timestamp</th><th>Info</th></tr>
                    </thead>
                    <tbody>
                      {filteredLogs?.map((log: any) => {
                         const dt = formatLogDate(log.updatedAt);
                         return (
                           <tr key={log._id}>
                             <td><strong>{log.customerName}</strong><br/><small>{log._id.substring(18)}</small></td>
                             <td><span className={`log-status-badge ${log.status.toLowerCase()}`}>{log.status}</span></td>
                             <td>{log.assignedTo?.name || '—'}</td>
                             <td><span className="log-date">{dt.date}</span> <span className="log-time">{dt.time}</span></td>
                             <td><button className="btn-log-detail" onClick={() => setSelectedLogJob(log)}>&gt;</button></td>
                           </tr>
                         );
                      })}
                    </tbody>
                  </table>
               </div>
            </div>
         </div>
      )}

      {showJobAuditModal && (
        <div className="modal-overlay" onClick={() => setShowJobAuditModal(null)}>
          <div className="logs-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
             <div className="modal-header-premium">
                <h2>Audit: {showJobAuditModal.customerName}</h2>
                <button className="close-btn-p" onClick={() => setShowJobAuditModal(null)}>&times;</button>
             </div>
             <div className="modal-scroll-area" style={{ padding: '2rem' }}>
                <div className="audit-timeline">
                  {showJobAuditModal.auditLog?.map((log: any, i: number) => (
                    <div key={i} style={{ paddingLeft: '1.5rem', borderLeft: '2px solid #e2e8f0', position: 'relative', marginBottom: '1.5rem' }}>
                       <div style={{ position: 'absolute', left: '-6px', top: '0', width: '10px', height: '10px', background: '#2563eb', borderRadius: '50%' }}></div>
                       <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>{new Date(log.timestamp).toLocaleString()}</div>
                       <div style={{ fontSize: '0.875rem', fontWeight: 800 }}>{log.action}</div>
                       {log.details && <pre style={{ fontSize: '0.7rem', background: '#f8fafc', padding: '0.5rem', marginTop: '0.5rem', borderRadius: '0.5rem', overflowX: 'auto' }}>{JSON.stringify(log.details, null, 2)}</pre>}
                    </div>
                  ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {selectedLogJob && (
         <div className="modal-overlay" onClick={() => setSelectedLogJob(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
               <h3 className="modal-title">Log Entry Detail</h3>
               <div className="detail-row"><span>Log ID:</span> <strong>{selectedLogJob._id}</strong></div>
               <div className="detail-row"><span>Customer:</span> <strong>{selectedLogJob.customerName}</strong></div>
               <div className="detail-row"><span>Result:</span> <strong>{selectedLogJob.status}</strong></div>
               {selectedLogJob.returnReason && <div className="detail-row" style={{ color: '#ef4444' }}><span>Note:</span> <strong>{selectedLogJob.returnReason}</strong></div>}
               <div className="modal-actions" style={{ marginTop: '2rem' }}><button className="btn-complete" onClick={() => setSelectedLogJob(null)}>CLOSE</button></div>
            </div>
         </div>
      )}

      {viewImage && (
        <div className="lightbox-modal" onClick={() => setViewImage(null)}>
           <img src={viewImage} className="lightbox-img" alt="Enlarged" onClick={e => e.stopPropagation()} />
           <button className="lightbox-close-btn" onClick={() => setViewImage(null)}>&times;</button>
        </div>
      )}

      {showThreadHistoryModal && (
         <div className="modal-overlay" onClick={() => setShowThreadHistoryModal(null)}>
            <div className="modal glass-modal slide-in-bottom" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
               <div className="modal-header-premium">
                  <h3>Project Thread Timeline</h3>
                  <button className="close-btn" onClick={() => setShowThreadHistoryModal(null)}>×</button>
               </div>
               <div className="thread-timeline">
                  {threadHistory?.map((entry: any, idx: number) => (
                     <div key={entry._id} className="timeline-entry">
                        <div className="timeline-marker"></div>
                        <div className="timeline-content">
                           <div className="timeline-meta">
                              <span className="timeline-date">{new Date(entry.createdAt).toLocaleDateString()}</span>
                              <span className={`status-pill ${entry.status}`}>{entry.status}</span>
                           </div>
                           <h4 className="timeline-version">Version {idx + 1}</h4>
                           <p className="timeline-notes">{entry.mailBody?.substring(0, 100)}...</p>
                           {entry.assignedTo && (
                              <div className="timeline-staff">
                                 <div className="staff-dot"></div>
                                 <span>Handled by {entry.assignedTo.name}</span>
                              </div>
                           )}
                        </div>
                     </div>
                  ))}
               </div>
               <button className="btn-q-core btn-q-primary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => setShowThreadHistoryModal(null)}>CLOSE TIMELINE</button>
            </div>
         </div>
      )}

      {showLiveLoadDetail && (
        <div className="modal-overlay" onClick={() => setShowLiveLoadDetail(false)}>
          <div className="modal-content-luxury" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>Live Workload Detail</h2>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>Current active jobs being processed</p>
              </div>
              <button onClick={() => setShowLiveLoadDetail(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {(queueData?.jobs || []).filter((j: any) => j.status === 'ASSIGNED').length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>No jobs are currently being processed.</div>
              ) : (
                (queueData?.jobs || []).filter((j: any) => j.status === 'ASSIGNED').map((job: any) => (
                  <div key={job._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '0.85rem' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                         <span style={{ fontSize: '0.65rem', background: '#e2e8f0', padding: '0.1rem 0.4rem', borderRadius: '0.3rem' }}>#{job._id.substring(18).toUpperCase()}</span>
                         {job.customerName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>{job.type} • {job.emailSubject || job.walkinDescription}</div>
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: '1rem' }}>
                       <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#3b82f6' }}>{job.assignedTo?.name || 'Unknown'}</div>
                       <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic' }}>Designing...</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showDesignersDetail && (
        <div className="modal-overlay" onClick={() => setShowDesignersDetail(false)}>
          <div className="modal-content-luxury" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>Roster Activity</h2>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>Live staff utilization status</p>
              </div>
              <button onClick={() => setShowDesignersDetail(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
               {/* Utilized List */}
               <div>
                 <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#3b82f6', letterSpacing: '0.1em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }}></div>
                    UTILIZED STAFF
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {(Array.isArray(sessions) ? sessions : []).filter((s:any) => s.currentQueueJob || s.currentWalkinJob).length === 0 ? (
                      <div style={{ fontSize: '0.875rem', color: '#94a3b8', paddingLeft: '1rem' }}>No busy designers at the moment.</div>
                    ) : (
                      (sessions || []).filter((s:any) => s.currentQueueJob || s.currentWalkinJob).map((s:any) => (
                        <div key={s.userId} style={{ padding: '0.75rem 1rem', background: '#eff6ff', borderRadius: '0.75rem', border: '1px solid #dbeafe', display: 'flex', justifyContent: 'space-between' }}>
                           <span style={{ fontWeight: 800, color: '#1e40af' }}>{s.userName}</span>
                           <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600 }}>Working on Job</span>
                        </div>
                      ))
                    )}
                 </div>
               </div>

               {/* Ready List */}
               <div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#10b981', letterSpacing: '0.1em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></div>
                    READY STAFF (ON STANDBY)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {(Array.isArray(sessions) ? sessions : []).filter((s:any) => !s.currentQueueJob && !s.currentWalkinJob).length === 0 ? (
                       <div style={{ fontSize: '0.875rem', color: '#94a3b8', paddingLeft: '1rem' }}>All staff are currently busy.</div>
                    ) : (
                      (sessions || []).filter((s:any) => !s.currentQueueJob && !s.currentWalkinJob).map((s:any) => (
                        <div key={s.userId} style={{ padding: '0.75rem 1rem', background: '#ecfdf5', borderRadius: '0.75rem', border: '1px solid #d1fae5', display: 'flex', justifyContent: 'space-between' }}>
                           <span style={{ fontWeight: 800, color: '#065f46' }}>{s.userName}</span>
                           <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>Available</span>
                        </div>
                      ))
                    )}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {showLeaderboard && (
        <div className="modal-overlay" onClick={() => setShowLeaderboard(false)}>
          <div className="logs-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="modal-header-premium">
              <div>
                <h2>🏆 Today's Leaderboard</h2>
                <p>Jobs completed by each designer today</p>
              </div>
              <button className="close-btn-p" onClick={() => setShowLeaderboard(false)}>×</button>
            </div>
            <div className="modal-scroll-area" style={{ padding: '1.5rem' }}>
              {(!leaderboardData || leaderboardData.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                  No completed jobs yet today.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {leaderboardData.map((entry: any, idx: number) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
                    const avgMins = entry.avgDurationMs ? Math.round(entry.avgDurationMs / 60000) : null
                    const isTop = idx < 3
                    return (
                      <div key={entry.staffId} style={{
                        display: 'flex', alignItems: 'center', gap: '1rem',
                        background: isTop ? (idx === 0 ? 'linear-gradient(135deg,#fffbeb,#fef3c7)' : idx === 1 ? 'linear-gradient(135deg,#f8fafc,#f1f5f9)' : 'linear-gradient(135deg,#fff7ed,#ffedd5)') : '#f8fafc',
                        border: `1px solid ${idx === 0 ? '#fde68a' : idx === 1 ? '#e2e8f0' : idx === 2 ? '#fed7aa' : '#f1f5f9'}`,
                        borderRadius: '1rem', padding: '1rem 1.25rem',
                        boxShadow: isTop ? '0 4px 12px rgba(0,0,0,0.06)' : 'none'
                      }}>
                        <span style={{ fontSize: idx < 3 ? '1.75rem' : '0.9rem', fontWeight: 900, minWidth: '2.5rem', textAlign: 'center' }}>{medal}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 900, fontSize: '1rem', color: '#0f172a' }}>{entry.name}</div>
                          {avgMins !== null && (
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.15rem' }}>avg {avgMins}m per job</div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1, color: idx === 0 ? '#b45309' : '#0f172a' }}>{entry.count}</div>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>jobs</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showReassignModal && (
        <ReassignModal
          job={showReassignModal}
          targetId={reassignTargetId}
          setTargetId={setReassignTargetId}
          notes={reassignNotes}
          setNotes={setReassignNotes}
          onClose={() => {
            setShowReassignModal(null)
            setReassignTargetId('')
            setReassignNotes('')
          }}
          onSubmit={reassignJobMutation.mutate}
          isPending={reassignJobMutation.isPending}
          onlineStaffIds={onlineStaffIds}
          busyStaffIds={busyStaffIds}
          assignmentStaffList={assignmentStaffList}
        />
      )}

    </div>
  )
}

function ReassignModal({ 
  job, targetId, setTargetId, notes, setNotes, onClose, onSubmit, isPending, onlineStaffIds, busyStaffIds, assignmentStaffList
}: any) {
  return (
    <div className="modal-overlay">
      <div className="modal-content-luxury">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>Force Reassign Job</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
        </div>
        
        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          <strong>Job:</strong> #{job._id.substring(18).toUpperCase()} - {job.customerName}<br/>
          <strong>Currently Assigned To:</strong> {job.assignedTo?.name || 'Nobody'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800, fontSize: '0.875rem', color: '#475569' }}>New Staff Member</label>
            <select 
              className="search-input-elite" 
              style={{ width: '100%', padding: '0.75rem' }}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Select a designer...</option>
              <option value="pool">↩ Return to General Pool</option>
               {assignmentStaffList.map((s: any) => {
                 const isOnline = onlineStaffIds.has(s._id);
                 const isBusy = busyStaffIds.has(s._id);
                 return (
                   <option key={s._id} value={s._id}>
                     {isOnline ? '🟢' : '⚪'} {s.name} {s._id === job.assignedTo?._id ? '(Current)' : ''} {!isOnline ? '(OFFLINE)' : isBusy ? '(BUSY)' : '(READY)'}
                   </option>
                 );
               })}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800, fontSize: '0.875rem', color: '#475569' }}>Reassignment Notes (Optional)</label>
            <textarea 
              className="search-input-elite" 
              style={{ width: '100%', minHeight: '80px', padding: '0.75rem', resize: 'vertical' }}
              placeholder="e.g., 'Take over while John is on break...'"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button onClick={onClose} disabled={isPending} style={{ padding: '0.75rem 1.5rem', borderRadius: '2rem', border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 800, cursor: 'pointer' }}>
            Cancel
          </button>
          <button 
            disabled={!targetId || targetId === job.assignedTo?._id || isPending}
            onClick={() => {
              if (targetId === 'pool') {
                if (window.confirm('Return this job to the general pool? It will be unassigned from everyone.')) {
                   onSubmit({ jobId: job._id, toStaffId: null, notes });
                }
                return;
              }
              const isOnline = onlineStaffIds.has(targetId);
              if (!isOnline && !window.confirm('Target staff is OFFLINE. Force-reassigning will create a pending pin for them instead of an immediate active assignment. Proceed?')) return;
              onSubmit({ jobId: job._id, toStaffId: targetId, notes });
            }}
            style={{ padding: '0.75rem 1.5rem', borderRadius: '2rem', border: 'none', background: '#d97706', color: 'white', fontWeight: 800, cursor: targetId && targetId !== job.assignedTo?._id ? 'pointer' : 'not-allowed', opacity: targetId && targetId !== job.assignedTo?._id ? 1 : 0.5 }}
          >
            {isPending ? 'Reassigning...' : 'Force Reassign ⤨'}
          </button>
        </div>
      </div>
    </div>
  )
}
