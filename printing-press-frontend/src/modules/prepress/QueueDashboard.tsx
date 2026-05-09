import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queueApi } from '../../services/queueApi'
import { useQueueSocket } from '../../hooks/useQueueSocket'
import UserMenu from '../../components/UserMenu'
import ModuleNavigation from '../../components/ModuleNavigation'
import { MessagingTray } from '../../shared/components/MessagingTray'
import LinkifiedText from '../../shared/components/LinkifiedText'
import { elapsed, formatSubject } from '../../shared/utils/queueHelpers'
import './QueueDashboard.css'

// ─── Helpers (formatSubject imported from shared/utils/queueHelpers) ─────


// FIX-L1 / FIX-L2: Clipboard works on LAN HTTP without HTTPS
function safeCopy(text: string, onDone?: (label: string) => void) {
  const legacy = () => {
    const el = document.createElement('textarea')
    el.value = text
    el.style.cssText = 'position:fixed;opacity:0;top:0;left:0;width:1px;height:1px'
    document.body.appendChild(el)
    el.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(el)
    onDone?.('Copied!')
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => onDone?.('Copied!')).catch(legacy)
  } else {
    legacy()
  }
}

// FIX-D1: Authenticated download — <a> tags don't send Authorization header
async function downloadWithAuth(url: string, filename: string, onStart?: () => void, onEnd?: () => void) {
  onStart?.()
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
  } catch (err: any) {
    alert(`Download failed: ${err.message}`)
  } finally {
    onEnd?.()
  }
}



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
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showQRModal, setShowQRModal] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [sidebarTab, setSidebarTab] = useState<'WALKIN' | 'QUEUE' | 'HISTORY'>('WALKIN')
  const [previewJob, setPreviewJob] = useState<any>(null)

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

  useEffect(() => {
    if (!socket) return
    const onJobAssigned = (data: any) => {
      // 1. Update the primary slots
      queryClient.setQueryData(['current-queue-job'], (prev: any) => {
        if (!prev) return prev;
        const next = {
          ...prev, active: true,
          [data.slot === 'walkin' ? 'walkinJob' : 'queueJob']: data.job
        };
        
        // 2. Also ensure it's added to the activeBatch if it belongs there
        if (next.queueJob?.customerEmail && data.job?.customerEmail === next.queueJob.customerEmail) {
          const batch = [...(next.activeBatch || [])];
          if (!batch.find(j => j._id === data.job._id)) {
            batch.push(data.job);
          }
          next.activeBatch = batch;
        }
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
    }
    const onJobPaused  = () => { queryClient.invalidateQueries({ queryKey: ['current-queue-job'] }); queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] }) }
    const onJobResumed = () => { queryClient.invalidateQueries({ queryKey: ['current-queue-job'] }) }
    const onJobRemoved = () => {
      // Instant cache clear for removed jobs - don't wait for refetch
      queryClient.setQueryData(['current-queue-job'], (prev: any) => ({
        ...(prev || {}),
        queueJob: null,
        active: true
      }))
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
    }
    const onChatReceived = (msg: any) => {
      if (String(msg.sender).trim() !== String(profile?._id || profile?.id).trim()) setHasUnread(true)
    }
    const onJobPinned = (data: any) => {
      setToast(data.message || 'A new job was pinned to your queue.');
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
    }
    const refreshReview = () => {
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] });
    }

    const onBatchNewJob = (data: any) => {
      setToast(data.message || 'New job added to your current batch!');
      // Update local query data instantly to show the new card
      queryClient.setQueryData(['current-queue-job'], (prev: any) => {
        if (!prev) return prev;
        const batch = [...(prev.activeBatch || [])];
        // Only add if not already there
        if (!batch.find(j => j._id === data.job._id)) {
           batch.push(data.job);
        }
        return { ...prev, activeBatch: batch };
      });
    }

    const onConnect = () => setIsSocketConnected(true)
    const onDisconnect = () => setIsSocketConnected(false)

    socket.on('connect',        onConnect)
    socket.on('disconnect',     onDisconnect)
    socket.on('job:assigned',   onJobAssigned)
    socket.on('job:paused',     onJobPaused)
    socket.on('job:resumed',    onJobResumed)
    socket.on('job:removed',    onJobRemoved)
    socket.on('job:pinned',     onJobPinned)
    socket.on('batch:new-job',  onBatchNewJob)
    socket.on('chat:received',  onChatReceived)
    socket.on('walkin:requested', refreshReview)
    socket.on('reassign:requested', refreshReview)

    return () => {
      socket.off('connect',        onConnect)
      socket.off('disconnect',     onDisconnect)
      socket.off('job:assigned',   onJobAssigned)
      socket.off('job:paused',     onJobPaused)
      socket.off('job:resumed',    onJobResumed)
      socket.off('job:removed',    onJobRemoved)
      socket.off('job:pinned',     onJobPinned)
      socket.off('batch:new-job',  onBatchNewJob)
      socket.off('chat:received',  onChatReceived)
      socket.off('walkin:requested', refreshReview)
      socket.off('reassign:requested', refreshReview)
    }

  }, [socket, queryClient, profile?._id, profile?.id])

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
      if (data.nextJob) {
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
    mutationFn: (jobId: string) => queueApi.startWalkinJob(jobId),
    onSuccess: () => { 
      setToast('Switching job...');
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

  const BACKEND_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_BACKEND_URL || '')

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

  const pendingWalkins = (currentJobData?.pendingPinnedJobs || [])
    .concat(currentJobData?.pendingTray || [])
    .filter((j: any) => j.type === 'WALKIN')

  // Extract IDs of jobs that are already being shown in the active batch
  const activeBatchIds = new Set(activeBatch.map((j: any) => j._id))

  const pendingQueue = (currentJobData?.pendingPinnedJobs || [])
    .concat(currentJobData?.pendingTray || [])
    .concat(currentJobData?.pausedJobs || [])
    .filter((j: any) => j.type !== 'WALKIN')
    .filter((j: any) => !activeBatchIds.has(j._id)) // Remove jobs already shown in the batch stream
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

  const renderJobCard = (job: any, slot: 'queue' | 'walkin') => {
    let cleanBody = job.mailBody || ''
    cleanBody = cleanBody.replace(/^---\s*email_body\.txt\s*---\s*\n?/i, '')

    const priorityInfo = (() => {
      const score = job.priorityScore || 0
      if (score >= 20) return { class: 'priority-immediate', label: 'CRITICAL', color: '#ef4444' }
      if (score >= 10) return { class: 'priority-high', label: 'URGENT', color: '#dc2626' }
      if (score >= 5)  return { class: 'priority-medium', label: 'HIGH', color: '#f59e0b' }
      return { class: 'priority-low', label: '', color: '' }
    })()

    return (
      <div className={`active-job-card-supreme ${priorityInfo.class} ${selectedBatchJobs.has(job._id) ? 'is-selected-batch' : ''}`}>
        {/* Top Header Row */}
        <div className="job-card-top-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Selection Checkbox */}
            <div className="job-selection-wrapper" onClick={(e) => { e.stopPropagation(); toggleJobSelection(job._id); }} style={{ position: 'relative', top: 'auto', left: 'auto', marginRight: '0.25rem' }}>
               <div className={`job-checkbox ${selectedBatchJobs.has(job._id) ? 'checked' : ''}`}>
                 {selectedBatchJobs.has(job._id) && '✓'}
               </div>
            </div>
            <div className="job-badge-black">JOB</div>
            <div className="job-hash-gray">#{job._id.substring(job._id.length - 6).toUpperCase()}</div>
            {priorityInfo.label && (
              <div 
                style={{ background: priorityInfo.color, color: 'white', fontWeight: 800, fontSize: '0.65rem', padding: '0.2rem 0.6rem', borderRadius: '2rem', letterSpacing: '0.05em', animation: 'pulse-revision 2s infinite' }}
              >
                {priorityInfo.label}
              </div>
            )}
            {job.reassignedFrom && (
              <div 
                className="handoff-alert-bubble"
                style={{ 
                  display: 'flex', flexDirection: 'column', gap: '0.2rem', 
                  background: '#fff7ed', border: '1px solid #ffedd5', color: '#9a3412',
                  padding: '0.4rem 1rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 700,
                  maxWidth: '400px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.9rem' }}>⤨</span>
                  <span style={{ fontWeight: 800 }}>FROM {job.reassignedFrom.name?.toUpperCase() || 'PREVIOUS'}</span>
                </div>
                {job.staffHandoffReason && (
                    <div style={{ opacity: 0.8, fontSize: '0.65rem', borderLeft: '2px solid #fdba74', paddingLeft: '0.5rem', marginTop: '0.2rem' }}>
                        Requested: "{job.staffHandoffReason}"
                    </div>
                )}
                {job.adminHandoffNotes && (
                    <div style={{ fontWeight: 800, color: '#c2410c' }}>
                        Admin: "{job.adminHandoffNotes}"
                    </div>
                )}
                {!job.staffHandoffReason && !job.adminHandoffNotes && job.handoffNotes && (
                    <div style={{ fontStyle: 'italic' }}>{job.handoffNotes}</div>
                )}
              </div>
            )}
          </div>
          {slot === 'queue' && (
            <button
              className="reassign-icon-btn"
              onClick={() => setShowReassignModal(job._id)}
              disabled={job.status === 'PAUSED'}
              title="Reassign Job"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          )}
        </div>

        {/* Customer & Subject */}
        <div className="job-card-title-group">
          {job.type === 'WHATSAPP' && job.customerEmail ? (
             <h1 className="job-customer-massive" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {job.customerName || 'Walk-in Customer'}
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981', background: '#ecfdf5', padding: '0.2rem 0.6rem', borderRadius: '2rem', border: '1px solid #d1fae5' }}>
                   📱 {job.customerEmail.split('@')[0]}
                </span>
             </h1>
          ) : (
             <h1 className="job-customer-massive">{job.customerName || 'Walk-in Customer'}</h1>
          )}
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
            {(() => {
              const { time, clean } = formatSubject(job.emailSubject || '')
              return (
                <>
                  {time && (
                    <span style={{ 
                      fontSize: '0.95rem', 
                      fontWeight: 800, 
                      color: '#4338ca', 
                      background: '#eef2ff', 
                      padding: '0.4rem 0.8rem', 
                      borderRadius: '0.75rem', 
                      border: '1px solid #c7d2fe',
                      boxShadow: '0 4px 6px -1px rgba(67, 56, 202, 0.1), 0 2px 4px -1px rgba(67, 56, 202, 0.06)',
                      letterSpacing: '-0.01em',
                      display: 'inline-block',
                      marginBottom: '0.5rem',
                      fontFamily: 'Inter, system-ui, sans-serif'
                    }}>
                      {time}
                    </span>
                  )}
                  <h3 className="job-subject-sub" style={{ margin:0 }}>
                    {clean || (job.type === 'WALKIN' ? job.walkinDescription : 'No Subject')}
                  </h3>
                </>
              )
            })()}
          </div>
        </div>

        {/* Mail Body / Notes Container */}
        {(cleanBody || job.walkinDescription) && (
          <div className="job-mail-box-gray">
            <pre className="mail-pre-text" style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
              <LinkifiedText text={cleanBody || job.walkinDescription} />
            </pre>
          </div>
        )}

        {/* External Links */}
        {job.externalLinks && job.externalLinks.length > 0 && (
          <div className="external-links-premium">
            <div className="section-divider-text"><span>☁ Cloud Files</span></div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem', marginBottom:'1.5rem' }}>
              {job.externalLinks.map((link: any, idx: number) => {
                const age = job.createdAt ? elapsed(job.createdAt) : ''
                const isOld = age.includes('⚠')
                return (
                  <div key={idx} className="cloud-link-card" style={{ borderColor: isOld ? '#fca5a5' : undefined }}>
                    <div className="cloud-link-info">
                      <div className="cloud-icon-bg" style={{ background: isOld ? '#fef2f2' : undefined, fontSize:'1.1rem' }}>
                        {cloudIcon(link.url)}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <span className="cloud-link-title">{link.title}</span>
                        {isOld && <div style={{ fontSize:'0.65rem', color:'#ef4444', fontWeight:700, marginTop:'0.1rem' }}>⚠ {age}</div>}
                        {!isOld && age && <div style={{ fontSize:'0.65rem', color:'#94a3b8', marginTop:'0.1rem' }}>{age}</div>}
                        <p className="cloud-link-url">{link.url?.substring(0, 48)}…</p>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:'0.5rem', flexShrink:0 }}>
                      <button className="btn-cloud-action" onClick={() => safeCopy(link.url, (label) => setToast(label))}>COPY</button>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="btn-cloud-action primary">OPEN ↗</a>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Attachments */}
        {job.attachments && visibleAtts(job.attachments).length > 0 && (
          <div className="attachment-section" style={{ marginBottom:'1.5rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <p style={{ margin:0, fontWeight:700, fontSize:'0.8125rem', color:'#475569' }}>
                Attachments ({visibleAtts(job.attachments).length})
              </p>
              {visibleAtts(job.attachments).length >= 1 && (
                <button
                  className="btn-history-pill"
                  disabled={downloadingId === `all-${job._id}`}
                  onClick={() => {
                    const { clean } = formatSubject(job.emailSubject || '');
                    const zipName = `${clean || job.customerName || job._id}_attachments.zip`;
                    downloadWithAuth(
                      `${BACKEND_URL}/api/attachments/${job._id}/download-all`,
                      zipName,
                      () => setDownloadingId(`all-${job._id}`),
                      () => setDownloadingId(null)
                    )
                  }}
                >
                  {downloadingId === `all-${job._id}` ? 'ZIPPING…' : 'DOWNLOAD ALL (ZIP)'}
                </button>
              )}
            </div>
            <div className="screenshots-grid">
              {visibleAtts(job.attachments).map((file: string, idx: number) => {
                // fileUrl has token in query string — needed for <img src> (img tags can't send custom headers)
                const fileUrl = `${BACKEND_URL}/api/queue/files/${job._id}/${file}?token=${localStorage.getItem('token')}`
                // cleanUrl has NO token in URL — downloadWithAuth sends it via Authorization header instead
                const cleanUrl = `${BACKEND_URL}/api/queue/files/${job._id}/${file}`
                const dlId = `file-${job._id}-${idx}`
                return (
                  <div key={idx} className="screenshot-item">
                    {isImage(file)
                      ? <img src={fileUrl} alt={file} onClick={() => setViewImage(fileUrl)} />
                      : <div className="file-attachment-badge" onClick={() => window.open(fileUrl)}>{file.split('.').pop()?.toUpperCase()}</div>
                    }
                    <div className="attachment-filename-label">{file}</div>
                    <button
                      className="btn-download-mini"
                      disabled={downloadingId === dlId}
                      onClick={e => {
                        e.stopPropagation()
                        // Use cleanUrl — token is sent via Authorization header by downloadWithAuth
                        downloadWithAuth(cleanUrl, file, () => setDownloadingId(dlId), () => setDownloadingId(null))
                      }}
                    >
                      DOWNLOAD
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Handled By - Streamlined with semantic pills */}
        {slot === 'queue' && (
          <div style={{ marginTop:'1rem', padding:'0.5rem 1rem', background:'linear-gradient(135deg,#f8faff,#f1f5f9)', border:'1px solid #e2e8f0', borderRadius:'0.875rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.75rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', minWidth:0, flex:1 }}>
              <div style={{ width:26, height:26, borderRadius:'50%', background:'#0f172a', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight: 800, fontSize:'0.7rem', flexShrink:0 }}>
                {(profile?.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', minWidth:0, flexWrap:'wrap' }}>
                <span style={{ fontSize:'0.75rem', color:'#1e293b', fontWeight: 800 }}>HANDLED BY {profile?.name || 'YOU'}</span>
                
                {job.returnReason && (
                   <span style={{ display:'flex', alignItems:'center', gap:'0.25rem', fontSize:'0.65rem', fontWeight:850, color:'#991b1b', background:'#fef2f2', border:'1px solid #fee2e2', padding:'0.15rem 0.5rem', borderRadius:'2rem' }}>
                     ⚠ {job.returnReason.includes('Inactivity') ? 'HEARTBEAT TIMEOUT' : job.returnReason.toUpperCase()}
                   </span>
                )}

                {job.continuityContext && (
                   <span style={{ fontSize:'0.7rem', color:'#64748b', fontWeight:600 }}>• Continuity Sync</span>
                )}
              </div>
            </div>
            {job.version && job.version > 1 && (
              <div style={{ background:'#0f172a', color:'white', fontWeight: 800, fontSize:'0.6rem', padding:'0.15rem 0.6rem', borderRadius:'2rem' }}>v{job.version}</div>
            )}
          </div>
        )}

        {/* Footer with refined, smaller buttons */}
        <div className="job-footer-supreme" style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          {job.status !== 'PAUSED' && (
            <button
              className="btn-supreme-black"
              style={{
                padding: '0.6rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: 800,
                borderRadius: '0.75rem',
                flex: 1,
                minWidth: '140px'
              }}
              onClick={() => completeJobMutation.mutate(job._id)}
              disabled={completeJobMutation.isPending || (slot === 'queue' && !!walkinJob)}
            >
              {completeJobMutation.isPending ? 'COMPLETING…' : 'MARK COMPLETE'}
            </button>
          )}

          {slot === 'queue' && job.status !== 'PAUSED' && !walkinJob && (
              <button
                className="btn-supreme-outline-orange"
                style={{
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  borderRadius: '0.75rem',
                  border: '2px solid #f59e0b',
                  color: '#b45309',
                  background: 'white',
                  flex: 1,
                  minWidth: '120px'
                }}
                onClick={() => pauseJobMutation.mutate({ jobId: job._id, fetchNext: true })}
                disabled={pauseJobMutation.isPending}
                title="Hold this job and get the next one in queue"
              >
                HOLD & NEXT
              </button>
          )}



          {/* Simple HOLD Button (New) */}
          {job.status !== 'PAUSED' && slot === 'queue' && (
            <button 
              className="btn-supreme-outline-orange" 
              style={{
                padding: '0.6rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: 800,
                borderRadius: '0.75rem',
                border: '2px solid #f97316',
                color: '#ea580c',
                background: 'white',
                flex: 1,
                minWidth: '120px'
              }}
              onClick={() => pauseJobMutation.mutate({ jobId: job._id, fetchNext: false })}
              disabled={pauseJobMutation.isPending}
            >
              HOLD
            </button>
          )}

          {/* RESUME Button */}
          {job.status === 'PAUSED' && slot === 'queue' && (
            <button 
              className="btn-supreme-outline-blue" 
              style={{
                padding: '0.6rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: 800,
                borderRadius: '0.75rem',
                border: '2px solid #3b82f6',
                color: '#2563eb',
                background: 'white',
                flex: 1,
                minWidth: '120px'
              }}
              onClick={() => startWalkinJobMutation.mutate(job._id)}
              disabled={startWalkinJobMutation.isPending}
            >
              {startWalkinJobMutation.isPending ? 'RESUMING...' : 'RESUME'}
            </button>
          )}
        </div>
      </div>
    )
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

      <div className="dashboard-content" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 3fr)', gap: '2rem', padding: '2rem', maxWidth: '1600px', margin: '0 auto', alignItems: 'start' }}>
        
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
                    {walkinJob && renderJobCard(walkinJob, 'walkin')}
                    
                    {/* Continuous Batch Stream: Renders all cards for the customer vertically */}
                    {activeBatch.length > 0 ? (
                      activeBatch.map((j: any) => (
                        <div key={j._id} style={{ marginBottom: '1rem' }}>
                           {renderJobCard(j, 'queue')}
                        </div>
                      ))
                    ) : (
                      activeJob && renderJobCard(activeJob, 'queue')
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
        <div className="sidebar-supreme">
          <div className="sidebar-tab-nav">
            <button className={`sidebar-tab-btn ${sidebarTab === 'WALKIN' ? 'active' : ''}`} onClick={() => setSidebarTab('WALKIN')}>
              WALK-INS
              {pendingWalkins.length > 0 && <span className="tab-badge-dot" />}
            </button>
            <button className={`sidebar-tab-btn ${sidebarTab === 'QUEUE' ? 'active' : ''}`} onClick={() => setSidebarTab('QUEUE')}>
              MY QUEUE
              {pendingQueue.length > 0 && <span className="tab-badge-dot blue" />}
            </button>
            <button className={`sidebar-tab-btn ${sidebarTab === 'HISTORY' ? 'active' : ''}`} onClick={() => setSidebarTab('HISTORY')}>
              HISTORY
            </button>
          </div>

          <div className="sidebar-tab-content">
            {sidebarTab === 'WALKIN' && (
              <div className="sidebar-list-view">
                {pendingWalkins.length === 0 ? (
                  <div className="sidebar-empty-state">No walk-ins via your QR code.</div>
                ) : (
                  pendingWalkins.map((job: any) => (
                    <div key={job._id} className="sidebar-job-row" onClick={() => setPreviewJob(job)}>
                      <div className="sj-main">
                        <div className="sj-name">{job.customerName}</div>
                        <div className="sj-meta">{elapsed(job.createdAt)} ago</div>
                      </div>
                      <button className="sj-action-btn" onClick={(e) => { e.stopPropagation(); startWalkinJobMutation.mutate(job._id); }}>
                        {startWalkinJobMutation.isPending ? '...' : 'TAKE'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {sidebarTab === 'QUEUE' && (
              <div className="sidebar-list-view">
                {pendingQueue.length === 0 ? (
                  <div className="sidebar-empty-state">No jobs pinned to you.</div>
                ) : (
                  pendingQueue.map((job: any) => (
                    <div key={job._id} className={`sidebar-job-row ${job.status === 'PAUSED' ? 'is-on-hold' : ''}`} onClick={() => setPreviewJob(job)}>
                      <div className="sj-main">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <div className="sj-name">{job.customerName}</div>
                          {job.status === 'PAUSED' && (
                            <span style={{ fontSize: '0.65rem', background: '#fef2f2', color: '#dc2626', padding: '0.1rem 0.4rem', borderRadius: '0.3rem', fontWeight: 900, border: '1px solid #fee2e2' }}>HOLD</span>
                          )}
                        </div>
                        <div className="sj-meta">
                          {job.status === 'PAUSED' ? `Reason: ${job.pauseReason || 'General Hold'}` : `${job.emailSubject?.substring(0, 20)}...`}
                        </div>
                      </div>
                      <button 
                        className={`sj-action-btn ${job.status === 'PAUSED' ? 'orange' : 'blue'}`} 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          // Use the universal mutation for both start and resume
                          startWalkinJobMutation.mutate(job._id);
                        }}
                      >
                        {startWalkinJobMutation.isPending ? '...' : (job.status === 'PAUSED' ? 'RESUME' : 'TAKE')}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {sidebarTab === 'HISTORY' && (
              <div className="sidebar-list-view">
                <div className="history-search-wrapper" style={{ padding: '0.5rem 0.75rem' }}>
                  <input 
                    type="text" 
                    placeholder="Search history..." 
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    className="history-search-input"
                  />
                </div>
                <div className="sidebar-scroll-mini" style={{ padding: '0 0.5rem' }}>
                  {filteredHistory.length === 0 ? (
                    <div className="sidebar-empty-state">No matching history.</div>
                  ) : (
                    filteredHistory.map((job: any) => (
                      <div key={job._id} className="sidebar-job-row" onClick={() => setPreviewJob(job)}>
                        <div className="sj-main">
                          <div className="sj-name">{job.customerName}</div>
                          <div className="sj-meta">{new Date(job.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                        <span className={`sj-badge ${job.type === 'WHATSAPP' ? 'wa' : ''}`}>
                          {job.type === 'WHATSAPP' ? 'WA' : job.type}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
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

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                        <div style={{ background:'#f8fafc', padding:'0.75rem', borderRadius:'0.5rem' }}>
                           <label style={{ fontSize:'0.6rem', fontWeight: 800, color:'#94a3b8', textTransform:'uppercase' }}>Type</label>
                           <div style={{ fontWeight:700, fontSize:'0.875rem' }}>{job.type}</div>
                        </div>
                        <div style={{ background:'#f8fafc', padding:'0.75rem', borderRadius:'0.5rem' }}>
                           <label style={{ fontSize:'0.6rem', fontWeight: 800, color:'#94a3b8', textTransform:'uppercase' }}>{isHistory ? 'Completed' : 'Received'}</label>
                           <div style={{ fontWeight:700, fontSize:'0.875rem' }}>{new Date(isHistory ? job.completedAt : job.createdAt).toLocaleString()}</div>
                        </div>
                    </div>
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
                // Strip token query param from URL — downloadWithAuth sends auth via header
                const cleanViewUrl = (viewImage || '').split('?')[0]
                const dlFilename = cleanViewUrl.split('/').pop() || 'download'
                downloadWithAuth(cleanViewUrl, dlFilename)
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
