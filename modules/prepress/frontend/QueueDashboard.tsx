import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queueApi } from '@core/services/queueApi'
import { api } from '@core/services/api'
import { useQueueSocket } from '@core/hooks/useQueueSocket'
import { useQueueListeners } from './hooks/useQueueListeners'
import UserMenu from '@core/components/UserMenu'
import ModuleNavigation from '@core/components/ModuleNavigation'
import { MessagingTray } from '@core/shared/components/MessagingTray'
import LinkifiedText from '@core/shared/components/LinkifiedText'
import { downloadWithAuth } from '@core/utils/queueHelpers'
import { getBackendUrl } from '@core/utils/backendUrl'
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
  const [pendingHold, setPendingHold] = useState<{ jobId: string; fetchNext: boolean; isHardPin: boolean } | null>(null)
  const [holdReason, setHoldReason] = useState('')
  const [showCelebration, setShowCelebration] = useState(false)
  const [, setDownloadingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showQRModal, setShowQRModal] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [poolSearch, setPoolSearch] = useState('')
  const [sidebarTab, setSidebarTab] = useState<'WALKIN' | 'QUEUE' | 'HISTORY' | 'SEARCH'>('WALKIN')
  const [previewJob, setPreviewJob] = useState<any>(null)
  const [showResumeSuggestion, setShowResumeSuggestion] = useState(false)
  const [historyType, setHistoryType] = useState<'TODAY' | 'OLDER'>('TODAY')
  const [debouncedHistorySearch, setDebouncedHistorySearch] = useState('')

  // Job Creation Integration States
  const [showPromptModal, setShowPromptModal] = useState<any>(null)
  const [showSelectionModal, setShowSelectionModal] = useState<any>(null)

  // ── Extract phone number from email/walkin body text ─────────────────────
  const extractPhoneFromBody = (text: string): string | null => {
    if (!text) return null
    const clean = text.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')

    // Strategy 1: labelled — "mob: +91 9884042854", "phone: 638330 2979"
    const labelled = clean.match(
      /(?:mob(?:ile)?|ph(?:one)?|cell(?:ular)?|contact|tel(?:ephone)?|whatsapp)\s*[:\-\.]?\s*((?:\+91[-\s]?)?[6-9]\d{3,4}[-\s]?\d{4,6})/i
    )
    if (labelled) {
      const n = labelled[1].replace(/\D/g, '')
      const norm = n.length === 12 && n.startsWith('91') ? n.slice(2) : n
      if (norm.length === 10) return norm
    }

    // Strategy 2: +91 prefix anywhere
    const cc = clean.match(/\+91[-\s]?([6-9]\d{4}[-\s]?\d{5})/)
    if (cc) {
      const norm = cc[1].replace(/\D/g, '')
      if (norm.length === 10) return norm
    }

    // Strategy 3: bare 10-digit mobile with word boundary
    const bare = clean.match(/\b([6-9]\d{9})\b/)
    if (bare) return bare[1]

    // Strategy 4: 10-digit glued to text (no word boundary)
    const glued = clean.match(/(?<![0-9])([6-9]\d{9})(?![0-9])/)
    if (glued) return glued[1]

    // Strategy 5: split format "638330 2979"
    const split = clean.match(/\b([6-9]\d{5,6})\s(\d{3,4})\b/)
    if (split) {
      const combined = split[1] + split[2]
      if (combined.length === 10) return combined
    }

    return null
  }

  // ── Extract real customer name from email body "Name: gopalan subramanian" ─
  const extractNameFromBody = (text: string): string | null => {
    if (!text) return null

    // "Name:    gopalan subramanian"
    const labelled = text.match(/^Name\s*[:\-]\s*(.+)$/im)
    if (labelled) {
      const name = labelled[1].trim()
      if (name && name.length > 2 && !/\d/.test(name) && !name.includes('@')) return name
    }

    // "From:    gopalan subramanian (email@domain.com)"
    const fromLine = text.match(/^From\s*[:\-]\s*([^(\n<]+?)(?:\s*[(<][^)>]+[)>])?\s*$/im)
    if (fromLine) {
      const name = fromLine[1].trim()
      if (name && name.length > 2 && !name.includes('@') && !/\d/.test(name)) return name
    }

    return null
  }

  const launchJobDetection = async (job: any) => {
    try {
      let customerName = job.customerName || 'Walk-in Customer';
      let customerPhone = '';

      if (job.type === 'WALKIN') {
        customerPhone = job.customerPhone || '';
        // Look up real customer name from DB by phone
        if (customerPhone) {
          try {
            const res = await api.get(`/api/prepress/customer/by-phone/${encodeURIComponent(customerPhone)}`)
            if (res.data?.name) customerName = res.data.name
          } catch (_) { /* silent – fallback to queue name */ }
        }
      } else if (job.type === 'WHATSAPP') {
        customerPhone = job.customerEmail ? job.customerEmail.split('@')[0] : '';
        // Look up real customer name from DB by phone
        if (customerPhone) {
          try {
            const res = await api.get(`/api/prepress/customer/by-phone/${encodeURIComponent(customerPhone)}`)
            if (res.data?.name) customerName = res.data.name
          } catch (_) { /* silent – fallback to queue name */ }
        }
      } else if (job.type === 'EMAIL') {
        const emailKey = (job.customerEmail || '').toLowerCase().trim()

        // ✅ Read from the shared React Query cache first (JobCard already fetched & cached this)
        const cached = queryClient.getQueryData<any>(['email-mapping', emailKey])

        const resolved = cached !== undefined
          ? cached   // use cache (may be null if not mapped)
          : await (async () => {
              // Cache miss — re-fetch with normalised email
              try {
                const res = await api.get(`/api/prepress/customer-by-email?email=${encodeURIComponent(emailKey)}`)
                return res.data || null
              } catch (e) {
                console.warn("Email lookup failed, ignoring mapping...", e)
                return null
              }
            })()

        if (resolved) {
          customerName = resolved.name
          customerPhone = resolved.phone
        }
      }

      // ── Fallback: extract phone (and name) from email/walkin body ──────────
      if (!customerPhone) {
        const bodyText = job.mailBody || job.walkinDescription || ''
        const bodyPhone = extractPhoneFromBody(bodyText)
        if (bodyPhone) {
          customerPhone = bodyPhone
          // Try to resolve customer name from DB by extracted phone
          try {
            const res = await api.get(`/api/prepress/customer/by-phone/${encodeURIComponent(bodyPhone)}`)
            if (res.data?.name) {
              customerName = res.data.name
            } else {
              // DB has no record — try to get real name from body "Name:" line
              const bodyName = extractNameFromBody(bodyText)
              if (bodyName) customerName = bodyName
            }
          } catch (_) {
            const bodyName = extractNameFromBody(bodyText)
            if (bodyName) customerName = bodyName
          }
        }
      }

      // If still no phone — navigate with just the name (user fills in phone)
      if (!customerPhone) {
        navigate(`/prepress/create?customerName=${encodeURIComponent(customerName)}&queueJobId=${job._id}&viaMarkComplete=true`);
        return;
      }

      // Search today's jobs
      let todayJobs: any[] = [];
      try {
        const res = await api.get(`/api/prepress/jobs/search/today?phone=${encodeURIComponent(customerPhone)}`)
        // Normalise: backend returns a plain array, but guard against any unexpected shape
        todayJobs = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.jobs) ? res.data.jobs : []);
      } catch (err) {
        // Despatch failure protection: warn and do not block
        alert("Queue Job Completed Successfully\n\nUnable to open Job Creation workflow.\nPlease create the Job ID manually later.");
        return;
      }

      if (todayJobs.length > 0) {
        // Show selection dialog
        setShowSelectionModal({
          completedJob: job,
          customerName,
          customerPhone,
          todayJobs
        });
      } else {
        // Directly open new job form prefilled
        navigate(`/prepress/create?customerName=${encodeURIComponent(customerName)}&customerPhone=${encodeURIComponent(customerPhone)}&queueJobId=${job._id}&viaMarkComplete=true`);
      }
    } catch (err) {
      console.error("Job detection flow failed:", err);
      alert("Queue Job Completed Successfully\n\nUnable to open Job Creation workflow.\nPlease create the Job ID manually later.");
    }
  }

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedHistorySearch(historySearch), 300)
    return () => clearTimeout(handler)
  }, [historySearch])

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

  const { data: olderHistory } = useQuery({
    queryKey: ['older-history', debouncedHistorySearch],
    queryFn: () => queueApi.getOlderHistory(debouncedHistorySearch),
    enabled: sidebarTab === 'HISTORY' && historyType === 'OLDER' && debouncedHistorySearch.trim().length > 0,
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
    mutationFn: () => queueApi.startSession(),
    onSuccess: (data) => {
      // Set session active immediately
      queryClient.setQueryData(['queue-session-status'], { active: true, session: { id: data.session?.id, loginAt: data.session?.loginAt, isQueuePaused: false } })
      // If a job was auto-assigned, put it in cache; otherwise leave null and let refetch fill it
      if (data.currentJob) {
        const normJob = JSON.parse(JSON.stringify(data.currentJob))
        queryClient.setQueryData(['current-queue-job'], { active: true, queueJob: normJob, walkinJob: null, pausedJobs: [], pendingPinnedJobs: [], pendingTray: [], activeBatch: [] })
      } else {
        queryClient.setQueryData(['current-queue-job'], { active: true, queueJob: null, walkinJob: null, pausedJobs: [], pendingPinnedJobs: [], pendingTray: [], activeBatch: [] })
      }
      // Force a fresh server sync after a short delay to pick up anything assigned by background sweep
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['queue-session-status'] })
        queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
      }, 800)
    },
    onError: (err: any) => {
      setToast(`Failed to start session: ${(err as any)?.response?.data?.message || err.message || 'Server error'}`)
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
    mutationFn: (job: any) => queueApi.completeJob(typeof job === 'string' ? job : job._id),
    onSuccess: (data, job) => {
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

      // ── Job Creation Integration ─────────────────────────────────────────
      // Only trigger if configs are loaded AND behavior is explicitly set (never default to AUTO/PROMPT)
      const completionBehavior = configs?.find((c: any) => c.key === 'queueCompletionBehavior')?.value
      const completedJob = typeof job === 'string' ? { _id: job, type: 'UNKNOWN' } : job
      if (completionBehavior === 'AUTO') {
        launchJobDetection(completedJob)
      } else if (completionBehavior === 'PROMPT') {
        setShowPromptModal(completedJob)
      }
      // If completionBehavior is 'QUEUE_ONLY' or undefined/not loaded, do nothing
    },
    onError: (err: any) => setToast(`Completion Failed: ${err.message || 'System Error'}`)
  })
  const pauseJobMutation = useMutation({
    mutationFn: ({ jobId, fetchNext, isHardPin = false, reason = '' }: { jobId: string; fetchNext: boolean; isHardPin?: boolean; reason?: string }) => queueApi.pauseJob(jobId, fetchNext, isHardPin, reason),
    onSuccess: (_, variables) => { 
      setToast(variables.isHardPin ? 'Job Pinned!' : (variables.fetchNext ? 'Job parked — next job incoming' : 'Job parked — waiting for walk-in')); 
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] }); 
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] }) 
    },
    onError: (err: any) => setToast(`Hold Failed: ${err.message || 'Busy'}`)
  })

  const handleHoldClick = (jobId: string, fetchNext: boolean, isHardPin: boolean) => {
    if (isHardPin) {
      pauseJobMutation.mutate({ jobId, fetchNext, isHardPin: true, reason: '' })
    } else {
      setPendingHold({ jobId, fetchNext, isHardPin: false })
      setHoldReason('')
    }
  }
  const startWalkinJobMutation = useMutation({
    mutationFn: ({ jobId, takeAll = false }: { jobId: string, takeAll?: boolean }) => queueApi.takeJob(jobId, takeAll),
    onSuccess: (data: any) => { 
      if (data?.previousOwnerName) {
        setToast(`Successfully taken from ${data.previousOwnerName}`);
      } else {
        setToast('Job taken!');
      }
      // Immediately update cache so the job appears without waiting for refetch
      if (data?.job) {
        const takenJob = data.job
        // Normalise the job: ensure _id and any ObjectId refs are plain strings
        // (the API response already does this, but guard against Mongoose objects)
        const normJob = JSON.parse(JSON.stringify(takenJob))
        // Ensure session appears active
        queryClient.setQueryData(['queue-session-status'], (prev: any) => ({
          ...(prev || {}),
          active: true
        }))
        // Update current-job cache optimistically — do NOT invalidate right after
        // as the invalidation races with this setQueryData and can wipe it
        queryClient.setQueryData(['current-queue-job'], (prev: any) => {
          if (normJob.type === 'WALKIN') {
            return { ...(prev || {}), active: true, walkinJob: normJob, queueJob: prev?.queueJob || null }
          } else {
            return { ...(prev || {}), active: true, queueJob: normJob, walkinJob: prev?.walkinJob || null }
          }
        })
      }
      // Refresh history and pool — but do NOT invalidate current-queue-job or
      // session-status here to avoid disabling the query mid-render
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
      queryClient.invalidateQueries({ queryKey: ['general-pool'] })
      // Delayed sync to let the optimistic update render first
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
      }, 1500)
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

  const BACKEND_URL = getBackendUrl()

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
    onSuccess: (_, variables) => {
      setToast(`Completed ${selectedBatchJobs.size} jobs!`)
      
      // Get completed job details for integration flow
      const completedJobs = activeBatch.filter((j: any) => variables.includes(j._id))
      const completedJob = completedJobs[0]
      
      setSelectedBatchJobs(new Set())
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
      
      // ── Job Creation Integration ─────────────────────────────────────────
      // Only trigger if admin explicitly set AUTO or PROMPT (never default to it)
      if (completedJob) {
        const completionBehavior = configs?.find((c: any) => c.key === 'queueCompletionBehavior')?.value
        if (completionBehavior === 'AUTO') {
          launchJobDetection(completedJob)
        } else if (completionBehavior === 'PROMPT') {
          setShowPromptModal(completedJob)
        }
      }
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

  const filteredHistory = historyType === 'TODAY'
    ? (myJobs || [])
        .filter((j: any) => j.status === 'COMPLETED')
        .filter((j: any) => {
          if (!historySearch.trim()) return true
          const s = historySearch.toLowerCase()
          return j.customerName?.toLowerCase().includes(s)
        })
    : (Array.isArray(olderHistory) ? olderHistory : [])

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
                        onHoldClick={handleHoldClick}
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
                            onHoldClick={handleHoldClick}
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
                          onHoldClick={handleHoldClick}
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
          historyType={historyType}
          setHistoryType={setHistoryType}
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

      {/* Hold Reason Modal */}
      {pendingHold && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal-title">Put Job on Hold</h3>
            <p className="modal-subtitle">Select a reason for putting this job on hold.</p>
            <select
              value={holdReason}
              onChange={e => setHoldReason(e.target.value)}
              className="modal-textarea"
              style={{ minHeight: 'auto', padding: '0.75rem', marginBottom: '1.5rem', cursor: 'pointer' }}
            >
              <option value="" disabled>Select Hold Reason...</option>
              {configs?.find((c: any) => c.key === 'hold_reasons')?.value?.map((r: any) => (
                <option key={r.id} value={r.label}>
                  {r.label} ({r.behavior === 'RETURN_TO_POOL' ? `${r.timeLimit || 15}m limit, returns to pool` : 'stays hold'})
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button
                className="btn-complete"
                onClick={() => {
                  pauseJobMutation.mutate({
                    jobId: pendingHold.jobId,
                    fetchNext: pendingHold.fetchNext,
                    isHardPin: pendingHold.isHardPin,
                    reason: holdReason
                  });
                  setPendingHold(null);
                  setHoldReason('');
                }}
                disabled={pauseJobMutation.isPending || !holdReason}
              >
                {pauseJobMutation.isPending ? 'HOLDING…' : 'CONFIRM HOLD'}
              </button>
              <button className="btn-walkin-request" onClick={() => { setPendingHold(null); setHoldReason(''); }}>CANCEL</button>
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
                      <div className="attachments-supreme" style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <label style={{ fontSize:'0.7rem', fontWeight: 800, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', margin: 0 }}>
                            Attachments ({visibleAtts(job.attachments).length})
                          </label>
                          <button 
                            onClick={() => {
                              const url = `${(BACKEND_URL || '').replace(/\/$/, '')}/api/attachments/${job._id}/download-all`;
                              const cleanSubject = (job.emailSubject || 'Job').replace(/[/\\?%*:|"<>]/g, '-');
                              downloadWithAuth(url, `${cleanSubject}.zip`);
                            }}
                            style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase' }}
                          >
                            Download All (ZIP)
                          </button>
                        </div>
                        <div className="attachments-grid-supreme" style={{ marginTop: '0.5rem' }}>
                          {visibleAtts(job.attachments).map((file: string, idx: number) => {
                            const fileUrl = `${(BACKEND_URL || '').replace(/\/$/, '')}/api/queue/files/${job._id}/${file}?token=${localStorage.getItem('token')}`
                            return (
                              <div 
                                key={idx} 
                                className="att-thumb-supreme" 
                                title={file} 
                                onClick={() => {
                                  if (isImage(file)) {
                                    setViewImage(fileUrl);
                                  } else {
                                    const cleanUrl = fileUrl.split('?')[0];
                                    downloadWithAuth(cleanUrl, file);
                                  }
                                }}
                              >
                                {isImage(file) ? (
                                  <img src={fileUrl} alt={file} />
                                ) : (
                                  <div className="file-icon-placeholder">
                                    <span>{file.split('.').pop()?.toUpperCase()}</span>
                                  </div>
                                )}
                                {/* Filename Overlay on Hover */}
                                <div className="att-hover-name">{file}</div>
                                {/* Mini Download Button Overlay */}
                                <button 
                                  className="mini-dl-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const cleanUrl = fileUrl.split('?')[0];
                                    downloadWithAuth(cleanUrl, file);
                                  }}
                                  title="Download File"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                </button>
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
                        onClick={() => { startWalkinJobMutation.mutate({ jobId: job._id }); setPreviewJob(null); }}
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
      {/* ── PROMPT Modal: Ask staff if they want to create a job ── */}
      {showPromptModal && (
        <div className="modal-overlay" style={{ zIndex: 99997 }}>
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📋</div>
              <h3 className="modal-title" style={{ margin: 0 }}>Create a Job?</h3>
              <p className="modal-subtitle" style={{ marginTop: '0.5rem' }}>
                Queue job completed for <strong>{showPromptModal.customerName || 'this customer'}</strong>.
                <br />Would you like to open the Job Creation form?
              </p>
            </div>
            <div className="modal-actions" style={{ gap: '0.75rem' }}>
              <button
                className="btn-complete"
                style={{ flex: 1, background: '#4f46e5' }}
                onClick={() => { const job = showPromptModal; setShowPromptModal(null); launchJobDetection(job); }}
              >
                YES, CREATE JOB
              </button>
              <button
                className="btn-walkin-request"
                style={{ flex: 1 }}
                onClick={() => setShowPromptModal(null)}
              >
                NO THANKS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SELECTION Modal: Existing jobs found for customer today ── */}
      {showSelectionModal && (
        <div className="modal-overlay" style={{ zIndex: 99997 }}>
          <div className="modal" style={{ maxWidth: '520px' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 className="modal-title">Existing Jobs Found Today</h3>
              <p className="modal-subtitle">
                <strong>{showSelectionModal.customerName}</strong> already has {(showSelectionModal.todayJobs || []).length} job(s) today.
                Link to an existing one or create a new job.
              </p>
            </div>

            {/* Existing jobs list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', maxHeight: '260px', overflowY: 'auto' }}>
              {(Array.isArray(showSelectionModal.todayJobs) ? showSelectionModal.todayJobs : []).map((j: any) => (
                <div
                  key={j._id}
                  style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: '0.75rem', padding: '0.85rem 1rem',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#0f172a' }}>
                      {j.jobId || (j._id ? j._id.slice(-6).toUpperCase() : '')} — {j.subject || j.title || j.customerName || 'Job'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                      {j.jobStatus || j.status || 'PENDING'} · {j.createdAt ? new Date(j.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                  <button
                    className="btn-complete"
                    style={{ fontSize: '0.7rem', padding: '0.4rem 0.9rem', whiteSpace: 'nowrap' }}
                    onClick={() => {
                      navigate(`/prepress/edit/${j.jobId}?queueJobId=${showSelectionModal.completedJob._id}&viaMarkComplete=true`)
                      setShowSelectionModal(null)
                    }}
                  >
                    VIEW JOB
                  </button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="modal-actions" style={{ gap: '0.75rem' }}>
              <button
                className="btn-complete"
                style={{ flex: 1, background: '#10b981' }}
                onClick={() => {
                  const { customerName, customerPhone, completedJob } = showSelectionModal
                  setShowSelectionModal(null)
                  navigate(`/prepress/create?customerName=${encodeURIComponent(customerName)}&customerPhone=${encodeURIComponent(customerPhone)}&queueJobId=${completedJob._id}&viaMarkComplete=true`)
                }}
              >
                + NEW JOB
              </button>
              <button
                className="btn-walkin-request"
                style={{ flex: 1 }}
                onClick={() => setShowSelectionModal(null)}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

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
