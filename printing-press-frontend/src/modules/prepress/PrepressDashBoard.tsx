import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UserMenu from '../../components/UserMenu'
import ModuleNavigation from '../../components/ModuleNavigation'
import './PrepressDashboard.css'
import { fetchPrepressJobs } from '../../services/api'
import { useQuery } from '@tanstack/react-query'
type Job = {
  jobId: string
  customerName: string
  customerPhone?: string
  totalItems: number
  paymentStatus: string
  createdAt: string
  itemScreenshots: string[]
}


const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

import DateFilter from '../../components/DateFilter'

// ... existing imports

export default function PrepressDashboard() {
  const {
    data: jobs = [],
    isLoading,
  } = useQuery<Job[]>({
    queryKey: ['prepress-jobs'],
    queryFn: fetchPrepressJobs,
    refetchInterval: 5000,
  })

  const [previewJob, setPreviewJob] = useState<Job | null>(null)
  const [viewImage, setViewImage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]) // Default Today

  const navigate = useNavigate()



  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.jobId.toLowerCase().includes(search.toLowerCase()) ||
      job.customerName.toLowerCase().includes(search.toLowerCase())
    const matchesPayment = paymentFilter === 'ALL' || job.paymentStatus === paymentFilter

    // Date Filtering
    const jobDate = new Date(job.createdAt).toISOString().split('T')[0]
    const matchesDate = !dateFilter || jobDate === dateFilter

    return matchesSearch && matchesPayment && matchesDate
  })

  if (isLoading) return <div className="prepress-page">Loading...</div>

  return (
    <div className="prepress-page">
      <div className="prepress-navbar">
        <div className="prepress-navbar-left">
          <h1 className="prepress-title">Prepress</h1>
          <button
            onClick={() => navigate('/prepress/create')}
            className="btn-primary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
          >
            + NEW JOB
          </button>
        </div>

        <div className="prepress-navbar-right">
          <ModuleNavigation />
          <UserMenu />
        </div>
      </div>

      {/* Premium Filter Bar */}
      <div className="prepress-filters-bar">
        <div className="filter-group">
          <DateFilter value={dateFilter} onChange={setDateFilter} />
          <div className="search-wrapper">
            <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search Job ID or Customer..."
              className="filter-input search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="dropdown-wrapper">
            <select
              className="filter-select"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as any)}
            >
              <option value="ALL">Payment: All</option>
              <option value="UNPAID">Unpaid Only</option>
              <option value="PAID">Paid Only</option>
            </select>
          </div>
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
                <span>{previewJob.customerName} {previewJob.customerPhone && `(${previewJob.customerPhone})`}</span>
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
                  className={`status-badge ${previewJob.paymentStatus === 'PAID' || previewJob.paymentStatus === 'ADMIN_APPROVED'
                    ? 'status-paid'
                    : 'status-unpaid'
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
                        onClick={() => setViewImage(`${BACKEND_URL}/${path.replace(/\\/g, '/')}`)}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No screenshots uploaded.</p>
              )}
            </div>

            <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
              <button className="btn-secondary" onClick={() => setPreviewJob(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Payment</th>
              <th>Created</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredJobs.map((job) => (
              <tr key={job.jobId}>
                <td>{job.jobId}</td>
                <td>{job.customerName}</td>
                <td>{job.totalItems}</td>
                <td>
                  <span className={`status-badge ${job.paymentStatus === 'PAID' || job.paymentStatus === 'ADMIN_APPROVED' ? 'status-paid' : 'status-unpaid'}`}>
                    {job.paymentStatus}
                  </span>
                </td>
                <td>{new Date(job.createdAt).toLocaleDateString()}</td>
                <td className="actions-cell">
                  <div className="actions-wrapper">
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setPreviewJob(job)}
                    >
                      View
                    </button>
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => navigate(`/prepress/edit/${job.jobId}`)}
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lightbox Modal */}
      {viewImage && (
        <div
          className="lightbox-modal"
          onClick={() => setViewImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
          }}
        >
          <div className="lightbox-content" style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={viewImage}
              alt="Preview"
              className="lightbox-img"
              style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px' }}
            />
            <button
              className="lightbox-close-btn"
              onClick={() => setViewImage(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '-10px',
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '32px', height: '32px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
