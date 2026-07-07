import axios from 'axios'

const isProduction = import.meta.env.PROD
export const api = axios.create({
  // In dev: use empty baseURL so Vite proxy handles /api/* → localhost:66
  // In prod: also empty so Express serves both frontend and API on the same port
  baseURL: isProduction ? '' : '',
  withCredentials: true
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
export const fetchPrepressJobs = async (
  page: number = 1, 
  limit: number = 50, 
  search: string = '', 
  paymentStatus: string = 'ALL', 
  date: string = ''
) => {
  const res = await api.get(`/api/prepress/jobs?page=${page}&limit=${limit}&search=${search}&paymentStatus=${paymentStatus}&date=${date}`)
  return res.data
}

export const fetchDispatchJobs = async (status: string = 'active', page: number = 1, limit: number = 50, date: string = '', search: string = '') => {
  const res = await api.get(`/api/dispatch/jobs?status=${status}&page=${page}&limit=${limit}&date=${date}&search=${search}`)
  return res.data
}

export const fetchCashierJobs = async (
  page: number = 1, 
  limit: number = 50,
  search: string = '',
  paymentStatus: string = 'ALL',
  hideDispatched: boolean = true,
  date: string = ''
) => {
  const res = await api.get(`/api/cashier/jobs?page=${page}&limit=${limit}&search=${search}&paymentStatus=${paymentStatus}&hideDispatched=${hideDispatched}&date=${date}`)
  return res.data
}

export const fetchAdminJobs = async (
  date: string = '',
  page: number = 1,
  limit: number = 50,
  search: string = '',
  paymentStatus: string = 'ALL',
  status: string = 'ALL',
  process: string = 'ALL',
  hideDispatched: boolean = false,
  submittedBy: string = ''
) => {
  const res = await api.get(`/api/admin/jobs?date=${date}&page=${page}&limit=${limit}&search=${search}&paymentStatus=${paymentStatus}&status=${status}&process=${process}&hideDispatched=${hideDispatched}&submittedBy=${submittedBy}`)
  return res.data
}

export const fetchStaffProductivity = async (
  role: string = 'PREPRESS',
  timeframe: string = 'today',
  month?: string,
  startDate?: string,
  endDate?: string
) => {
  const params = new URLSearchParams({ role, timeframe });
  if (month) params.append('month', month);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const res = await api.get(`/api/admin/reports/staff-productivity?${params.toString()}`)
  return res.data
}

export const fetchActivityJournal = async (date: string = '') => {
  const res = await api.get(`/api/admin/reports/activity-journal?date=${date}`)
  return res.data
}

export const fetchCustomerJobs = async (status: string = 'active') => {
  const res = await api.get(`/api/customer/jobs?status=${status}`)
  return res.data
}

export const fetchProfile = async () => {
  // Manually setting x-auth-token to be safe, though interceptor sets Authorization
  const token = localStorage.getItem('token')
  const res = await api.get('/api/profile', { headers: { 'x-auth-token': token } })
  return res.data
}

export const updateProfile = async (data: any) => {
  const token = localStorage.getItem('token')
  const res = await api.patch('/api/profile', data, { headers: { 'x-auth-token': token } })
  return res.data
}

export const changePassword = async (data: any) => {
  const token = localStorage.getItem('token')
  const res = await api.patch('/api/profile/password', data, { headers: { 'x-auth-token': token } })
  return res.data
}

export const fetchJobStatus = async (jobId: string) => {
  const res = await api.get(`/api/prepress/jobs/${jobId}/status`)
  return res.data
}

export const fetchProductionTimings = async () => {
  const res = await api.get('/api/admin/production-timings')
  return res.data
}

export const updateProductionTimings = async (timings: Record<string, number>) => {
  const res = await api.put('/api/admin/production-timings', timings)
  return res.data
}

// ── Process registry (admin-configurable products / workflow stages) ──────────
export const fetchProducts = async (): Promise<{ id: string; name: string; template?: string; openingDirection?: string; bindingSide?: string; bindingMargin?: number }[]> => {
  const res = await api.get('/api/admin/products')
  return res.data
}

export const fetchProcessRegistry = async () => {
  const res = await api.get('/api/admin/process-registry')
  return res.data
}

export const updateProcessRegistry = async (patch: Record<string, unknown>) => {
  const res = await api.put('/api/admin/process-registry', patch)
  return res.data
}

export const addProduct = async (
  name: string,
  productId?: string,
  template?: string,
  openingDirection?: string,
  bindingSide?: string,
  bindingMargin?: number
) => {
  const res = await api.post('/api/admin/products', {
    name,
    productId,
    template,
    openingDirection,
    bindingSide,
    bindingMargin
  })
  return res.data
}

export const deleteProduct = async (name: string) => {
  const res = await api.delete(`/api/admin/products/${encodeURIComponent(name)}`)
  return res.data
}

export const recordPostPressTaskStart = async (jobId: string, taskType: string, itemIndex: number) => {
  const res = await api.post(`/api/post-press/jobs/${jobId}/task-start`, { taskType, itemIndex })
  return res.data
}

export const recordFinishingTaskStart = async (jobId: string, taskType: string, itemIndex: number) => {
  const res = await api.post(`/api/finishing/jobs/${jobId}/task-start`, { taskType, itemIndex })
  return res.data
}

// ─── Press ───────────────────────────────────────────────────────────────────
export const fetchPressJobs = async (page = 1, limit = 50, date = '', search = '') => {
  const res = await api.get(`/api/press/jobs?page=${page}&limit=${limit}&date=${date}&search=${search}`)
  return res.data
}

export const fetchPressHistory = async (page = 1, limit = 50, date = '', search = '') => {
  const res = await api.get(`/api/press/jobs/history?page=${page}&limit=${limit}&date=${date}&search=${search}`)
  return res.data
}

export const confirmPressItem = async (jobId: string, itemIndex: number) => {
  const res = await api.patch(`/api/press/jobs/${jobId}/confirm-item?item_index=${itemIndex}`)
  return res.data
}

// ─── Post Press ───────────────────────────────────────────────────────────────
export const fetchIncomingPostPressJobs = async (page = 1, limit = 50, date = '', search = '') => {
  const res = await api.get(`/api/post-press/incoming?page=${page}&limit=${limit}&date=${date}&search=${search}`)
  return res.data
}

export const fetchPostPressJobs = async (page = 1, limit = 50, date = '', search = '', taskType = 'all') => {
  const res = await api.get(`/api/post-press/jobs?page=${page}&limit=${limit}&date=${date}&search=${search}&taskType=${taskType}`)
  return res.data
}

export const fetchPostPressHistory = async (page = 1, limit = 50, date = '', search = '', taskType = 'all') => {
  const res = await api.get(`/api/post-press/jobs/history?page=${page}&limit=${limit}&date=${date}&search=${search}&taskType=${taskType}`)
  return res.data
}

export const completePostPressTask = async (jobId: string, taskType: string, itemIndex?: number, rollCode?: string) => {
  const params = new URLSearchParams({ task_type: taskType })
  if (itemIndex !== undefined) params.append('item_index', String(itemIndex))
  if (rollCode !== undefined && rollCode) params.append('roll_code', rollCode)
  const res = await api.patch(`/api/post-press/jobs/${jobId}/complete-task?${params}`)
  return res.data
}

// ─── Finishing ────────────────────────────────────────────────────────────────
export const fetchIncomingFinishingJobs = async (page = 1, limit = 50, date = '', search = '', taskType = 'all') => {
  const res = await api.get(`/api/finishing/incoming?page=${page}&limit=${limit}&date=${date}&search=${search}&taskType=${taskType}`)
  return res.data
}

export const fetchFinishingJobs = async (page = 1, limit = 50, date = '', search = '', taskType = 'all') => {
  const res = await api.get(`/api/finishing/jobs?page=${page}&limit=${limit}&date=${date}&search=${search}&taskType=${taskType}`)
  return res.data
}

export const fetchFinishingHistory = async (page = 1, limit = 50, date = '', search = '', taskType = 'all') => {
  const res = await api.get(`/api/finishing/jobs/history?page=${page}&limit=${limit}&date=${date}&search=${search}&taskType=${taskType}`)
  return res.data
}

export const completeFinishingTask = async (jobId: string, itemIndex?: number, taskType = 'cutting') => {
  const params = new URLSearchParams({ task_type: taskType })
  if (itemIndex !== undefined) params.append('item_index', String(itemIndex))
  const res = await api.patch(`/api/finishing/jobs/${jobId}/complete-task?${params}`)
  return res.data
}

export const fetchJobTimeLog = async (jobId: string) => {
  const res = await api.get(`/api/admin/jobs/${jobId}/time-log`)
  return res.data
}

export const fetchProductionWorkloads = async () => {
  const res = await api.get('/api/admin/reports/production-workloads')
  return res.data
}

export const fetchProductionJournal = async (date: string = '', module: string = '') => {
  const res = await api.get(`/api/admin/reports/production-journal?date=${date}&module=${module}`)
  return res.data
}

export const fetchStaffJobs = async (
  staffId: string,
  role: string = 'PREPRESS',
  timeframe: string = 'today',
  month?: string,
  startDate?: string,
  endDate?: string
) => {
  const params = new URLSearchParams({ staffId, role, timeframe })
  if (month) params.append('month', month)
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  const res = await api.get(`/api/admin/reports/staff-jobs?${params.toString()}`)
  return res.data
}

export const fetchLaminationProducts = async () => {
  const res = await api.get('/api/admin/lamination-products')
  return res.data
}

export const createLaminationProduct = async (data: { laminationType: string; type: string; month: string; year: string; count?: number }) => {
  const res = await api.post('/api/admin/lamination-products', data)
  return res.data
}

export const toggleLaminationProductAvailability = async (id: string | number, isAvailable: boolean) => {
  const res = await api.patch(`/api/admin/lamination-products/${id}`, { isAvailable })
  return res.data
}

export const deleteLaminationProduct = async (id: string | number) => {
  const res = await api.delete(`/api/admin/lamination-products/${id}`)
  return res.data
}

export const fetchLaminationRollUsageReport = async () => {
  const res = await api.get('/api/admin/reports/lamination-roll-usage')
  return res.data
}

export const fetchAvailableLaminationRolls = async () => {
  const res = await api.get('/api/post-press/lamination-products/available')
  return res.data
}

// ─── Board Master (UPS calculator) ─────────────────────────────────────────────
export type BoardSheet = { id?: number; name: string; width: number; height: number; qty?: number }
export type Board = {
  id: number;
  productId?: string;
  originalName?: string;
  name: string;
  masterSize?: string;
  storingSize?: string;
  mediaBehavior: string;
  sheets: BoardSheet[];
}

export const fetchBoards = async (): Promise<Board[]> => {
  const res = await api.get('/api/boards')
  return res.data
}

export const createBoard = async (data: Partial<Board>) => {
  const res = await api.post('/api/boards', data)
  return res.data
}

export const updateBoard = async (id: number, data: Partial<Board>) => {
  const res = await api.put(`/api/boards/${id}`, data)
  return res.data
}

export const deleteBoard = async (id: number) => {
  const res = await api.delete(`/api/boards/${id}`)
  return res.data
}

// ─── Printable margin (company-wide UPS setting) ───────────────────────────────
export const fetchPrintableMargin = async (): Promise<number> => {
  const res = await api.get('/api/admin/printable-margin')
  return Number(res.data?.printableMargin ?? 5)
}

export const updatePrintableMargin = async (printableMargin: number) => {
  const res = await api.put('/api/admin/printable-margin', { printableMargin })
  return res.data
}

// ─── Machine Master ──────────────────────────────────────────────────────────
export type Machine = { id: number; name: string; printableMargin: number }

export const fetchMachines = async (): Promise<Machine[]> => {
  const res = await api.get('/api/machines')
  return res.data
}

export const createMachine = async (data: { name: string; printableMargin: number }) => {
  const res = await api.post('/api/machines', data)
  return res.data
}

export const updateMachine = async (id: number, data: { name?: string; printableMargin?: number }) => {
  const res = await api.put(`/api/machines/${id}`, data)
  return res.data
}

export const deleteMachine = async (id: number) => {
  const res = await api.delete(`/api/machines/${id}`)
  return res.data
}

