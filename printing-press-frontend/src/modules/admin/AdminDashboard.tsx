import { useState } from 'react'
import { api } from '../../services/api'
import EmployeeManager from './EmployeeManager'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import ModuleNavigation from '../../components/ModuleNavigation'
import './AdminDashboard.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdminJobs } from '../../services/api'

type Job = {
  jobId: string
  customerName: string
  paymentStatus: string
  jobStatus: string
  adminApprovalNote?: string
  createdBy?: { name: string }
  paymentHandledBy?: { name: string }
  dispatchedBy?: { name: string }
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [activeTab, setActiveTab] = useState<'jobs' | 'employees'>('jobs')
  const [note, setNote] = useState<Record<string, string>>({})

  const { data: jobs = [], isLoading: loading } = useQuery<Job[]>({
    queryKey: ['admin-jobs'],
    queryFn: fetchAdminJobs,
    refetchInterval: 5000,
    enabled: activeTab === 'jobs',
  })

  const queryClient = useQueryClient()

  const approve = async (jobId: string) => {
    await api.patch(`/api/admin/jobs/${jobId}/approve-dispatch`, {
      note: note[jobId]
    })
    queryClient.invalidateQueries({ queryKey: ['admin-jobs'] })
  }

  return (
    <div className="admin-page">
      <div className="admin-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1 style={{ fontWeight: 900, fontSize: '1.5rem', textTransform: 'uppercase', letterSpacing: '-0.05em' }}>Admin</h1>
          <div className="dashboard-tabs" style={{ marginBottom: 0 }}>
            <button
              onClick={() => setActiveTab('jobs')}
              className={`dashboard-tab ${activeTab === 'jobs' ? 'active' : ''}`}
            >
              Jobs
            </button>
            <div style={{ width: '2px', height: '1.5rem', background: '#e5e7eb' }}></div>
            <button
              onClick={() => setActiveTab('employees')}
              className={`dashboard-tab ${activeTab === 'employees' ? 'active' : ''}`}
            >
              Employees
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <ModuleNavigation />
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="logout-btn"
          >
            Logout
          </button>
        </div>
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'jobs' && (
        <>
          {loading ? (
            <div className="dispatch-loading">
              <div className="dispatch-spinner"></div>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Customer</th>
                  <th>Submitted By</th>
                  <th>Payment By</th>
                  <th>Dispatched By</th>
                  <th>Payment</th>
                  <th>Admin Note</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobId} className="admin-row">
                    <td>{job.jobId}</td>
                    <td>{job.customerName}</td>
                    <td style={{ fontSize: '0.8rem', color: '#4b5563' }}>{job.createdBy?.name || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#4b5563' }}>{job.paymentHandledBy?.name || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#4b5563' }}>{job.dispatchedBy?.name || '—'}</td>
                    <td>
                      <span className={`status-badge ${(job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED') ? 'status-paid' : 'status-unpaid'}`}>
                        {job.paymentStatus}
                      </span>
                    </td>

                    <td>
                      {job.paymentStatus === 'UNPAID' ? (
                        <input
                          className="form-input"
                          style={{ width: '100%' }}
                          placeholder="Approval note"
                          onChange={(e) =>
                            setNote({
                              ...note,
                              [job.jobId]: e.target.value
                            })
                          }
                        />
                      ) : (
                        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          {job.adminApprovalNote || '—'}
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      {job.paymentStatus === 'UNPAID' ? (
                        <button
                          className="btn-primary"
                          onClick={() => approve(job.jobId)}
                        >
                          Approve Dispatch
                        </button>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {activeTab === 'employees' && <EmployeeManager />}
    </div>
  )
}
