import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queueApi } from '../../services/queueApi'
import { useQueueSocket } from '../../hooks/useQueueSocket'
import { useQueueListeners } from './hooks/useQueueListeners'
import UserMenu from '../../components/UserMenu'
import ModuleNavigation from '../../components/ModuleNavigation'
import { MessagingTray } from '../../shared/components/MessagingTray'
import LinkifiedText from '../../shared/components/LinkifiedText'
import { downloadWithAuth } from '../../shared/utils/queueHelpers'
import JobCard from './components/JobCard'
import QueueSidebar from './components/QueueSidebar'
import './QueueDashboard.css'

// ─── Helpers (formatSubject imported from shared/utils/queueHelpers) ─────


// FIX-L1 / FIX-L2: Clipboard works on LAN HTTP without HTTPS



// Toast notification component
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
      background: '#0f172a', color: 'white', padding: '0.75rem 1.5rem',
      borderRadius: '2rem', fontWeight: 800, fontSize: '0.875rem',
      boxShadow: '0 8px 25px rgba(0,0,0,0.25)', zIndex: 99998,
      animation: 'jobCardEnter 0.3s cubic-bezier(0.34,1.56,0.64,1)'
    }}>
      ✓ {message}
    </div>
  )
}

// Celebration component for job completion
function CelebrationOverlay() {
  return (
    <div className="celebration-overlay" style={{ pointerEvents: 'none' }}>
      {[...Array(50)].map((_, i) => (
        <div 
          key={i} 
          className="confetti" 
          style={{ 
            left: `${Math.random() * 100}vw`, 
            animationDelay: `${Math.random() * 2}s`,
            animationDuration: `${2 + Math.random() * 1}s`
          }} 
        />
      ))}
      <div className="celeb-badge">
        <h1>YES!</h1>
        <p>JOB COMPLETE • AMAZING WORK</p>
      </div>
    </div>
  )
}



