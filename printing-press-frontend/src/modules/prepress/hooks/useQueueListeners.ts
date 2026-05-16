import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface UseQueueListenersProps {
  socket: any
  isActive: boolean
  staffId: string | undefined
  setHasUnread: (val: boolean) => void
  setToast: (msg: string | null) => void
  setIsSocketConnected: (val: boolean) => void
}

export const useQueueListeners = ({ 
  socket, 
  isActive, 
  staffId, 
  setHasUnread,
  setToast,
  setIsSocketConnected
}: UseQueueListenersProps) => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!socket || !isActive || !staffId) return

    socket.emit('join:staff', staffId)

    const onConnect = () => setIsSocketConnected(true)
    const onDisconnect = () => setIsSocketConnected(false)

    const handleJobAdded = () => {
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
      queryClient.invalidateQueries({ queryKey: ['general-pool'] })
    }
    const playNotificationSound = () => {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5); // A4

        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
      } catch (e) {
        console.warn('Could not play notification sound', e);
      }
    };

    const handleJobRemoved = (data?: any) => {
      // If a held job was taken by another staff, show a specific notification
      if (data?.reason === 'taken_by_other_staff') {
        setToast(data.message || '⚠️ One of your held jobs was taken by another staff member.')
        playNotificationSound();
      }
      queryClient.setQueryData(['current-queue-job'], (prev: any) => ({
        ...(prev || {}),
        queueJob: null,
        active: true
      }))
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
    }
    const handleRefresh = () => {
      queryClient.invalidateQueries({ queryKey: ['current-queue-job'] })
      queryClient.invalidateQueries({ queryKey: ['queue-session-status'] })
    }
    const handleNewMessage = (payload: any) => {
      // Local chat sync
      if (String(payload.sender).trim() !== String(staffId).trim()) {
         setHasUnread(true)
      }
    }

    const onJobAssigned = (data: any) => {
      // 1. Update the primary slots
      queryClient.setQueryData(['current-queue-job'], (prev: any) => {
        if (!prev) return prev;
        const next = {
          ...prev, 
          active: true,
          [data.slot === 'walkin' ? 'walkinJob' : 'queueJob']: data.job
        };

        // 2. Also ensure it's added to the activeBatch if it belongs there
        if (next.queueJob?.customerEmail && data.job?.customerEmail === next.queueJob.customerEmail) {
          const batch = [...(next.activeBatch || [])];
          if (!batch.find((j: any) => j._id === data.job._id)) {
            batch.push(data.job);
          }
          next.activeBatch = batch;
        }
        
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
    }

    const onJobPinned = (data: any) => {
      setToast(data.message || 'A new job was pinned to your queue.');
      queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] })
    }

    const onBatchNewJob = (data: any) => {
      setToast(data.message || 'New job added to your current batch!');
      queryClient.setQueryData(['current-queue-job'], (prev: any) => {
        if (!prev) return prev;
        const batch = [...(prev.activeBatch || [])];
        if (!batch.find(j => j._id === data.job._id)) {
           batch.push(data.job);
        }
        return { ...prev, activeBatch: batch };
      });
    }

    socket.on('connect',        onConnect)
    socket.on('disconnect',     onDisconnect)
    socket.on('job:added',      handleJobAdded)
    socket.on('job:assigned',   onJobAssigned)
    socket.on('job:removed',    handleJobRemoved)
    socket.on('job:completed',  handleRefresh)
    socket.on('job:restored',   handleRefresh)
    socket.on('job:paused',     handleRefresh)
    socket.on('job:resumed',    handleRefresh)
    socket.on('job:pinned',     onJobPinned)
    socket.on('batch:new-job',  onBatchNewJob)
    socket.on('session:updated', handleRefresh)
    socket.on('message:new',    handleNewMessage)
    socket.on('chat:received',  handleNewMessage)
    socket.on('walkin:requested', handleRefresh)
    socket.on('reassign:requested', handleRefresh)

    return () => {
      socket.off('connect',        onConnect)
      socket.off('disconnect',     onDisconnect)
      socket.off('job:added',      handleJobAdded)
      socket.off('job:assigned',   onJobAssigned)
      socket.off('job:removed',    handleJobRemoved)
      socket.off('job:completed',  handleRefresh)
      socket.off('job:restored',   handleRefresh)
      socket.off('job:paused',     handleRefresh)
      socket.off('job:resumed',    handleRefresh)
      socket.off('job:pinned',     onJobPinned)
      socket.off('batch:new-job',  onBatchNewJob)
      socket.off('session:updated', handleRefresh)
      socket.off('message:new',    handleNewMessage)
      socket.off('chat:received',  handleNewMessage)
      socket.off('walkin:requested', handleRefresh)
      socket.off('reassign:requested', handleRefresh)
    }
  }, [socket, isActive, staffId, queryClient, setHasUnread, setToast, setIsSocketConnected])
}
