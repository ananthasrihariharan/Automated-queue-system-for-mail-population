import { api } from './api'

export const queueApi = {
  // ── Staff Endpoints ────────────────────────────────
  startSession: async () => {
    const res = await api.post('/api/queue/start-session')
    return res.data
  },

  getStaffList: async () => {
    const res = await api.get('/api/queue/staff-list')
    return res.data
  },

  endSession: async () => {
    const res = await api.post('/api/queue/end-session')
    return res.data
  },

  getCurrentJob: async () => {
    const res = await api.get('/api/queue/current-job')
    return res.data
  },

  completeJob: async (jobId: string) => {
    const res = await api.post(`/api/queue/complete-job/${jobId}`)
    return res.data
  },

  requestWalkin: async (description: string) => {
    const res = await api.post('/api/queue/walkin-request', { description })
    return res.data
  },

  getSessionStatus: async () => {
    const res = await api.get('/api/queue/session-status')
    return res.data
  },

  sendHeartbeat: async () => {
    const res = await api.post('/api/queue/heartbeat')
    return res.data
  },

  toggleQueuePause: async (isPaused: boolean) => {
    const res = await api.post('/api/queue/session/toggle-pause', { isPaused })
    return res.data
  },

  getMyJobsToday: async () => {
    const res = await api.get('/api/queue/my-jobs-today')
    return res.data
  },

  pauseJob: async (jobId: string) => {
    const res = await api.post(`/api/queue/jobs/${jobId}/pause`)
    return res.data
  },

  resumeJob: async (jobId: string) => {
    const res = await api.post(`/api/queue/jobs/${jobId}/resume`)
    return res.data
  },

  tagJobComplexity: async (jobId: string, complexityTag: string) => {
    const res = await api.patch(`/api/queue/jobs/${jobId}/complexity`, { complexityTag })
    return res.data
  },

  requestReassignment: async (data: { jobId: string, reason: string, notes?: string }) => {
    const res = await api.post('/api/queue/reassign-request', data)
    return res.data
  },

  getThreadHistory: async (threadId: string) => {
    const res = await api.get(`/api/admin/queue/threads/${threadId}`)
    return res.data
  },

  getEventLog: async (limit: number = 50) => {
    const res = await api.get(`/api/admin/reports/queue-event-log?limit=${limit}`)
    return res.data
  },

  // ── Admin Endpoints ────────────────────────────────
  getAdminJobs: async (params: { status?: string, page?: number, search?: string, assignedTo?: string } = {}) => {
    const query = new URLSearchParams()
    if (params.status) query.append('status', params.status)
    if (params.page) query.append('page', String(params.page))
    if (params.search) query.append('search', params.search)
    if (params.assignedTo) query.append('assignedTo', params.assignedTo)
    
    const res = await api.get(`/api/admin/queue/jobs?${query.toString()}`)
    return res.data
  },

  getRequests: async () => {
    const res = await api.get('/api/admin/queue/requests')
    return res.data
  },

  handleRequest: async (requestId: string, data: { decision: 'APPROVED' | 'REJECTED', adminAction?: string, targetStaffId?: string }) => {
    const res = await api.post(`/api/admin/queue/requests/${requestId}/handle`, data)
    return res.data
  },

  getAdminSessions: async () => {
    const res = await api.get('/api/admin/queue/sessions')
    return res.data
  },

  getPrepressStaff: async () => {
    const res = await api.get('/api/admin/queue/staff')
    return res.data
  },

  updatePriority: async (jobId: string, data: { priorityScore: number, dueBy?: string }) => {
    const res = await api.patch(`/api/admin/queue/jobs/${jobId}/priority`, data)
    return res.data
  },

  reorderQueue: async (jobId: string, data: { queuePosition: number, priorityScore?: number }) => {
    const res = await api.patch(`/api/admin/queue/jobs/${jobId}/reorder`, data)
    return res.data
  },

  pinJob: async (jobId: string, staffId: string) => {
    const res = await api.patch(`/api/admin/queue/jobs/${jobId}/pin`, { staffId })
    return res.data
  },

  unpinJob: async (jobId: string) => {
    const res = await api.patch(`/api/admin/queue/jobs/${jobId}/unpin`)
    return res.data
  },

  reassignJob: async (jobId: string, data: { toStaffId: string, notes: string }) => {
    const res = await api.patch(`/api/admin/queue/jobs/${jobId}/reassign`, data)
    return res.data
  },

  getWalkinRequests: async (status: string = 'PENDING') => {
    const res = await api.get(`/api/admin/queue/walkin-requests?status=${status}`)
    return res.data
  },

  approveWalkin: async (requestId: string, data: { assignToStaffId?: string, adminAction?: string }) => {
    const res = await api.patch(`/api/admin/queue/walkin-requests/${requestId}/approve`, data)
    return res.data
  },

  rejectWalkin: async (requestId: string, data: { adminAction: string }) => {
    const res = await api.patch(`/api/admin/queue/walkin-requests/${requestId}/reject`, data)
    return res.data
  },

  tagComplexity: async (jobId: string, complexityTag: string) => {
    const res = await api.patch(`/api/admin/queue/jobs/${jobId}/complexity`, { complexityTag })
    return res.data
  },

  getCustomerPreferences: async () => {
    const res = await api.get('/api/admin/queue/customer-preferences')
    return res.data
  },

  deleteJob: async (jobId: string) => {
    const res = await api.delete(`/api/admin/queue/jobs/${jobId}`)
    return res.data
  },

  bulkDeleteJobs: async (jobIds: string[]) => {
    const res = await api.post('/api/admin/queue/jobs/bulk-delete', { jobIds })
    return res.data
  },

  getQueueStats: async () => {
    const res = await api.get('/api/admin/queue/stats')
    return res.data
  },

  getPoolSize: async () => {
    const res = await api.get('/api/queue/pool-size')
    return res.data
  },

  restoreJob: async (jobId: string) => {
    const res = await api.patch(`/api/admin/queue/jobs/${jobId}/restore`)
    return res.data
  },

  bulkRestoreJobs: async (jobIds: string[]) => {
    const res = await api.post('/api/admin/queue/jobs/bulk-restore', { jobIds })
    return res.data
  },

  bulkUpdateStatus: async (jobIds: string[], status: string) => {
    const res = await api.post('/api/admin/queue/jobs/bulk-status', { jobIds, status })
    return res.data
  },

  getStaffLeaderboard: async () => {
    const res = await api.get('/api/admin/queue/stats/staff-leaderboard')
    return res.data
  }
}

