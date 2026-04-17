import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Socket } from 'socket.io-client'
import { api } from '../../services/api'
import '../styles/MessagingTray.css'

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Message {
  _id: string
  sender: string
  senderName: string
  recipientId: string
  jobId?: string | null
  body: string
  timestamp: string
  type: 'DIRECT' | 'BROADCAST'
}

interface StaffMember {
  _id: string
  name: string
  role?: string
  roles?: string[]
}

interface MessagingTrayProps {
  isOpen: boolean
  onClose: () => void
  currentUser: { id: string; name: string; role: string }
  socket: Socket | null
  onlineStaff?: any[]
  allStaff?: StaffMember[]
  initialRecipient?: string
  initialJobId?: string
  prefilledMessage?: string
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const resolveIdFromToken = (): string => {
  try {
    const token = localStorage.getItem('token')
    if (!token) return ''
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const pay = JSON.parse(decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')))
    const rawId = pay.userId || pay.id || pay._id || pay.sub || pay.customerId || ''
    return String(rawId).trim().toLowerCase()
  } catch { return '' }
}

const fmtTime = (ts: string) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const fmtDate = (ts: string) => {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' })
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export const MessagingTray: React.FC<MessagingTrayProps> = ({
  isOpen,
  onClose,
  currentUser,
  socket,
  onlineStaff = [],
  allStaff = [],
  initialRecipient,
  initialJobId = '',
  prefilledMessage = ''
}) => {
  const [view, setView] = useState<'LIST' | 'THREAD'>('LIST')
  const [selectedThread, setSelectedThread] = useState<string>('all')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [activeJobId, setActiveJobId] = useState(initialJobId)
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})
  const [connStatus, setConnStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting')
  const [typingThreads, setTypingThreads] = useState<Record<string, string>>({}) // threadId → name
  const [socketOnlineList, setSocketOnlineList] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Stable resolved user ID
  /* ── My identity: prioritized from active profile or token ────────────── */
  const myId = useMemo(() => {
    const raw = currentUser.id || resolveIdFromToken()
    return raw ? String(raw).trim().toLowerCase() : ''
  }, [currentUser.id])

  /* ── Build unified staff map ─────────────────────────────────────────── */
  const staffMap = useMemo<Map<string, StaffMember>>(() => {
    const map = new Map<string, StaffMember>()
    if (Array.isArray(allStaff)) {
      allStaff.forEach(s => map.set(s._id, s))
    }
    if (Array.isArray(onlineStaff)) {
      onlineStaff.forEach(sess => {
        if (sess.staffId && !map.has(sess.staffId._id)) {
          map.set(String(sess.staffId._id), { _id: String(sess.staffId._id), name: sess.staffId.name, role: sess.staffId.role })
        }
      })
    }
    return map
  }, [allStaff, onlineStaff])

  const onlineSet = useMemo(() => {
    const set = new Set<string>()
    if (Array.isArray(onlineStaff)) {
      onlineStaff.forEach(s => {
        const id = s.user?._id || s.user?.id || s.userId || s.staffId?._id || s.staffId || ''
        if (id) set.add(String(id).trim())
      })
    }
    if (Array.isArray(socketOnlineList)) {
      socketOnlineList.forEach(id => {
        if (id) set.add(String(id).trim())
      })
    }
    return set
  }, [onlineStaff, socketOnlineList])

  const otherStaff = useMemo(() =>
    Array.from(staffMap.values()).filter(s => s._id !== myId),
    [staffMap, myId]
  )

  /* ── Socket: connection status ───────────────────────────────────────── */
  useEffect(() => {
    if (!socket) { setConnStatus('connecting'); return }
    const update = () => setConnStatus(socket.connected ? 'connected' : 'disconnected')
    update()
    socket.on('connect', update)
    socket.on('disconnect', update)
    return () => { socket.off('connect', update); socket.off('disconnect', update) }
  }, [socket])

  /* ── Load message history & unread counts whenever tray opens ──────── */
  useEffect(() => {
    if (!isOpen) return   // only run when tray is actually open

    // 1. Fetch History (last 7 days, backend now returns 7-day window)
    api.get('/api/messages')
      .then(res => {
        const normalized = (Array.isArray(res.data) ? res.data : []).map(m => ({
          ...m,
          sender: String(m.sender).trim().toLowerCase(),
          recipientId: String(m.recipientId).trim().toLowerCase(),
          _id: String(m._id).trim().toLowerCase()
        }))
        setMessages(normalized)
      })
      .catch(err => {
        console.error('[Comms] Failed to load history:', err.message)
        setMessages([])
      })

    // 2. Fetch Unread Counts
    api.get('/api/messages/unread')
      .then(res => {
        setUnreadMap(res.data || {})
      })
      .catch(err => console.error('[Comms] Failed to load unreads:', err.message))
  }, [])

  /* ── Open tray: navigate to correct thread ───────────────────────────── */
  useEffect(() => {
    if (!isOpen) return
    if (initialRecipient) {
      const tid = String(initialRecipient).trim().toLowerCase()
      setSelectedThread(tid)
      setView('THREAD')
      
      // Clear unread on server + locally
      api.post('/api/messages/read', { threadId: tid }).catch(() => {})
      setUnreadMap(prev => { const n = { ...prev }; delete n[tid]; return n })
    }
    if (initialJobId) setActiveJobId(initialJobId)
    if (prefilledMessage) setInput(prefilledMessage)
  }, [isOpen, initialRecipient, initialJobId, prefilledMessage])

  /* ── Clear unread when switching threads while tray is open ──────────── */
  useEffect(() => {
    if (view === 'THREAD' && selectedThread && isOpen) {
       const tid = String(selectedThread).trim().toLowerCase()
       api.post('/api/messages/read', { threadId: tid }).catch(() => {})
       setUnreadMap(prev => { const n = { ...prev }; delete n[tid]; return n })
    }
  }, [view, selectedThread, isOpen])

  /* ── Socket: incoming messages ───────────────────────────────────────── */
  useEffect(() => {
    if (!socket) return

    const handleMsg = (msg: Message) => {
      const m = { 
        ...msg, 
        sender: String(msg.sender).trim().toLowerCase(), 
        recipientId: String(msg.recipientId).trim().toLowerCase(), 
        _id: String(msg._id).trim().toLowerCase() 
      }

      setMessages(prev => {
        // [FIX] Step 1: Exact duplicate check by real _id
        if (prev.some(x => String(x._id).trim().toLowerCase() === m._id)) return prev

        // [FIX] Step 2: Find and replace the matching optimistic message.
        // The optimistic message has _id starting with 'optimistic-' and matches
        // the same sender + body content. This prevents the message from appearing twice.
        const optimisticIdx = prev.findIndex(
          x => x._id.startsWith('optimistic-') &&
               x.sender === m.sender &&
               x.body === m.body
        )
        if (optimisticIdx !== -1) {
          // Replace the placeholder with the real persisted message
          const updated = [...prev]
          updated[optimisticIdx] = m
          return updated
        }

        // Step 3: New message from someone else — append it
        return [...prev, m]
      })

      // Determine which thread this belongs to
      const isBcast = m.recipientId === 'all'
      const threadId = isBcast ? 'all' : (m.sender === myId ? m.recipientId : m.sender)

      const isCurrentThread = view === 'THREAD' && String(selectedThread).trim().toLowerCase() === threadId && isOpen
      const isFromMe = m.sender === myId

      if (!isCurrentThread && !isFromMe) {
        setUnreadMap(prev => ({ ...prev, [threadId]: (prev[threadId] || 0) + 1 }))
      } else if (isCurrentThread) {
        // If we're looking at the thread, immediately clear it on the server too
        api.post('/api/messages/read', { threadId }).catch(() => {})
      }
    }

    const handleTyping = (data: { fromId: string; fromName: string; toId: string }) => {
      const tid = String(data.toId).trim().toLowerCase()
      const fid = String(data.fromId).trim().toLowerCase()

      // Typing for 'all' broadcast: visible to everyone except self
      if (tid === 'all') {
        if (fid === myId) return
        setTypingThreads(prev => ({ ...prev, 'all': data.fromName }))
        clearTimeout(typingTimers.current['all'])
        typingTimers.current['all'] = setTimeout(() => {
          setTypingThreads(prev => { const n = { ...prev }; delete n['all']; return n })
        }, 2500)
        return
      }

      // Direct message: only relevant to the recipient
      const isForMe = tid === myId
      if (!isForMe || fid === myId) return

      const threadId = fid
      setTypingThreads(prev => ({ ...prev, [threadId]: data.fromName }))
      clearTimeout(typingTimers.current[threadId])
      typingTimers.current[threadId] = setTimeout(() => {
        setTypingThreads(prev => { const n = { ...prev }; delete n[threadId]; return n })
      }, 2500)
    }

    const handleOnlineList = (list: string[]) => setSocketOnlineList(list)

    socket.on('chat:received', handleMsg)
    socket.on('chat:typing', handleTyping)
    socket.on('system:online-list', handleOnlineList)
    
    return () => {
      socket.off('chat:received', handleMsg)
      socket.off('chat:typing', handleTyping)
      socket.off('system:online-list', handleOnlineList)  // named ref — clean
    }
  }, [socket, myId, selectedThread, view, isOpen])

  /* ── Auto‑scroll ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, selectedThread, view])

  /* ── Typing emit ─────────────────────────────────────────────────────── */
  const typingEmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleInputChange = (val: string) => {
    setInput(val)
    if (!socket || !socket.connected || !myId) return
    if (typingEmitTimer.current) clearTimeout(typingEmitTimer.current)
    socket.emit('chat:typing', { 
      fromId: myId, 
      fromName: currentUser.name, 
      toId: String(selectedThread).trim().toLowerCase() 
    })
    typingEmitTimer.current = setTimeout(() => {}, 1500) // debounce
  }

  /* ── Send message ────────────────────────────────────────────────────── */
  const handleSend = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !socket?.connected || !myId) return

    const payload = {
      fromId: myId,
      fromName: currentUser.name || 'System User',
      toId: String(selectedThread).trim().toLowerCase(),
      jobId: activeJobId || null,
      message: input.trim()
    }

    // [Deep Fix] Optimistic Update: Add message locally first for zero-latency feel
    const tempMsg: Message = {
      _id: `optimistic-${Date.now()}`,
      sender: myId,
      senderName: currentUser.name || 'System User',
      recipientId: String(selectedThread).trim().toLowerCase(),
      body: input.trim(),
      timestamp: new Date().toISOString(),
      type: (String(selectedThread).trim().toLowerCase() === 'all') ? 'BROADCAST' : 'DIRECT'
    }
    setMessages(prev => [...prev, tempMsg])

    socket.emit('chat:send', payload)
    setInput('')
  }, [input, socket, myId, currentUser.name, selectedThread, activeJobId])

  /* ── Thread filter ───────────────────────────────────────────────────── */
  const threadMessages = useMemo(() => {
    if (!selectedThread || !Array.isArray(messages)) return []
    const tid = String(selectedThread).trim().toLowerCase()
    
    return messages.filter(m => {
      const ms = String(m.sender).trim().toLowerCase()
      const mr = String(m.recipientId).trim().toLowerCase()

      if (tid === 'all') return mr === 'all'

      const involveMe = ms === myId || mr === myId
      const involveThem = ms === tid || mr === tid
      return mr !== 'all' && involveMe && involveThem
    })
  }, [messages, selectedThread, myId])

  /* ── Thread Discovery & Last message map ───────────────────────────── */
  const lastMsgMap = useMemo(() => {
    const map: Record<string, Message> = {}
    if (Array.isArray(messages)) {
      messages.forEach(msg => {
        const mr = String(msg.recipientId).toLowerCase()
        const ms = String(msg.sender).toLowerCase()
        const threadId = mr === 'all' ? 'all' : (ms === myId ? mr : ms)

        if (!map[threadId] || new Date(msg.timestamp) > new Date(map[threadId].timestamp)) {
          map[threadId] = msg
        }
      })
    }
    return map
  }, [messages, myId])

  /* ── Sorted Conversation List ────────────────────────────────────────── */
  const sortedConversations = useMemo(() => {
    const threads: any[] = []
    
    // 1. Always include Broadcast channel
    threads.push({
      id: 'all',
      name: 'Broadcast Channel',
      isBroadcast: true,
      lastMsg: lastMsgMap['all']
    })

    otherStaff.forEach(s => {
      threads.push({
        id: s._id,
        name: s.name,
        isBroadcast: false,
        lastMsg: lastMsgMap[s._id]
      })
    })

    // Sort by last message timestamp — most recent conversation first
    return threads.sort((a, b) => {
      const timeA = a.lastMsg ? new Date(a.lastMsg.timestamp).getTime() : 0
      const timeB = b.lastMsg ? new Date(b.lastMsg.timestamp).getTime() : 0
      return timeB - timeA
    })
  }, [otherStaff, lastMsgMap])

  /* ── Open thread ─────────────────────────────────────────────────────── */
  const openThread = (id: string) => {
    setSelectedThread(id)
    setView('THREAD')
    setActiveJobId('')
    setInput('')
    setUnreadMap(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const getThreadName = (id: string) => {
    if (id === 'all') return 'Broadcast Channel'
    return staffMap.get(id)?.name || 'Unknown'
  }

  /* ── Group messages by date ──────────────────────────────────────────── */
  const groupedMessages = useMemo(() => {
    const groups: { date: string; msgs: Message[] }[] = []
    threadMessages.forEach(msg => {
      const date = fmtDate(msg.timestamp)
      const last = groups[groups.length - 1]
      if (last && last.date === date) { last.msgs.push(msg) }
      else { groups.push({ date, msgs: [msg] }) }
    })
    return groups
  }, [threadMessages])

  const totalUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0)

  if (!isOpen) return null

  return (
    <div className="mt-overlay" onClick={() => { onClose(); setActiveJobId(''); setView('LIST') }}>
      <div className="mt-card" onClick={e => e.stopPropagation()}>

        {/* ═══════════════════ LIST VIEW ═══════════════════ */}
        {view === 'LIST' && (
          <div className="mt-list-view">
            <div className="mt-header">
              <div className="mt-header-info">
                <div className="mt-badge">Dispatch Comms</div>
                <h2 className="mt-title">Messages {totalUnread > 0 && <span className="mt-total-unread">{totalUnread}</span>}</h2>
              </div>
              <div className="mt-header-actions">
                <div className={`mt-conn conn-${connStatus}`} title={connStatus}>
                  <div className="mt-conn-dot" />
                  <span>{connStatus === 'connected' ? 'LIVE' : connStatus === 'connecting' ? '…' : 'OFFLINE'}</span>
                </div>
                <button className="mt-close" onClick={onClose}>×</button>
              </div>
            </div>

            <div className="mt-thread-list">
              {sortedConversations.map(thread => {
                const unread = unreadMap[thread.id] || 0
                const isOnline = !thread.isBroadcast && onlineSet.has(thread.id)
                const isTyping = !!typingThreads[thread.id]
                const last = thread.lastMsg

                return (
                  <div 
                    key={thread.id} 
                    className={`mt-thread-item ${unread > 0 ? 'mt-unread-active' : ''}`} 
                    onClick={() => openThread(thread.id)}
                  >
                    <div className={`mt-avatar ${thread.isBroadcast ? 'mt-avatar-bcast' : ''} ${isOnline ? 'mt-avatar-online' : ''}`}>
                      {thread.isBroadcast ? '📢' : thread.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="mt-thread-body">
                      <div className="mt-thread-top">
                        <span className="mt-thread-name">{thread.name}</span>
                        {last && <span className="mt-thread-time">{fmtTime(last.timestamp)}</span>}
                      </div>
                      <div className="mt-thread-bottom">
                        {isTyping ? (
                          <span className="mt-typing-preview">typing…</span>
                        ) : (
                          <span className="mt-thread-preview">
                            {last
                              ? `${last.sender === myId ? 'You: ' : (last.type === 'BROADCAST') ? last.senderName + ': ' : ''}${last.body.substring(0, 38)}${last.body.length > 38 ? '…' : ''}`
                              : <span className="mt-empty-preview">{thread.isBroadcast ? 'Announcements for all staff' : 'Start a conversation'}</span>}
                          </span>
                        )}
                        {unread > 0 && <span className="mt-unread-pill">{unread}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════ THREAD VIEW ═══════════════════ */}
        {view === 'THREAD' && (
          <div className="mt-thread-view">
            <div className="mt-header mt-header-thread">
              <button className="mt-back" onClick={() => setView('LIST')}>
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="mt-thread-avatar-sm">
                {selectedThread === 'all'
                  ? '📢'
                  : (staffMap.get(selectedThread)?.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="mt-header-info">
                <div className="mt-badge">{selectedThread === 'all' ? 'Broadcast' : 'Private'}</div>
                <h2 className="mt-title-sm">{getThreadName(selectedThread)}</h2>
                {selectedThread !== 'all' && (
                  <div className="mt-online-status">
                    {typingThreads[selectedThread]
                      ? <span className="mt-typing-label">typing…</span>
                      : onlineSet.has(selectedThread)
                        ? <><span className="mt-status-dot online" />Online</>
                        : <><span className="mt-status-dot" />Offline</>}
                  </div>
                )}
              </div>
              <div className="mt-header-actions-sm">
                <div className={`mt-conn conn-${connStatus}`} title={connStatus}>
                  <div className="mt-conn-dot" />
                </div>
                <button className="mt-close" onClick={onClose}>×</button>
              </div>
            </div>

            <div className="mt-messages" ref={scrollRef}>
              {threadMessages.length === 0 && (
                <div className="mt-empty-thread">
                  <div className="mt-empty-icon">💬</div>
                  <p>No messages yet.</p>
                  <p className="mt-empty-sub">Send the first message to start the conversation.</p>
                </div>
              )}

              {groupedMessages.map(group => (
                <div key={group.date}>
                  <div className="mt-date-divider"><span>{group.date}</span></div>
                  {group.msgs.map(msg => {
                    const isMe = String(msg.sender).trim() === myId
                    const isBcast = String(msg.recipientId).trim() === 'all'
                    return (
                      <div key={msg._id} className={`mt-msg-row ${isMe ? 'me' : 'them'} ${isBcast ? 'bcast' : ''}`}>
                        {!isMe && (
                          <div className="mt-msg-avatar">{msg.senderName.charAt(0).toUpperCase()}</div>
                        )}
                        <div className="mt-msg-group">
                          {!isMe && <div className="mt-msg-sender">{msg.senderName}</div>}
                          <div className={`mt-bubble ${isMe ? 'mt-bubble-me' : 'mt-bubble-them'} ${isBcast ? 'mt-bubble-bcast' : ''}`}>
                            {msg.body}
                            {msg.jobId && (
                              <div className="mt-job-tag">
                                <svg width="9" height="9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                </svg>
                                Job #{String(msg.jobId).substring(18).toUpperCase()}
                              </div>
                            )}
                            <div className="mt-bubble-meta">
                              <span className="mt-bubble-time">{fmtTime(msg.timestamp)}</span>
                              {isMe && <span className="mt-tick">✓✓</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              {typingThreads[selectedThread] && (
                <div className="mt-msg-row them">
                  <div className="mt-msg-avatar">
                    {typingThreads[selectedThread].charAt(0).toUpperCase()}
                  </div>
                  <div className="mt-bubble mt-bubble-them mt-typing-bubble">
                    <span /><span /><span />
                  </div>
                </div>
              )}
            </div>

            <form className="mt-footer" onSubmit={handleSend}>
              <input
                className="mt-input"
                type="text"
                placeholder={connStatus === 'connected' ? `Message ${getThreadName(selectedThread)}…` : 'Reconnecting…'}
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                disabled={connStatus !== 'connected'}
                autoFocus
              />
              <button
                type="submit"
                className="mt-send"
                disabled={connStatus !== 'connected' || !input.trim()}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
