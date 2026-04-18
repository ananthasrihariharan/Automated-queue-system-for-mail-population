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

// ─── Helpers (elapsed + formatSubject imported from shared/utils/queueHelpers) ─────

function linkAge(stored: string | Date): string {
  const days = Math.floor((Date.now() - new Date(stored).getTime()) / 86_400_000)
  if (days === 0) return 'received today'
  if (days === 1) return '1 day old'
  if (days >= 7)  return `⚠ ${days} days old — may be expired`
  return `${days} days old`
}


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
    <div className="celebration-overlay">
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

  // Messaging
  const [showMessages, setShowMessages] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [chatSettings, setChatSettings] = useState<{ recipient: string; jobId: string; prefill: string }>({ recipient: '', jobId: '', prefill: '' })

  // UI
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [showWalkinModal, setShowWalkinModal] = useState(false)
  const [walkinDescription, setWalkinDescription] = useState('')
  const [showReassignModal, setShowReassignModal] = useState<string | null>(null)
  const [reassignReason, setReassignReason] = useState('')
  const [showCelebration, setShowCelebration] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // 1. Profile
  useEffect(() => {
    const s = localStorage.getItem('user')
    if (s) setProfile(JSON.parse(s))
  }, [])

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
      queryClient.setQueryData(['current-queue-job'], (prev: any) => ({
        ...prev, active: true,
        [data.slot === 'walkin' ? 'walkinJob' : 'queueJob']: data.job
      }))
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
    socket.on('job:assigned',   onJobAssigned)
    socket.on('job:paused',     onJobPaused)
    socket.on('job:resumed',    onJobResumed)
    socket.on('job:removed',    onJobRemoved)
    socket.on('chat:received',  onChatReceived)
    return () => {
      socket.off('job:assigned',   onJobAssigned)
      socket.off('job:paused',     onJobPaused)
      socket.off('job:resumed',    onJobResumed)
      socket.off('job:removed',    onJobRemoved)
      socket.off('chat:received',  onChatReceived)
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
    }
  })
  const pauseJobMutation = useMutation({
    mutationFn: (jobId: string) => queueApi.pauseJob(jobId),
    onSuccess: () => { setToast('Job parked — next job incoming'); queryClient.invalidateQueries({ queryKey: ['current-queue-job'] }); queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] }) }
  })
  const resumeJobMutation = useMutation({
    mutationFn: (jobId: string) => queueApi.resumeJob(jobId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['current-queue-job'] }) }
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

  if (statusLoading) return (
    <div className="queue-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#64748b' }}>
      Loading…
    </div>
  )

  const activeJob = currentJobData?.queueJob
  const walkinJob = currentJobData?.walkinJob
  const pausedJobs:   any[] = currentJobData?.pausedJobs   || []
  const pendingTray:  any[] = currentJobData?.pendingTray  || []

  const isImage = (f: string) => ['jpg','jpeg','png','gif','webp'].includes(f.split('.').pop()?.toLowerCase() || '')
  const visibleAtts = (atts: string[]) => atts.filter(f => !/\.(txt|html|htm)$/i.test(f))
  const completedMyJobs = (myJobs || []).filter((j:any) => j.status === 'COMPLETED')

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
      <div className={`active-job-card-supreme ${priorityInfo.class}`}>
        {/* Top Header Row */}
        <div className="job-card-top-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div className="job-badge-black">JOB</div>
            <div className="job-hash-gray">#{job._id.substring(job._id.length - 6).toUpperCase()}</div>
            {priorityInfo.label && (
              <div 
                style={{ background: priorityInfo.color, color: 'white', fontWeight: 900, fontSize: '0.65rem', padding: '0.2rem 0.6rem', borderRadius: '2rem', letterSpacing: '0.05em', animation: 'pulse-revision 2s infinite' }}
              >
                {priorityInfo.label}
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
          <h1 className="job-customer-massive">{job.customerName || 'Walk-in Customer'}</h1>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
            {(() => {
              const { time, clean } = formatSubject(job.emailSubject || '')
              return (
                <>
                  {time && (
                    <span style={{ fontSize:'0.75rem', fontWeight:800, color:'#64748b', background:'#f1f5f9', padding:'0.2rem 0.6rem', borderRadius:'0.4rem', border:'1px solid #e2e8f0' }}>
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
                const age = job.createdAt ? linkAge(job.createdAt) : ''
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
              {visibleAtts(job.attachments).length > 1 && (
                <button
                  className="btn-history-pill"
                  disabled={downloadingId === `all-${job._id}`}
                  onClick={() => downloadWithAuth(
                    `${BACKEND_URL}/api/attachments/${job._id}/download-all`,
                    `${job.customerName || job._id}_files.zip`,
                    () => setDownloadingId(`all-${job._id}`),
                    () => setDownloadingId(null)
                  )}
                >
                  {downloadingId === `all-${job._id}` ? 'ZIPPING…' : 'DOWNLOAD ALL'}
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
              <div style={{ width:26, height:26, borderRadius:'50%', background:'#0f172a', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:'0.7rem', flexShrink:0 }}>
                {(profile?.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', minWidth:0, flexWrap:'wrap' }}>
                <span style={{ fontSize:'0.75rem', color:'#1e293b', fontWeight:900 }}>HANDLED BY {profile?.name || 'YOU'}</span>
                
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
              <div style={{ background:'#0f172a', color:'white', fontWeight:900, fontSize:'0.6rem', padding:'0.15rem 0.6rem', borderRadius:'2rem' }}>v{job.version}</div>
            )}
          </div>
        )}

        {/* Footer exactly matching screenshot without Reassign */}
        <div className="job-footer-supreme">
          {job.status !== 'PAUSED' && (
            <button
              className="btn-supreme-black"
              onClick={() => completeJobMutation.mutate(job._id)}
              disabled={completeJobMutation.isPending || (slot === 'queue' && !!walkinJob)}
            >
              {completeJobMutation.isPending ? 'COMPLETING…' : 'MARK COMPLETE'}
            </button>
          )}

          {slot === 'queue' && job.status !== 'PAUSED' && !walkinJob && (
            <button
              className="btn-supreme-outline-orange"
              onClick={() => pauseJobMutation.mutate(job._id)}
              disabled={pauseJobMutation.isPending}
            >
              PAUSE (HOLD)
            </button>
          )}

          {!walkinJob && slot === 'queue' && (
            <button className="btn-supreme-outline-gray" onClick={() => setShowWalkinModal(true)}>
              WALK-IN
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="queue-dashboard">
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

          {sessionStatus?.active && (
            <>
              <button 
                className={`btn-queue-nav-action ${isQueuePaused ? 'is-paused' : ''}`}
                onClick={() => toggleQueuePauseMutation.mutate(!isQueuePaused)}
                title={isQueuePaused ? "Resume Auto-Assignment" : "Pause Auto-Assignment to focus on Walk-in tasks"}
              >
                {isQueuePaused ? <span>▶ RESUME AUTO-ASSIGN</span> : <span>⏸ PAUSE AUTO-ASSIGN</span>}
              </button>
              <button 
                className="btn-queue-nav-action outline" 
                onClick={() => { if(confirm('End session? Uncompleted queue jobs return to pool.')) endSessionMutation.mutate() }}
                title="Log out from queue desk"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>END SESSION</span>
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
                  <div className="jobs-grid">
                  {walkinJob && renderJobCard(walkinJob, 'walkin')}
                  {activeJob  && renderJobCard(activeJob,  'queue')}

                  {/* Paused jobs */}
                  {pausedJobs.length > 0 && (
                    <div style={{ marginTop:'1rem' }}>
                      <div style={{ fontSize:'0.65rem', fontWeight:900, color:'#b45309', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.75rem' }}>
                        <span style={{ background:'#fef3c7', padding:'0.2rem 0.6rem', borderRadius:'0.4rem' }}>⏸ Parked Jobs ({pausedJobs.length})</span>
                      </div>
                      {pausedJobs.map((pJob: any) => (
                        <div key={pJob._id} style={{ background:'white', border:'1px solid #e2e8f0', borderLeft:'6px solid #f59e0b', borderRadius:'1rem', padding:'1rem 1.25rem', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
                          <div>
                            <div style={{ fontWeight:800, color:'#0f172a' }}>{pJob.customerName}</div>
                            <div style={{ fontSize:'0.8125rem', color:'#64748b', fontStyle:'italic' }}>{pJob.emailSubject}</div>
                            {pJob.assignedAt && <div style={{ fontSize:'0.7rem', color:'#94a3b8', marginTop:'0.25rem' }}>Parked {elapsed(pJob.updatedAt || pJob.assignedAt)} ago</div>}
                          </div>
                          <button
                            className="btn-complete"
                            style={{ background:'#f59e0b', minWidth:'100px' }}
                            onClick={() => resumeJobMutation.mutate(pJob._id)}
                            disabled={resumeJobMutation.isPending}
                          >
                            ▶ RESUME
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pending pinned tray */}
                  {pendingTray.length > 0 && (
                    <div style={{ marginTop:'1rem', padding:'1rem 1.25rem', background:'#f8f9ff', border:'1px solid #c7d2fe', borderRadius:'1rem' }}>
                      <div style={{ fontSize:'0.65rem', fontWeight:900, color:'#4f46e5', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.75rem' }}>
                        📋 Coming Up — Pinned to You ({pendingTray.length})
                      </div>
                      {pendingTray.map((pJob: any) => (
                        <div key={pJob._id} style={{ display:'flex', justifyContent:'space-between', padding:'0.75rem', background:'white', borderRadius:'0.75rem', marginBottom:'0.5rem', border:'1px solid #e2e8f0' }}>
                          <div>
                            <div style={{ fontWeight:700, fontSize:'0.875rem' }}>{pJob.customerName}</div>
                            <div style={{ fontSize:'0.75rem', color:'#64748b' }}>{pJob.emailSubject}</div>
                          </div>
                          <span style={{ background:'#e0e7ff', color:'#4338ca', fontSize:'0.65rem', fontWeight:900, padding:'0.25rem 0.5rem', borderRadius:'2rem', alignSelf:'center' }}>PINNED</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>)}
        </div>

        {/* ⬛ RIGHT - Handled Today (Sidebar) ⬛ */}
        <div className="sidebar-supreme">
          <div className="handled-today-card">
            <div className="handled-header">
              <h2>HANDLED TODAY</h2>
              <span className="handled-count">{completedMyJobs.length}</span>
            </div>
            
            <table className="handled-table">
              <thead>
                <tr>
                  <th>CUSTOMER</th>
                  <th style={{ textAlign:'right' }}>TYPE</th>
                </tr>
              </thead>
              <tbody>
                {completedMyJobs.length === 0 ? (
                  <tr>
                    <td colSpan={2} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>No jobs yet.</td>
                  </tr>
                ) : (
                  completedMyJobs.map((job:any) => (
                    <tr key={job._id}>
                      <td className="handled-customer">{job.customerName || job.emailSubject?.substring(0,18)}</td>
                      <td style={{ textAlign:'right' }}>
                        <span className="handled-type-badge">{job.type}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
              <option value="Missing Software / Incorrect File Format">Missing Software / File Format</option>
              <option value="Missing Fonts or Asset Links">Missing Fonts or Asset Links</option>
              <option value="Requires Specialist Designer">Requires Specialist Designer</option>
              <option value="Too complex for current workload">Too complex for workload</option>
              <option value="Customer requested stop / pause">Customer requested stop / pause</option>
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

      {/* Lightbox */}
      {viewImage && (
        <div className="lightbox-modal">
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={viewImage} className="lightbox-img" alt="Enlarged" />
            <div className="lightbox-actions">
              <button className="btn-download-lightbox" onClick={() => {
                // Strip token query param from URL — downloadWithAuth sends auth via header
                const cleanViewUrl = viewImage.split('?')[0]
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
    </div>
  )
}
