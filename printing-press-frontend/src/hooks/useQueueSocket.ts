import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const resolveUserIdFromToken = (): string => {
  try {
    const token = localStorage.getItem('token')
    if (!token) return ''
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    )
    const payload = JSON.parse(jsonPayload)
    const rawId = payload.userId || payload.id || payload._id || payload.sub || payload.customerId || ''
    return String(rawId).trim().toLowerCase()
  } catch {
    return ''
  }
}

export const useQueueSocket = (role: 'staff' | 'admin', userIdProp?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  // Use a state for the resolved ID to trigger emissions correctly
  const [resolvedId, setResolvedId] = useState<string>(String(userIdProp || resolveUserIdFromToken()).trim().toLowerCase())

  useEffect(() => {
    const freshId = String(userIdProp || resolveUserIdFromToken()).trim().toLowerCase()
    if (freshId && freshId !== resolvedId) setResolvedId(freshId)
  }, [userIdProp])

  useEffect(() => {
    const newSocket = io('/', {
      withCredentials: true,
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      timeout: 20000
    })

    newSocket.on('connect_error', (err) => {
      console.error('[Socket] CONNECTION ERROR:', err.message)
    })

    const joinRooms = (sock: Socket) => {
      const id = String(resolvedId).trim().toLowerCase()
      console.log(`[Socket] Joining as ${role} uid=${id} sid=${sock.id}`)
      if (role === 'staff' && id) {
        sock.emit('join:staff', id)
      } else if (role === 'admin') {
        sock.emit('join:admin', id || null)
      }
    }

    newSocket.on('connect', () => {
      setIsConnected(true)
      joinRooms(newSocket)
    })
    newSocket.on('reconnect', () => {
      setIsConnected(true)
      joinRooms(newSocket)
    })
    newSocket.on('disconnect', () => setIsConnected(false))

    setSocket(newSocket)

    return () => {
      newSocket.disconnect()
    }
  }, [role]) 

  // Core Fix: Re-emit join events if the ID becomes available AFTER connection
  useEffect(() => {
    if (isConnected && socket && resolvedId) {
       console.log(`[Socket] Re-syncing rooms for ${role} uid=${resolvedId}`)
       if (role === 'staff') socket.emit('join:staff', resolvedId)
       else if (role === 'admin') socket.emit('join:admin', resolvedId)
    }
  }, [socket, isConnected, resolvedId, role])

  const on = (event: string, callback: (data: any) => void) => {
    socket?.on(event, callback)
  }

  const off = (event: string, callback?: (data: any) => void) => {
    if (callback) socket?.off(event, callback)
    else socket?.off(event)
  }

  return { socket, on, off }
}
