import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import ModuleNavigation from '../../components/ModuleNavigation'
import './PrepressDashboard.css'

type Job = {
  jobId: string
  customerName: string
  totalItems: number
  paymentStatus: string
  createdAt: string
  itemScreenshots: string[]
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

export default function PrepressDashboard() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [previewJob, setPreviewJob] = useState<Job | null>(null)

  const { logout } = useAuth()
  const navigate = useNavigate()

  const loadJobs = async () => {
    const res = await api.get('/api/prepress/jobs')
    setJobs(res.data)
    setLoading(false)
  }

  useEffect(() => {
    loadJobs()
  }, [])

  if (loading) return <div className="prepress-page">Loading...</div>

  return (
    <div className="prepress-page">
      <div className="prepress-header">
        <div className="flex items-center gap-4">
          <h1>Prepress Dashboard</h1>
          <a href="/prepress/create" className="btn-primary">
            + Create Job
          </a>
        </div>

        <div className="flex items-center gap-4">
          <ModuleNavigation />
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="logout-btn ml-2"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {previewJob && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Job Details: {previewJob.jobId}</h2>
              <button className="close-btn" onClick={() => setPreviewJob(null)}>
                &times;
              </button>
            </div>

            <div className="job-info-grid">
              <div>
                <p>Customer</p>
                <span>{previewJob.customerName}</span>
              </div>
              <div>
                <p>Total Items</p>
                <span>{previewJob.totalItems}</span>
              </div>
              <div>
                <p>Created At</p>
                <span>{new Date(previewJob.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <p>Payment Status</p>
                <span
                  className={`badge ${previewJob.paymentStatus === 'PAID'
                    ? 'badge-paid'
                    : previewJob.paymentStatus === 'ADMIN_APPROVED'
                      ? 'badge-admin'
                      : 'badge-unpaid'
                    }`}
                >
                  {previewJob.paymentStatus}
                </span>
              </div>
            </div>

            <div>
              <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                Item Screenshots ({previewJob.itemScreenshots.length})
              </h3>
              {previewJob.itemScreenshots.length > 0 ? (
                <div className="screenshots-grid">
                  {previewJob.itemScreenshots.map((path, idx) => (
                    <div key={idx} className="screenshot-item">
                      <img
                        src={`${BACKEND_URL}/${path.replace(/\\/g, '/')}`}
                        alt={`Item ${idx + 1}`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No screenshots uploaded.</p>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setPreviewJob(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <table className="jobs-table">
        <thead>
          <tr>
            <th>Job ID</th>
            <th>Customer</th>
            <th>Items</th>
            <th>Payment</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {jobs.map((job) => (
            <tr key={job.jobId}>
              <td>{job.jobId}</td>
              <td>{job.customerName}</td>
              <td>{job.totalItems}</td>
              <td>{job.paymentStatus}</td>
              <td>{new Date(job.createdAt).toLocaleDateString()}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="btn-secondary" onClick={() => setPreviewJob(job)}>
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