// ─── Main Component ───────────────────────────────────────────────────────────
export default function QueueDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [profile, setProfile] = useState<any>(null)
  const [isSocketConnected, setIsSocketConnected] = useState(true)

  // Messaging
  const [showMessages, setShowMessages] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [chatSettings, setChatSettings] = useState<{ recipient: string; jobId: string; prefill: string }>({ recipient: '', jobId: '', prefill: '' })

  // UI
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [showWalkinModal, setShowWalkinModal] = useState(false)
  const [selectedBatchJobs, setSelectedBatchJobs] = useState<Set<string>>(new Set())
  const [walkinDescription, setWalkinDescription] = useState('')
  const [showReassignModal, setShowReassignModal] = useState<string | null>(null)
  const [reassignReason, setReassignReason] = useState('')
  const [showCelebration, setShowCelebration] = useState(false)
  const [, setDownloadingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showQRModal, setShowQRModal] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [poolSearch, setPoolSearch] = useState('')
  const [sidebarTab, setSidebarTab] = useState<'WALKIN' | 'QUEUE' | 'HISTORY' | 'SEARCH'>('WALKIN')
  const [previewJob, setPreviewJob] = useState<any>(null)
  const [showResumeSuggestion, setShowResumeSuggestion] = useState(false)

  // 1. Profile
  useEffect(() => {
    const s = localStorage.getItem('user')
    if (s) setProfile(JSON.parse(s))
  }, [])

  // Explicitly fallback for ID types
  const myStaffId = profile?._id || profile?.id || profile?.userId;

  // 2. Data
  const { data: sessionStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['queue-session-status'],
    queryFn: queueApi.getSessionStatus,
    refetchInterval: 30000
  })

  const [debouncedPoolSearch, setDebouncedPoolSearch] = useState('')
  
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedPoolSearch(poolSearch), 300)
    return () => clearTimeout(handler)
  }, [poolSearch])

  const { data: generalPool } = useQuery({
    queryKey: ['general-pool', debouncedPoolSearch],
    queryFn: () => queueApi.getGeneralPool(debouncedPoolSearch),
    enabled: sidebarTab === 'SEARCH' && debouncedPoolSearch.trim().length >= 2,
    refetchInterval: 15000
  })

  const { data: currentJobData } = useQuery({
    queryKey: ['current-queue-job'],
    queryFn: queueApi.getCurrentJob,
    enabled: !!sessionStatus?.active,
    refetchInterval: 60000
  })

  const { data: myJobs } = useQuery({
    queryKey: ['my-jobs-today'],
    queryFn: queueApi.getMyJobsToday,
    refetchInterval: 30000
  })

  const { data: staffList } = useQuery({ queryKey: ['staff-list'], queryFn: queueApi.getStaffList })
  const { data: configs } = useQuery({ queryKey: ['system-config'], queryFn: queueApi.getSystemConfig })

  // BUG-01: Heartbeat every 90s
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!sessionStatus?.active) {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
      return
    }
    queueApi.sendHeartbeat().catch(() => {})
    heartbeatRef.current = setInterval(() => queueApi.sendHeartbeat().catch(() => {}), 90_000)
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current) }
  }, [sessionStatus?.active])


  // 3. Socket
  const { socket } = useQueueSocket('staff', profile?.id || '')
  
  // Use the extracted socket listener hook
  useQueueListeners({ 
    socket, 
    isActive: !!sessionStatus?.active, 
    staffId: myStaffId, 
    setHasUnread,
    setToast,
    setIsSocketConnected
  })

  // 4. Mutations
  const startSessionMutation = useMutation({
    mutationFn: queueApi.startSession,
    onSuccess: (data) => {
      queryClient.setQueryData(['queue-session-status'], { active: true })
      queryClient.setQueryData(['current-queue-job'], { active: true, queueJob: data.currentJob, walkinJob: null })
    }
  })
  const endSessionMutation = useMutation({
    mutationFn: queueApi.endSession,
    onSuccess: () => {
      queryClient.setQueryData(['queue-session-status'], { active: false })
      queryClient.setQueryData(['current-queue-job'], { active: false, queueJob: null, walkinJob: null })
    }
  })
  const completeJobMutation = useMutation({
    mutationFn: (jobId: string) => queueApi.completeJob(jobId),
    onSuccess: (data) => {
      setShowCelebration(true)
      setTimeout(() => setShowCelebration(false), 2500)
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
      
      // Smart Suggestion Logic
      if (data.nextJob?.hasHoldJobs) {
        setShowResumeSuggestion(true)
      } else if (data.nextJob && !data.nextJob.completedJob) {
        // Standard auto-assignment (no hold jobs exist)
        queryClient.setQueryData(['current-queue-job'], (prev: any) => ({ ...prev, queueJob: data.nextJob }))
      }
    },
    onError: (err: any) => setToast(`Completion Failed: ${err.message || 'System Error'}`)
  })
  const pauseJobMutation = useMutation({
    mutationFn: ({ jobId, fetchNext }: { jobId: string; fetchNext: boolean }) => queueApi.pauseJob(jobId, fetchNext),
    onSuccess: (_, variables) => { 
      setToast(variables.fetchNext ? 'Job parked — next job incoming' : 'Job parked — waiting for walk-in'); 
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] }); 
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] }) 
    },
    onError: (err: any) => setToast(`Hold Failed: ${err.message || 'Busy'}`)
  })
  const startWalkinJobMutation = useMutation({
    mutationFn: ({ jobId, takeAll = false }: { jobId: string, takeAll?: boolean }) => queueApi.takeJob(jobId, takeAll),
    onSuccess: (data: any) => { 
      if (data?.previousOwnerName) {
        setToast(`Successfully taken from ${data.previousOwnerName}`);
      } else {
        setToast('Switching job...');
      }
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] }) 
    },
    onError: (err: any) => setToast(`Failed to take job: ${err.message || 'Busy or Locked'}`)
  })
  const reassignMutation = useMutation({
    mutationFn: ({ jobId, reason }: { jobId: string; reason: string }) => queueApi.requestReassignment({ jobId, reason }),
    onMutate: () => {
      // 1. Immediately wipe from screen at the moment of click
      queryClient.setQueryData(['current-queue-job'], (prev: any) => ({
        ...(prev || {}),
        queueJob: null,
        walkinJob: prev?.walkinJob ?? null,
        active: true
      }))
      setShowReassignModal(null)
      setReassignReason('')
    },
    onSuccess: () => { 
      // 2. Force fresh data to load the next job
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
      setToast('Reassignment request sent')
    },
    onError: (err: any) => {
      setToast(`Failed: ${err?.response?.data?.message || 'Could not send request'}`)
      // On error, we might want to refetch to restore the job if it wasn't actually moved
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
    }
  })
  const requestWalkinMutation = useMutation({
    mutationFn: (description: string) => queueApi.requestWalkin(description),
    onSuccess: () => { setShowWalkinModal(false); setToast('Walk-in request sent to admin') }
  })
  const toggleQueuePauseMutation = useMutation({
    mutationFn: (isPaused: boolean) => queueApi.toggleQueuePause(isPaused),
    onSuccess: (data) => {
      queryClient.setQueryData(['queue-session-status'], (prev: any) => ({
        ...prev,
        session: { ...prev.session, isQueuePaused: data.isQueuePaused }
      }))
      setToast(data.isQueuePaused ? 'Queue Auto-Assign PAUSED' : 'Queue Auto-Assign RESUMED')
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
    }
  })

  // We need to safely extract isQueuePaused from the session query payload safely
  const isQueuePaused = sessionStatus?.session?.isQueuePaused || false

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.PROD ? '' : 'http://localhost:5001')

  const toggleJobSelection = (id: string) => {
    setSelectedBatchJobs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllInBatch = () => {
    if (selectedBatchJobs.size === activeBatch.length) {
      setSelectedBatchJobs(new Set())
    } else {
      setSelectedBatchJobs(new Set(activeBatch.map((j: any) => j._id)))
    }
  }

  const bulkCompleteMutation = useMutation({
    mutationFn: (jobIds: string[]) => queueApi.bulkCompleteJobs(jobIds),
    onSuccess: () => {
      setToast(`Completed ${selectedBatchJobs.size} jobs!`)
      setSelectedBatchJobs(new Set())
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
    }
  })

  if (statusLoading) return (
    <div className="queue-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#64748b' }}>
      Loading…
    </div>
  )

  const activeJob = currentJobData?.queueJob
  const walkinJob = currentJobData?.walkinJob
  const activeBatch = currentJobData?.activeBatch || []
  const pausedJobs:   any[] = currentJobData?.pausedJobs   || []

  // Extract IDs of jobs that are already being shown in the active batch (Batch Awareness)
  const activeBatchIds = new Set(activeBatch.map((j: any) => j._id))

  // Use a seenIds Set to track and exclude duplicates across all buckets
  const seenIds = new Set();
  
  // Also pre-add currently active jobs to the exclusion set
  if (walkinJob?._id) seenIds.add(walkinJob._id);
  if (activeJob?._id) seenIds.add(activeJob._id);
  activeBatchIds.forEach(id => seenIds.add(id));

  const pendingWalkins = (currentJobData?.pendingPinnedJobs || [])
    .concat(currentJobData?.pendingTray || [])
    .concat(currentJobData?.pausedJobs || [])
    .filter((j: any) => {
      if (j.type !== 'WALKIN') return false;
      if (seenIds.has(j._id)) return false;
      seenIds.add(j._id);
      return true;
    })
    .sort((a: any, b: any) => {
      if (a.status === 'PAUSED' && b.status !== 'PAUSED') return -1;
      if (a.status !== 'PAUSED' && b.status === 'PAUSED') return 1;
      return 0;
    })

  const pendingQueue = (currentJobData?.pendingPinnedJobs || [])
    .concat(currentJobData?.pendingTray || [])
    .concat(currentJobData?.pausedJobs || [])
    .filter((j: any) => {
      if (j.type === 'WALKIN') return false;
      if (seenIds.has(j._id)) return false;
      seenIds.add(j._id);
      return true;
    })
    .sort((a: any, b: any) => {
      // PAUSED jobs come first for high visibility
      if (a.status === 'PAUSED' && b.status !== 'PAUSED') return -1;
      if (a.status !== 'PAUSED' && b.status === 'PAUSED') return 1;
      return 0;
    })

  const filteredHistory = (myJobs || [])
    .filter((j: any) => j.status === 'COMPLETED')
    .filter((j: any) => {
      if (!historySearch.trim()) return true
      const s = historySearch.toLowerCase()
      return (
        j.customerName?.toLowerCase().includes(s) ||
        j.emailSubject?.toLowerCase().includes(s) ||
        j._id?.toLowerCase().includes(s)
      )
    })

  const isImage = (f: string) => ['jpg','jpeg','png','gif','webp'].includes(f.split('.').pop()?.toLowerCase() || '')
  const visibleAtts = (atts: string[]) => atts.filter(f => !/\.(txt|html|htm)$/i.test(f))

  // Cloud link icon helper
  const cloudIcon = (url: string) => {
    if (url.includes('drive.google.com')) return '🗂'
    if (url.includes('dropbox.com'))      return '📦'
    if (url.includes('we.tl') || url.includes('wetransfer.com')) return '📤'
    return '🔗'
  }


  return (
    <div className="queue-dashboard">
      {/* Connection Status Indicator */}
      {!isSocketConnected && (
        <div className="connection-warning-supreme">
          <span className="warning-dot"></span>
          REAL-TIME DISCONNECTED - RECONNECTING...
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* Celebration Overlay triggered on complete */}
      {showCelebration && <CelebrationOverlay />}

      {/* NAV */}
      <nav className="queue-nav">
        <div className="queue-nav-left">
          <button className="btn-back-luxury" onClick={() => navigate('/prepress')} title="Back to Prepress Dashboard">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="queue-nav-titles">
            <h1 className="queue-title">Prepress Desk</h1>
            <span className="queue-live-status">
              <span className={`status-dot ${sessionStatus?.active ? 'active' : 'inactive'}`}></span>
              {sessionStatus?.active ? 'Live Queue Active' : 'Offline'}
            </span>
          </div>
        </div>

        <div className="queue-nav-right">
          <ModuleNavigation />

          <div className="queue-vertical-divider" />

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {sessionStatus?.active && (
              <>
                <button 
                  className={`btn-queue-nav-action ${isQueuePaused ? 'is-paused' : ''}`}
                  onClick={() => toggleQueuePauseMutation.mutate(!isQueuePaused)}
                  title={isQueuePaused ? "Resume Auto-Assignment" : "Pause Auto-Assignment to focus on Walk-in tasks"}
                >
                  {isQueuePaused ? <span>▶ RESUME QUEUE</span> : <span>⏸ PAUSE QUEUE</span>}
                </button>
                <button 
                  className="btn-queue-nav-action danger" 
                  onClick={() => { if(confirm('End session? Uncompleted queue jobs return to pool.')) endSessionMutation.mutate() }}
                  title="Log out from queue desk"
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  <span>LOGOUT</span>
                </button>
              </>
            )}

            <button 
              className={`btn-queue-nav-action ${hasUnread ? 'comms-unread' : ''}`} 
              onClick={() => setShowMessages(true)}
              title="Open Communication Center"
            >
               <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
               <span>COMMS</span>
               {hasUnread && <span className="unread-dot"></span>}
            </button>

            <button 
              className="btn-queue-nav-action outline" 
              onClick={() => setShowQRModal(true)}
              title="Show QR Code for Walk-in Customers"
            >
               <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
               <span>DESK QR</span>
            </button>
          </div>

          <div className="queue-vertical-divider" />

          <UserMenu />
        </div>
      </nav>

      <div className="dashboard-content">
        
        {/* ⬛ LEFT - Active Job ⬛ */}
        <div className="main-content-supreme">
          {!sessionStatus?.active ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'70vh', padding:'2rem' }}>
              <div className="empty-state" style={{ maxWidth:'480px' }}>
                <h2>Ready to start working?</h2>
                <p>Enter the queue to receive jobs one by one. Jobs are distributed fairly — you won't see what's coming next.</p>
                <button className="btn-start-session" onClick={() => startSessionMutation.mutate()} disabled={startSessionMutation.isPending}>
                  {startSessionMutation.isPending ? 'ENTERING…' : 'START RECEIVING JOBS'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {(!activeJob && !walkinJob && pausedJobs.length === 0) ? (
                <div className="empty-state-supreme">
                  <h2>No jobs strictly assigned to you yet.</h2>
                  <p>Ensure your session is active. Jobs will appear here automatically.</p>
                </div>
              ) : (
                <div className="jobs-view">
                   {showResumeSuggestion && (
                     <div className="suggestion-card-supreme">
                        <div className="sc-icon">📋</div>
                        <div className="sc-content">
                           <h3>You have held jobs!</h3>
                           <p>Would you like to resume your parked work or take something new?</p>
                        </div>
                        <div className="sc-actions">
                           <button className="btn-resume-suggestion" onClick={() => { setShowResumeSuggestion(false); setSidebarTab('QUEUE'); }}>
                             RESUME HELD JOBS
                           </button>
                           <button className="btn-take-new-suggestion" onClick={() => { setShowResumeSuggestion(false); startWalkinJobMutation.mutate({ jobId: 'NEXT' }); }}>
                             TAKE NEW JOB
                           </button>
                        </div>
                     </div>
                   )}

                   {activeBatch.length > 1 && (
                     <div className="batch-header-strip">
                        <div className="bh-info">
                          <span className="bh-badge">BATCH</span>
                          <span className="bh-customer">{activeBatch[0]?.customerName}</span>
                          <span className="bh-count">({activeBatch.length} Jobs Total)</span>
                        </div>
                        <button className="bh-select-all" onClick={selectAllInBatch}>
                          {selectedBatchJobs.size === activeBatch.length ? 'DESELECT ALL' : 'SELECT ALL'}
                        </button>
                     </div>
                   )}

                  <div className="jobs-grid-stream">
                    {walkinJob && (
                      <JobCard 
                        job={walkinJob} 
                        slot="walkin" 
                        profile={profile}
                        selectedBatchJobs={selectedBatchJobs}
                        toggleJobSelection={toggleJobSelection}
                        setShowReassignModal={setShowReassignModal}
                        completeJobMutation={completeJobMutation}
                        pauseJobMutation={pauseJobMutation}
                        startWalkinJobMutation={startWalkinJobMutation}
                        setViewImage={setViewImage}
                        setDownloadingId={setDownloadingId}
                        walkinJob={walkinJob}
                        backendUrl={BACKEND_URL}
                      />
                    )}
                    
                    {/* Continuous Batch Stream */}
                    {Array.isArray(activeBatch) && activeBatch.length > 0 ? (
                      activeBatch.map((j: any) => (
                        <div key={j._id} style={{ marginBottom: '1rem' }}>
                          <JobCard 
                            job={j} 
                            slot="queue" 
                            profile={profile}
                            selectedBatchJobs={selectedBatchJobs}
                            toggleJobSelection={toggleJobSelection}
                            setShowReassignModal={setShowReassignModal}
                            completeJobMutation={completeJobMutation}
                            pauseJobMutation={pauseJobMutation}
                            startWalkinJobMutation={startWalkinJobMutation}
                            setViewImage={setViewImage}
                            setDownloadingId={setDownloadingId}
                            walkinJob={walkinJob}
                            backendUrl={BACKEND_URL}
                          />
                        </div>
                      ))
                    ) : (
                      activeJob && (
                        <JobCard 
                          job={activeJob} 
                          slot="queue" 
                          profile={profile}
                          selectedBatchJobs={selectedBatchJobs}
                          toggleJobSelection={toggleJobSelection}
                          setShowReassignModal={setShowReassignModal}
                          completeJobMutation={completeJobMutation}
                          pauseJobMutation={pauseJobMutation}
                          startWalkinJobMutation={startWalkinJobMutation}
                          setViewImage={setViewImage}
                          setDownloadingId={setDownloadingId}
                          walkinJob={walkinJob}
                          backendUrl={BACKEND_URL}
                        />
                      )
                    )}
                  </div>

                  {/* Floating Bulk Action Bar */}
                  {selectedBatchJobs.size > 0 && (
                    <div className="bulk-action-bar-supreme">
                       <div className="bab-content">
                          <div className="bab-info">
                             <span className="bab-count">{selectedBatchJobs.size}</span>
                             <span className="bab-text">Jobs Selected</span>
                          </div>
                          <div className="bab-actions">
                             <button className="btn-bulk-cancel" onClick={() => setSelectedBatchJobs(new Set())}>CANCEL</button>
                             <button 
                               className="btn-bulk-complete" 
                               onClick={() => bulkCompleteMutation.mutate(Array.from(selectedBatchJobs))}
                               disabled={bulkCompleteMutation.isPending}
                             >
                               {bulkCompleteMutation.isPending ? 'PROCESSING…' : 'MARK COMPLETED'}
                             </button>
                          </div>
                       </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ⬛ RIGHT - Task Sidebar ⬛ */}
        <QueueSidebar 
          sidebarTab={sidebarTab}
          setSidebarTab={setSidebarTab}
          pendingWalkins={pendingWalkins}
          pendingQueue={pendingQueue}
          historySearch={historySearch}
          setHistorySearch={setHistorySearch}
          filteredHistory={filteredHistory}
          poolSearch={poolSearch}
          setPoolSearch={setPoolSearch}
          generalPool={generalPool}
          setPreviewJob={setPreviewJob}
          startWalkinJobMutation={startWalkinJobMutation}
        />
      </div>

      {/* Walk-in Modal */}
      {showWalkinModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal-title">Request Walk-In Approval</h3>
            <p className="modal-subtitle">Describe the walk-in job. Admin will approve it to your parallel slot.</p>
            <textarea value={walkinDescription} onChange={e => setWalkinDescription(e.target.value)} placeholder="Customer name, items, what they need…" className="modal-textarea" />
            <div className="modal-actions">
              <button className="btn-complete" onClick={() => requestWalkinMutation.mutate(walkinDescription)} disabled={requestWalkinMutation.isPending || !walkinDescription.trim()}>
                {requestWalkinMutation.isPending ? 'SENDING…' : 'SEND REQUEST'}
              </button>
              <button className="btn-walkin-request" onClick={() => setShowWalkinModal(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {showReassignModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal-title">Request Reassignment</h3>
            <p className="modal-subtitle">Select a reason to send to the admin for reassignment.</p>
            <select
              value={reassignReason}
              onChange={e => setReassignReason(e.target.value)}
              className="modal-textarea"
              style={{ minHeight: 'auto', padding: '0.75rem', marginBottom: '1.5rem', cursor: 'pointer' }}
            >
              <option value="" disabled>Select Reason...</option>
              {configs?.find((c: any) => c.key === 'reassignment_reasons')?.value?.map((r: any) => (
                <option key={r.id} value={r.label}>{r.label}</option>
              ))}
            </select>
            <div className="modal-actions">
              <button
                className="btn-complete"
                onClick={() => {
                  reassignMutation.mutate({ jobId: showReassignModal, reason: reassignReason })
                }}
                disabled={reassignMutation.isPending || !reassignReason}
              >
                {reassignMutation.isPending ? 'SENDING…' : 'SEND REQUEST'}
              </button>
              <button className="btn-walkin-request" onClick={() => { setShowReassignModal(null); setReassignReason(''); }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Preview Modal */}
      {previewJob && (
        <div className="modal-overlay" onClick={() => { setPreviewJob(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:'700px', width:'90%' }}>
            {(() => {
              const job = previewJob;
              const isHistory = job.status === 'COMPLETED';
              const isPending = job.status === 'QUEUED';
              
              return (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                      <span style={{ 
                        background: isHistory ? '#f1f5f9' : (isPending ? '#eef2ff' : '#ecfdf5'),
                        color: isHistory ? '#64748b' : (isPending ? '#4f46e5' : '#10b981'),
                        fontSize:'0.65rem', fontWeight:950, padding:'0.2rem 0.6rem', borderRadius:'2rem', textTransform:'uppercase'
                      }}>
                        {isHistory ? 'Archived' : (isPending ? 'Pending' : 'Active')}
                      </span>
                      <h3 className="modal-title" style={{ margin:0 }}>Job Details</h3>
                    </div>
                    <button className="btn-close-lightbox" onClick={() => { setPreviewJob(null); }} style={{ padding:'0.25rem 0.5rem' }}>×</button>
                  </div>

                  <div className="job-card-details-p" style={{ maxHeight:'60vh', overflowY:'auto', paddingRight:'10px' }}>
                    <div style={{ marginBottom:'1.5rem' }}>
                        <label style={{ fontSize:'0.7rem', fontWeight: 800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>Customer</label>
                        <div style={{ fontSize: '0.95rem', fontWeight:800, color:'#0f172a' }}>{job.customerName || 'N/A'}</div>
                    </div>

                    <div style={{ marginBottom:'1.5rem' }}>
                        <label style={{ fontSize:'0.7rem', fontWeight: 800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>Subject Line</label>
                        <div style={{ fontSize:'1rem', fontWeight:700, color:'#1e293b', background:'#f8fafc', padding:'0.75rem', borderRadius:'0.5rem', border:'1px solid #e2e8f0' }}>
                          {job.emailSubject || 'No Subject'}
                        </div>
                    </div>

                    <div style={{ marginBottom:'1.5rem' }}>
                        <label style={{ fontSize:'0.7rem', fontWeight: 800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>Instructions / Body</label>
                        <div style={{ 
                          fontSize:'0.875rem', color:'#475569', whiteSpace:'pre-wrap', background:'#f1f5f9', padding:'1rem', borderRadius:'0.75rem', lineHeight:1.6, border:'1px solid #e2e8f0'
                        }}>
                          <LinkifiedText text={job.mailBody || job.walkinDescription || 'No description provided.'} />
                        </div>
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom: '1.5rem' }}>
                        <div style={{ background:'#f8fafc', padding:'0.75rem', borderRadius:'0.5rem' }}>
                           <label style={{ fontSize:'0.6rem', fontWeight: 800, color:'#94a3b8', textTransform:'uppercase' }}>Type</label>
                           <div style={{ fontWeight:700, fontSize:'0.875rem' }}>{job.type}</div>
                        </div>
                        <div style={{ background:'#f8fafc', padding:'0.75rem', borderRadius:'0.5rem' }}>
                           <label style={{ fontSize:'0.6rem', fontWeight: 800, color:'#94a3b8', textTransform:'uppercase' }}>{isHistory ? 'Completed' : 'Received'}</label>
                           <div style={{ fontWeight:700, fontSize:'0.875rem' }}>{new Date(isHistory ? job.completedAt : job.createdAt).toLocaleString()}</div>
                        </div>
                    </div>

                    {Array.isArray(job.externalLinks) && job.externalLinks.length > 0 && (
                      <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ fontSize:'0.7rem', fontWeight: 800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>Cloud Files</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                          {job.externalLinks.map((link: any, i: number) => (
                            <a key={i} href={link.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: '#4f46e5', textDecoration: 'none', background: '#f5f7ff', padding: '0.5rem', borderRadius: '0.4rem', border: '1px solid #e0e7ff' }}>
                              {cloudIcon(link.url)} {link.title}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {Array.isArray(job.attachments) && visibleAtts(job.attachments).length > 0 && (
                      <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ fontSize:'0.7rem', fontWeight: 800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                            Attachments ({visibleAtts(job.attachments).length})
                          </label>
                        </div>
                        <div className="screenshots-grid" style={{ marginTop: '0.5rem' }}>
                          {visibleAtts(job.attachments).map((file: string, idx: number) => {
                            const fileUrl = `${(BACKEND_URL || '').replace(/\/$/, '')}/api/queue/files/${job._id}/${file}?token=${localStorage.getItem('token')}`
                            return (
                              <div key={idx} className="screenshot-item">
                                {isImage(file) ? (
                                  <img src={fileUrl} alt={file} onClick={() => setViewImage(fileUrl)} />
                                ) : (
                                  <div key={idx} className="att-thumb-supreme" title={file} onClick={() => isImage(file) && setViewImage(fileUrl)}>
{file.split('.').pop()?.toUpperCase()}</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="modal-actions" style={{ marginTop:'2rem' }}>
                    {isPending ? (
                      <button 
                        className="btn-complete" 
                        style={{ width:'100%', background: job.type === 'WALKIN' ? '#10b981' : '#4f46e5' }} 
                        onClick={() => { startWalkinJobMutation.mutate(job._id); setPreviewJob(null); }}
                      >
                        {job.type === 'WALKIN' ? 'TAKE WALKIN JOB' : 'START QUEUE JOB'}
                      </button>
                    ) : (
                      <button className="btn-complete" style={{ width:'100%' }} onClick={() => { setPreviewJob(null); }}>CLOSE PREVIEW</button>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {viewImage && (
        <div className="lightbox-modal">
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={viewImage || ''} className="lightbox-img" alt="Enlarged" />
            <div className="lightbox-actions">
              <button className="btn-download-lightbox" onClick={() => {
                downloadWithAuth(viewImage.split('?')[0], viewImage.split('/').pop()?.split('?')[0] || 'download')
              }}>DOWNLOAD</button>
              <button className="btn-close-lightbox" onClick={() => setViewImage(null)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* Messaging */}
      <MessagingTray
        isOpen={showMessages}
        onClose={() => { setShowMessages(false); setHasUnread(false); setChatSettings({ recipient:'', jobId:'', prefill:'' }) }}
        currentUser={{ id: profile?._id || profile?.id || profile?.userId || '', name: profile?.name || 'Staff', role: 'STAFF' }}
        socket={socket as any}
        onlineStaff={[]}
        allStaff={staffList || []}
        initialRecipient={chatSettings.recipient}
        initialJobId={chatSettings.jobId}
        prefilledMessage={chatSettings.prefill}
      />
      {/* QR Code Modal for Walk-ins */}
      {showQRModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', marginBottom: '0.5rem' }}>DESK QR CODE</h2>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>Ask the customer to scan this code to upload files directly to your queue.</p>
            
            <div style={{ background: '#f8faff', padding: '1.5rem', borderRadius: '1.5rem', display: 'inline-block', marginBottom: '1.5rem', border: '2px solid #e2e8f0' }}>
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${import.meta.env.VITE_WALKIN_PORTAL_URL || 'http://localhost:5001'}/${myStaffId}`)}`} 
                alt="Walk-in QR Code"
                style={{ width: '250px', height: '250px', display: 'block' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button className="btn-supreme-black" onClick={() => window.print()}>PRINT STICKER</button>
              <button className="btn-secondary" onClick={() => setShowQRModal(false)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
