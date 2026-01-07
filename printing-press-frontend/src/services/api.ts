import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || ''
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

export const fetchDispatchJobs = async (status: string = 'active') => {
  const res = await api.get(`/api/dispatch/jobs?status=${status}`)
  return res.data
}

export const fetchCashierJobs = async () => {
  const res = await api.get('/api/cashier/jobs')
  return res.data
}

export const fetchAdminJobs = async () => {
  const res = await api.get('/api/admin/jobs')
  return res.data
}

export const fetchCustomerJobs = async (status: string = 'active') => {
  const res = await api.get(`/api/customer/jobs?status=${status}`)
  return res.data
}