import axios from 'axios'

const isProduction = import.meta.env.PROD
export const api = axios.create({
  baseURL: isProduction ? '' : (import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || ''),
  withCredentials: true
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
export const fetchPrepressJobs = async () => {
  const res = await api.get('/api/prepress/jobs')
  return res.data
}

export const fetchDispatchJobs = async (status: string = 'active', page: number = 1, limit: number = 50, date: string = '') => {
  const res = await api.get(`/api/dispatch/jobs?status=${status}&page=${page}&limit=${limit}&date=${date}`)
  return res.data
}

export const fetchCashierJobs = async () => {
  const res = await api.get('/api/cashier/jobs')
  return res.data
}

export const fetchAdminJobs = async (date: string = '') => {
  const res = await api.get(`/api/admin/jobs?date=${date}`)
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